import { describe,it,expect,afterAll } from 'vitest';
import { PrismaClient } from '@babiespicks/db';
import * as migration from './migrate';
const url=process.env.TEST_DATABASE_URL;
if(url&&!new URL(url).pathname.endsWith('_test'))throw new Error('An isolated _test database is required');
(url?describe:describe.skip)('legacy data conversion on isolated PostgreSQL',()=>{
 const db=new PrismaClient({datasources:{db:{url:url??'postgresql://localhost/not_used_test'}}});
 afterAll(()=>db.$disconnect());
 it('dry-run does not publish, apply preserves IDs and repeat does not republish an archived product',async()=>{
   expect(typeof (migration as any).migrateLegacy).toBe('function');
   const slug=`legacy-${Date.now()}`;
   const product=await db.product.create({data:{name:'Legacy stroller',slug,isActive:true,translations:{create:{locale:'ar',name:'عربة',slug}}}});
   const run=(apply:boolean)=>(migration as any).migrateLegacy(db,{apply});
   await run(false);
   expect((await db.product.findUniqueOrThrow({where:{id:product.id}})).publishStatus).toBe('DRAFT');
   await run(true);
   expect((await db.product.findUniqueOrThrow({where:{id:product.id}})).publishStatus).toBe('PUBLISHED');
   await db.product.update({where:{id:product.id},data:{publishStatus:'ARCHIVED'}});
   await run(true);
   expect((await db.product.findUniqueOrThrow({where:{id:product.id}})).publishStatus).toBe('ARCHIVED');
 });
 it('imports newsletter emails from JSON without copying subscriptions between sites',async()=>{
   const email=`legacy-${Date.now()}@example.test`;
   await db.agentJob.create({data:{agentName:'newsletter-subscribe',status:'COMPLETED',input:{email,name:'Test',locale:'ar'}}});
   await (migration as any).migrateLegacy(db,{apply:true});
   expect((await db.newsletterSubscriber.findUnique({where:{email}}))?.locale).toBe('ar');
 });
 it('preserves scheduled work without executing it and creates draft content from unfinished article',async()=>{
   const suffix=Date.now().toString();
   const draft=await db.articleDraft.create({data:{locale:'ar',type:'BUYING_GUIDE',title:'Guide',slug:`old-guide-${suffix}`,content:'A preserved guide',productIds:[],status:'SCHEDULED'}});
   const report=await (migration as any).migrateLegacy(db,{apply:true});
   const map=await db.legacyMapping.findUniqueOrThrow({where:{legacyType_legacyId:{legacyType:'articleDraft',legacyId:draft.id}}});
   const saved=await db.contentPage.findUniqueOrThrow({where:{id:map.targetId},include:{translations:true}});
   expect(saved.publishStatus).toBe('REVIEW');
   expect(saved.isPublished).toBe(false);
   expect(saved.translations[0].content).toBe('A preserved guide');
   expect(report.pendingWork.articleDrafts).toBeGreaterThan(0);
 });
});

(url?describe:describe.skip)('modern draft isolation from legacy backfill',()=>{
 const db=new PrismaClient({datasources:{db:{url:url??'postgresql://localhost/not_used_test'}}});
 afterAll(()=>db.$disconnect());
 it('does not turn a modern draft with a revision into a published legacy product',async()=>{
   const slug=`modern-${Date.now()}`;
   const p=await db.product.create({data:{name:'Modern',slug,isActive:true,publishStatus:'DRAFT'}});
   await db.contentRevision.create({data:{entityType:'product',entityId:p.id,version:1,action:'created',snapshot:{},actorId:'modern-owner'}});
   await (migration as any).migrateLegacy(db,{apply:true});
   expect((await db.product.findUniqueOrThrow({where:{id:p.id}})).publishStatus).toBe('DRAFT');
 });
});

(url?describe:describe.skip)('draft translations never become public during import',()=>{
 const db=new PrismaClient({datasources:{db:{url:url??'postgresql://localhost/not_used_test'}}});
 afterAll(()=>db.$disconnect());
 it('preserves an unapproved English article separately from published Arabic with the same slug',async()=>{
  const slug=`translation-boundary-${Date.now()}`;
  const p=await db.contentPage.create({data:{type:'BUYING_GUIDE',slug,isPublished:true,status:'PUBLISHED',publishStatus:'PUBLISHED',translations:{create:{locale:'ar',title:'منشور',content:'Published Arabic'}}}});
  const draft=await db.articleDraft.create({data:{locale:'en',slug,type:'BUYING_GUIDE',title:'Not approved',content:'SECRET DRAFT',productIds:[],status:'NEEDS_REVIEW'}});
  await (migration as any).migrateLegacy(db,{apply:true});
  const live=await db.contentPage.findUniqueOrThrow({where:{id:p.id},include:{translations:true}});
  expect(live.translations.map(t=>t.locale)).toEqual(['ar']);
  const map=await db.legacyMapping.findUniqueOrThrow({where:{legacyType_legacyId:{legacyType:'articleDraft',legacyId:draft.id}}});
  expect(map.targetId).not.toBe(p.id);
  expect((await db.contentPage.findUniqueOrThrow({where:{id:map.targetId}})).publishStatus).toBe('REVIEW');
 });
});
