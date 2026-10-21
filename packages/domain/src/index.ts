import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma, type PrismaClient, type Prisma } from '@babiespicks/db';
import { DomainError } from './errors';
import { schemas, type ActorContext, type ToolName } from './contracts';
import { wrapAffiliateUrl } from './prices';
export { DomainError } from './errors';
export { TOOL_DEFINITIONS, type ActorContext } from './contracts';
export { selectLatestPrices, wrapAffiliateUrl, resolvePurchaseTarget } from './prices';
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function stable(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash=(v:unknown)=>createHash('sha256').update(stable(v)).digest('hex');
function requirePublish(actor:ActorContext){if(!actor.canPublish)throw new DomainError('PUBLISH_FORBIDDEN','Owner publishing authorization required')}
function makeSlug(name:string){return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,160)||'item'}
const productInclude={translations:true,specs:true,reviewSummary:true,verdict:true} as const;
const contentInclude={translations:true} as const;
function editorialPermission(old:{publishStatus:string},args:Record<string,any>,actor:ActorContext){
  if(old.publishStatus==='PUBLISHED'){
    requirePublish(actor);
    if(args.allowPublishedEdit!==true)throw new DomainError('CONFIRMATION_REQUIRED','Published edits are immediately public; set allowPublishedEdit:true');
  }
}
async function revision(tx:Prisma.TransactionClient,entityType:string,record:any,action:string,actor:ActorContext){
  await tx.contentRevision.create({data:{entityType,entityId:record.id,version:record.version,action,snapshot:json(record),actorId:actor.id}});
}
function uniqueLocales(translations:Array<{locale:string}>|undefined){
  if(translations&&new Set(translations.map(t=>t.locale)).size!==translations.length)throw new DomainError('INVALID_INPUT','Duplicate translation locale');
}
async function writeProduct(tx:Prisma.TransactionClient,a:any,actor:ActorContext,update:boolean){
  uniqueLocales(a.translations);
  if((a.verdict||a.reviewSummary)&&!a.sources?.length)throw new DomainError('INVALID_INPUT','Editorial review data requires sources');
  const data:any={};
  for(const field of ['name','brand','imageUrl','categoryId','sources'])if(a[field]!==undefined)data[field]=a[field];
  let id=a.id;
  if(update){
    const old=await tx.product.findUnique({where:{id}});
    if(!old)throw new DomainError('NOT_FOUND','Product not found');
    editorialPermission(old,a,actor);
    const changed=await tx.product.updateMany({where:{id,version:a.expectedVersion},data:{...data,version:{increment:1}}});
    if(changed.count!==1)throw new DomainError('VERSION_CONFLICT','Read the current product before retrying');
  }else{
    const created=await tx.product.create({data:{...data,slug:a.slug??makeSlug(a.name),publishStatus:'DRAFT',isActive:false,status:'DISCOVERED'}});id=created.id;
  }
  if(a.translations||!update){
    const translations=a.translations??[{locale:'ar',name:a.name}];
    for(const t of translations){
      await tx.productTranslation.upsert({where:{productId_locale:{productId:id,locale:t.locale}},create:{...t,productId:id,slug:makeSlug(t.name)},update:{...t}});
    }
  }
  if(a.specs){await tx.productSpec.deleteMany({where:{productId:id}});if(a.specs.length)await tx.productSpec.createMany({data:a.specs.map((s:any)=>({...s,productId:id}))})}
  if(a.verdict){
    const v=a.verdict;
    const weighted=Math.round((v.safetyScore*.25+v.qualityScore*.25+v.reviewsScore*.2+v.priceScore*.15+v.longTermScore*.15)*10)/10;
    const type=weighted>=7.5?'WORTH_IT':weighted>=6?'WORTH_IT_WITH':weighted>=4.5?'WAIT':'NOT_WORTH_IT';
    if(Math.abs(weighted-v.overallScore)>.11||v.type!==type)throw new DomainError('INVALID_INPUT','Verdict must match weighted scores and thresholds');
    const visible=(await tx.product.findUniqueOrThrow({where:{id}})).publishStatus==='PUBLISHED';
    await tx.verdict.upsert({where:{productId:id},create:{...v,productId:id,overallScore:weighted,isPublished:visible},update:{...v,overallScore:weighted,isPublished:visible}});
  }
  if(a.reviewSummary)await tx.productReviewSummary.upsert({where:{productId:id},create:{...a.reviewSummary,productId:id},update:a.reviewSummary});
  const saved=await tx.product.findUniqueOrThrow({where:{id},include:productInclude});
  await revision(tx,'product',saved,update?'updated':'created',actor);
  return saved;
}
async function writeContent(tx:Prisma.TransactionClient,a:any,actor:ActorContext,update:boolean){
  uniqueLocales(a.translations);
  const data:any={};for(const field of ['type','categoryId','imageUrl','productIds','sources'])if(a[field]!==undefined)data[field]=a[field];
  if(a.productIds?.length){const count=await tx.product.count({where:{id:{in:a.productIds}}});if(count!==new Set(a.productIds).size)throw new DomainError('INVALID_INPUT','Unknown related product')}
  let id=a.id;
  if(update){
    const old=await tx.contentPage.findUnique({where:{id}});if(!old)throw new DomainError('NOT_FOUND','Content not found');editorialPermission(old,a,actor);
    const changed=await tx.contentPage.updateMany({where:{id,version:a.expectedVersion},data:{...data,version:{increment:1}}});
    if(changed.count!==1)throw new DomainError('VERSION_CONFLICT','Read current content before retrying');
  }else{
    const saved=await tx.contentPage.create({data:{...data,slug:a.slug??makeSlug(a.translations[0].title),publishStatus:'DRAFT'}});id=saved.id;
  }
  if(a.translations)for(const t of a.translations)await tx.contentPageTranslation.upsert({where:{contentPageId_locale:{contentPageId:id,locale:t.locale}},create:{...t,contentPageId:id},update:t});
  const saved=await tx.contentPage.findUniqueOrThrow({where:{id},include:contentInclude});
  await revision(tx,'content',saved,update?'updated':'created',actor);return saved;
}
async function setStatus(tx:Prisma.TransactionClient,a:any,actor:ActorContext){
  // All explicit visibility/status transitions are owner-authorized, including unpublishing.
  requirePublish(actor);
  const product=a.entityType==='product';
  const old:any=product?await tx.product.findUnique({where:{id:a.id},include:productInclude}):await tx.contentPage.findUnique({where:{id:a.id},include:contentInclude});
  if(!old)throw new DomainError('NOT_FOUND','Content not found');
  if(old.version!==a.expectedVersion)throw new DomainError('VERSION_CONFLICT','Read the current version before changing status');
  if(a.status==='PUBLISHED'){
    if(!old.translations.length)throw new DomainError('INVALID_INPUT','A translation is required for publication');
    if(!product){
      if(old.translations.some((t:any)=>!t.title.trim()||!t.content.trim()))throw new DomainError('INVALID_INPUT','Title and body required');
      const count=await tx.product.count({where:{id:{in:old.productIds},publishStatus:'PUBLISHED'}});
      if(count!==new Set(old.productIds).size)throw new DomainError('INVALID_INPUT','Related products must be published first');
    }
  }
  if(old.publishStatus===a.status)return old;
  const data:any={publishStatus:a.status,version:{increment:1},publishedAt:a.status==='PUBLISHED'?(old.publishedAt??new Date()):old.publishedAt};
  if(product){data.isActive=a.status==='PUBLISHED';data.status=a.status==='PUBLISHED'?'ACTIVE':'INACTIVE'}
  else{data.isPublished=a.status==='PUBLISHED';data.status=a.status==='PUBLISHED'?'PUBLISHED':a.status==='REVIEW'?'PENDING_APPROVAL':'DRAFT'}
  const result=product?await tx.product.updateMany({where:{id:a.id,version:a.expectedVersion},data}):await tx.contentPage.updateMany({where:{id:a.id,version:a.expectedVersion},data});
  if(result.count!==1)throw new DomainError('VERSION_CONFLICT','Concurrent content update');
  if(product)await tx.verdict.updateMany({where:{productId:a.id},data:{isPublished:a.status==='PUBLISHED'}});
  const saved=product?await tx.product.findUniqueOrThrow({where:{id:a.id},include:productInclude}):await tx.contentPage.findUniqueOrThrow({where:{id:a.id},include:contentInclude});
  await revision(tx,a.entityType,saved,a.status.toLowerCase(),actor);return saved;
}
async function uploadImage(a:any){
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.base64))throw new DomainError('INVALID_INPUT','Raw canonical base64 required');
  const bytes=Buffer.from(a.base64,'base64');
  if(bytes.length>1024*1024||bytes.length<12)throw new DomainError('INVALID_INPUT','Image must be between 12 bytes and 1MB');
  const ok=a.mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):a.mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!ok)throw new DomainError('INVALID_INPUT','Image signature does not match MIME');
  const ext=a.mimeType==='image/png'?'png':a.mimeType==='image/jpeg'?'jpg':'webp';
  const file=`${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
  const root=process.env.MEDIA_ROOT;if(!root)throw new DomainError('CONFIGURATION_REQUIRED','MEDIA_ROOT is not configured');
  await mkdir(root,{recursive:true});await writeFile(join(root,file),bytes,{flag:'w'});return {path:`/media/${file}`,mimeType:a.mimeType,bytes:bytes.length,public:true};
}
async function mutate(tx:Prisma.TransactionClient,name:ToolName,a:any,actor:ActorContext):Promise<unknown>{
  switch(name){
    case 'bp_create_product':return writeProduct(tx,a,actor,false);
    case 'bp_update_product':return writeProduct(tx,a,actor,true);
    case 'bp_create_content':return writeContent(tx,a,actor,false);
    case 'bp_update_content':return writeContent(tx,a,actor,true);
    case 'bp_set_status':return setStatus(tx,a,actor);
    case 'bp_record_price':{
      const product=await tx.product.findUnique({where:{id:a.productId}});if(!product)throw new DomainError('NOT_FOUND','Product not found');
      if(product.publishStatus==='PUBLISHED')requirePublish(actor);
      const store=await tx.store.findUnique({where:{id:a.storeId}});if(!store)throw new DomainError('NOT_FOUND','Store not found');
      wrapAffiliateUrl(a.sourceUrl,store.slug,process.env,store);
      const at=new Date(a.checkedAt);if(at.getTime()>Date.now()+60000)throw new DomainError('INVALID_INPUT','Observation date is in the future');
      return tx.productPrice.create({data:{productId:a.productId,storeId:a.storeId,price:a.amount,currency:a.currency,url:a.sourceUrl,inStock:a.inStock,scrapedAt:at}});
    }
    case 'bp_upsert_store':{
      requirePublish(actor);const {id,idempotencyKey,...data}=a;
      const existing=id?await tx.store.findUnique({where:{id}}):await tx.store.findUnique({where:{slug:a.slug}});
      if(id&&!existing)throw new DomainError('NOT_FOUND','Store not found');
      return existing?tx.store.update({where:{id:existing.id},data}):tx.store.create({data});
    }
    case 'bp_upsert_category':{
      requirePublish(actor);const {id,idempotencyKey,...data}=a;
      const existing=id?await tx.category.findUnique({where:{id}}):await tx.category.findUnique({where:{slug:a.slug}});
      if(id&&!existing)throw new DomainError('NOT_FOUND','Category not found');
      if(existing&&a.parentId===existing.id)throw new DomainError('INVALID_INPUT','Category cannot be its own parent');
      return existing?tx.category.update({where:{id:existing.id},data}):tx.category.create({data});
    }
    case 'bp_upsert_coupon':{
      requirePublish(actor);const {id,idempotencyKey,...data}=a;
      if(data.validFrom)data.validFrom=new Date(data.validFrom);if(data.validUntil)data.validUntil=new Date(data.validUntil);
      if(data.validFrom&&data.validUntil&&data.validFrom>data.validUntil)throw new DomainError('INVALID_INPUT','Invalid coupon date range');
      return id?tx.coupon.update({where:{id},data}):tx.coupon.create({data});
    }
    case 'bp_upload_image':return uploadImage(a);
    default:throw new DomainError('NOT_FOUND','Unknown mutation');
  }
}
export async function executeTool(name:string,input:unknown,actor:ActorContext,db:PrismaClient=prisma):Promise<any>{
  if(!actor?.id)throw new DomainError('UNAUTHORIZED','Actor required');
  if(!(name in schemas))throw new DomainError('NOT_FOUND','Unknown tool');
  const schema=schemas[name as ToolName];const parsed=schema.safeParse(input);
  if(!parsed.success)throw new DomainError('INVALID_INPUT',parsed.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '));
  const a:any=parsed.data;
  if(name==='bp_get_capabilities')return {publishing:{allowed:actor.canPublish},states:['DRAFT','REVIEW','PUBLISHED','ARCHIVED'],publicMedia:true,priceFreshnessHours:48};
  if(name==='bp_list_products')return db.product.findMany({where:a.status?{publishStatus:a.status}:{},include:productInclude,take:a.limit,skip:a.offset,orderBy:{createdAt:'desc'}});
  if(name==='bp_get_product'){const p=await db.product.findUnique({where:{id:a.id},include:{...productInclude,prices:{include:{store:true},orderBy:{scrapedAt:'desc'},take:100}}});if(!p)throw new DomainError('NOT_FOUND','Product not found');return p}
  if(name==='bp_list_content')return db.contentPage.findMany({where:a.status?{publishStatus:a.status}:{},include:contentInclude,take:a.limit,skip:a.offset,orderBy:{createdAt:'desc'}});
  if(name==='bp_get_content'){const c=await db.contentPage.findUnique({where:{id:a.id},include:contentInclude});if(!c)throw new DomainError('NOT_FOUND','Content not found');return c}
  if(name==='bp_list_stores')return db.store.findMany({take:a.limit,skip:a.offset,orderBy:{name:'asc'}});
  if(name==='bp_list_categories')return db.category.findMany({take:a.limit,skip:a.offset,orderBy:{order:'asc'}});
  if(name==='bp_list_coupons')return db.coupon.findMany({where:a.storeId?{storeId:a.storeId}:{},include:{store:true},take:a.limit,skip:a.offset,orderBy:{createdAt:'desc'}});
  if(name==='bp_get_click_stats'){
    const since=new Date(Date.now()-a.days*86400000);const where={createdAt:{gte:since},...(a.productId?{productId:a.productId}:{})};
    const [totalClicks,byStore,byProduct]=await Promise.all([db.affiliateClick.count({where}),db.affiliateClick.groupBy({by:['storeId'],where,_count:{id:true}}),db.affiliateClick.groupBy({by:['productId'],where,_count:{id:true},orderBy:{_count:{id:'desc'}},take:50})]);
    return {totalClicks,byStore,byProduct,since:since.toISOString(),conversionTrackingAvailable:false};
  }
  const key=hash({actor:actor.id,name,key:a.idempotencyKey});const inputHash=hash(a);
  const existing=await db.operationReceipt.findUnique({where:{key}});
  if(existing){if(existing.inputHash!==inputHash)throw new DomainError('IDEMPOTENCY_CONFLICT','Operation key reused with different input');
    // A successful old receipt must never bypass a later revocation of publishing rights.
    if(['bp_set_status','bp_upsert_store','bp_upsert_category','bp_upsert_coupon'].includes(name))requirePublish(actor);
    return existing.result;
  }
  try{return await db.$transaction(async tx=>{
    const result=await mutate(tx,name as ToolName,a,actor);
    const serialized=json(result);await tx.operationReceipt.create({data:{key,inputHash,result:serialized}});return serialized;
  },{timeout:15000})}catch(error:any){
    if(error instanceof DomainError){
      if(error.code==='VERSION_CONFLICT'){
        // A matching in-flight retry may have lost the CAS after the original committed.
        const receipt=await db.operationReceipt.findUnique({where:{key}});
        if(receipt){if(receipt.inputHash!==inputHash)throw new DomainError('IDEMPOTENCY_CONFLICT','Operation key reused with different input');return receipt.result}
      }
      throw error;
    }
    if(error?.code==='P2002'){
      const receipt=await db.operationReceipt.findUnique({where:{key}});
      if(receipt){if(receipt.inputHash!==inputHash)throw new DomainError('IDEMPOTENCY_CONFLICT','Operation key reused with different input');return receipt.result}
      throw new DomainError('INVALID_INPUT','A record with this identity already exists');
    }
    if(error?.code==='P2025')throw new DomainError('NOT_FOUND','Record not found');
    if(error?.code==='P2003')throw new DomainError('INVALID_INPUT','Referenced record does not exist');
    throw error;
  }
}
