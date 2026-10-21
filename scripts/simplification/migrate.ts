import type { PrismaClient, Prisma } from '@babiespicks/db';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export interface MigrationReport {
  applied:boolean; counts:Record<string,number>; conflicts:Array<{type:string;id:string;reason:string}>;
  pendingWork:{contentPages:number;socialPosts:number;articleDrafts:number;scheduledJobs:number};
}
/** One-time, additive data conversion. Mapping markers prevent repeat runs from undoing later editorial changes. */
export async function migrateLegacy(db:PrismaClient,{apply=false}:{apply?:boolean}={}):Promise<MigrationReport>{
 const [products,pages,offers,drafts,articles,contentDrafts,subscribers,socialPosts,scheduledJobs]=await Promise.all([
  db.product.findMany({include:{translations:true}}),db.contentPage.findMany({include:{translations:true}}),
  db.publicOffer.findMany(),db.productDraft.findMany(),db.articleDraft.findMany(),db.contentDraft.findMany(),
  db.agentJob.findMany({where:{agentName:'newsletter-subscribe'}}),
  db.socialPost.count({where:{status:{in:['SCHEDULED','PUBLISHING','APPROVED']}}}),db.scheduledJob.count({where:{status:'ACTIVE'}}),
 ]);
 const report:MigrationReport={applied:apply,counts:{products:products.length,contentPages:pages.length,publicOffers:offers.length,productDrafts:drafts.length,articleDrafts:articles.length,contentDrafts:contentDrafts.length,newsletterRecords:subscribers.length},conflicts:[],pendingWork:{contentPages:pages.filter(p=>p.status==='SCHEDULED').length,socialPosts,articleDrafts:articles.filter(a=>a.status==='SCHEDULED').length,scheduledJobs}};
 // No emails, bodies, secrets or subscriber identifiers in reports.
 for(const p of pages)if(p.isPublished!==(p.status==='PUBLISHED'))report.conflicts.push({type:'contentPage',id:p.id,reason:'Legacy isPublished and status differ; legacy public visibility is authoritative'});
 for(const o of offers){const existing=pages.find(p=>p.slug===o.slug);if(existing){const map=await db.legacyMapping.findUnique({where:{legacyType_legacyId:{legacyType:'publicOffer',legacyId:o.id}}});if(!map||map.targetId!==existing.id)report.conflicts.push({type:'publicOffer',id:o.id,reason:'Slug collides with an existing content page; must resolve before import'})}}
 if(!apply)return report;
 if(report.conflicts.some(c=>c.type==='publicOffer'))throw new Error('Public offer slug collision; inspect dry-run conflicts before applying');
 await db.$transaction(async tx=>{
  async function mapped(type:string,id:string){return tx.legacyMapping.findUnique({where:{legacyType_legacyId:{legacyType:type,legacyId:id}}})}
  async function mark(type:string,id:string,targetType:string,targetId:string){await tx.legacyMapping.create({data:{legacyType:type,legacyId:id,targetType,targetId}})}
  async function snapshot(type:string,record:any){
   const old=await tx.contentRevision.findUnique({where:{entityType_entityId_version:{entityType:type,entityId:record.id,version:record.version}}});
   if(!old)await tx.contentRevision.create({data:{entityType:type,entityId:record.id,version:record.version,action:'migrated',snapshot:json(record),actorId:'legacy-migration'}});
  }
  for(const p of products){
   if(await mapped('product',p.id))continue;
   if(await tx.contentRevision.findFirst({where:{entityType:'product',entityId:p.id}}))continue;
   // Legacy list visibility is isActive; preserve it without inferring from pipeline status.
   const record=await tx.product.update({where:{id:p.id},data:{publishStatus:p.isActive?'PUBLISHED':'ARCHIVED'}});
   await mark('product',p.id,'product',p.id);await snapshot('product',record);
  }
  for(const p of pages){
   if(await mapped('contentPage',p.id))continue;
   if(await tx.contentRevision.findFirst({where:{entityType:'content',entityId:p.id}}))continue;
   const status=p.isPublished?'PUBLISHED':p.status==='DRAFT'?'DRAFT':'REVIEW';
   const record=await tx.contentPage.update({where:{id:p.id},data:{publishStatus:status}});
   await mark('contentPage',p.id,'content',p.id);await snapshot('content',record);
  }
  for(const o of offers){
   if(await mapped('publicOffer',o.id))continue;
   const page=await tx.contentPage.create({data:{type:'OFFER',slug:o.slug,isPublished:o.status==='PUBLISHED',publishStatus:o.status==='PUBLISHED'?'PUBLISHED':'ARCHIVED',status:o.status==='PUBLISHED'?'PUBLISHED':'DRAFT',publishedAt:o.publishedAt,createdAt:o.createdAt,translations:{create:{locale:'ar',title:o.title,content:o.body,metaTitle:o.seoTitle,metaDescription:o.seoDescription}}}});
   await mark('publicOffer',o.id,'content',page.id);await snapshot('content',page);
  }
  for(const d of drafts){
   if(await mapped('productDraft',d.id))continue;
   // Only exact source identity is a match, never similar titles.
   const existing=d.canonicalUrl?await tx.product.findUnique({where:{sourceUrl:d.canonicalUrl}}):null;
   if(existing){await mark('productDraft',d.id,'product',existing.id);continue}
   const slug=`legacy-product-${d.id.toLowerCase()}`;
   const p=await tx.product.create({data:{name:d.title,slug,imageUrl:d.imageUrl,isActive:false,status:'DISCOVERED',publishStatus:d.status==='ARCHIVED'?'ARCHIVED':d.status==='REJECTED'?'DRAFT':'REVIEW',sources:d.sourceUrl?[{url:d.sourceUrl,checkedAt:d.createdAt.toISOString(),field:'legacy-source',note:'Imported legacy source; facts require verification'}]:undefined,translations:{create:{locale:'ar',name:d.title,description:d.description,slug}}}});
   await mark('productDraft',d.id,'product',p.id);await snapshot('product',p);
  }
  for(const a of articles){
   if(await mapped('articleDraft',a.id))continue;
   if(a.contentPageId){await mark('articleDraft',a.id,'content',a.contentPageId);continue}
   const existing=await tx.contentPage.findUnique({where:{slug:a.slug},include:{translations:true}});
   if(existing){
     // Keep a separate editable draft rather than overwrite the final content version.
     const preserved=await tx.contentPage.create({data:{slug:`legacy-article-${a.id.toLowerCase()}`,type:a.type,publishStatus:'REVIEW',translations:{create:{locale:a.locale==='en'?'en':'ar',title:a.title,content:a.content??''}}}});
     await mark('articleDraft',a.id,'content',preserved.id);await snapshot('content',preserved);continue;
   }
   const c=existing??await tx.contentPage.create({data:{slug:a.slug,type:a.type,publishStatus:a.status==='REJECTED'?'DRAFT':'REVIEW',isPublished:false,productIds:a.productIds.filter(id=>products.some(p=>p.id===id)),createdAt:a.createdAt}});
   if(!existing)await tx.contentPageTranslation.create({data:{contentPageId:c.id,locale:a.locale==='en'?'en':'ar',title:a.title,content:a.content??''}});
   else await tx.contentPageTranslation.create({data:{contentPageId:c.id,locale:a.locale==='en'?'en':'ar',title:a.title,content:a.content??''}});
   await mark('articleDraft',a.id,'content',c.id);await snapshot('content',c);
  }
  for(const d of contentDrafts){
   if(await mapped('contentDraft',d.id))continue;
   const slug=`legacy-content-${d.id.toLowerCase()}`;
   const c=await tx.contentPage.create({data:{slug,type:d.contentType==='article'?'BUYING_GUIDE':'OFFER',publishStatus:'DRAFT',isPublished:false,translations:{create:{locale:'ar',title:d.title??'مسودة مستوردة',content:d.body??''}}}});
   await mark('contentDraft',d.id,'content',c.id);await snapshot('content',c);
  }
  for(const j of subscribers){
   if(await mapped('newsletterJob',j.id))continue;
   const input=j.input as Record<string,unknown>|null;
   if(!input||typeof input.email!=='string'||!/^\S+@\S+\.\S+$/.test(input.email))continue;
   const email=input.email.trim().toLowerCase();
   const saved=await tx.newsletterSubscriber.upsert({where:{email},create:{email,name:typeof input.name==='string'?input.name:undefined,locale:input.locale==='en'?'en':'ar',createdAt:j.createdAt},update:{}});
   await mark('newsletterJob',j.id,'newsletterSubscriber',saved.id);
  }
 },{timeout:120000});
 return report;
}
