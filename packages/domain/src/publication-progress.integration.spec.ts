import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PrismaClient} from '@babiespicks/db';
import {getPublicationProgress} from './publication-progress';
const url=process.env.TEST_DATABASE_URL;
if(url){const target=new URL(url);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||!target.pathname.endsWith('_test'))throw new Error('Local isolated test DB required');}
describe.skipIf(!url)('publication progress on real PostgreSQL',()=>{
 const db=new PrismaClient({datasources:{db:{url:url??'postgresql://postgres:test@localhost/not_connected_test'}}});
 const prefix=`progress-${randomUUID()}`;
 const now=new Date('2026-11-15T12:00:00Z');
 beforeAll(async()=>{
  for(let i=0;i<55;i++){
   const sources=[{field:'verdict',url:'https://www.amazon.sa/dp/B000000001',checkedAt:'2026-11-02T12:00:00Z'},...(i===0?[{field:'verdict',url:'https://manufacturer.test/review',checkedAt:'2026-11-02T12:00:00Z'}]:[])];
   await db.product.create({data:{id:`${prefix}-${i}`,slug:`${prefix}-${i}`,name:'Local progress fixture',isActive:true,publishStatus:'PUBLISHED',publishedAt:new Date('2026-11-03T10:00:00Z'),sources,...(i<18?{verdict:{create:{type:'WORTH_IT',overallScore:8,safetyScore:8,qualityScore:8,reviewsScore:8,priceScore:8,longTermScore:8,reasoningAr:'حقيقة اختبار محلية غير منشورة للإنتاج',reasoningEn:'Local test fixture',isPublished:true}}}:{})}});
  }
  await db.product.create({data:{slug:`${prefix}-draft`,name:'Local draft',publishStatus:'DRAFT'}});
 });
 afterAll(()=>db.$disconnect());
 it('distinguishes publication count, numeric reviews and multi-host source coverage without returning bodies',async()=>{
  const result=await getPublicationProgress(db,'2026-11',[],now);
  expect(result).toMatchObject({target:50,firstPublished:55,remaining:0,editorialReviewedFromMonth:18,multiSourceReviewedFromMonth:1,editorialReviewRemaining:49,drafts:1,publicationDateUnknown:0});
  expect(result.reviewCandidates).toHaveLength(5);
  expect(result.reviewCandidates.some(row=>row.id===`${prefix}-0`)).toBe(false);
  for(const row of result.reviewCandidates)expect(Object.keys(row).sort()).toEqual(['id','publishedAt','slug']);
  const excluded=result.reviewCandidates[0].id;
  const second=await getPublicationProgress(db,'2026-11',[excluded],now);
  expect(second.firstPublished).toBe(55);expect(second.multiSourceReviewedFromMonth).toBe(1);
  expect(second.reviewCandidates.some(row=>row.id===excluded)).toBe(false);
 });
 it('uses Riyadh month boundaries and retains first-publication counts after archival',async()=>{
  for(const [label,at] of [['before','2026-10-31T20:59:59Z'],['start','2026-10-31T21:00:00Z'],['end','2026-11-30T21:00:00Z']])await db.product.create({data:{slug:`${prefix}-${label}`,name:'Boundary fixture',publishStatus:'PUBLISHED',publishedAt:new Date(at)}});
  await db.product.update({where:{id:`${prefix}-54`},data:{publishStatus:'ARCHIVED'}});
  const result=await getPublicationProgress(db,'2026-11',[],new Date('2026-12-15T12:00:00Z'));
  expect(result.firstPublished).toBe(56);
  expect(result.currentlyPublishedFromMonth).toBe(55);
  expect((await getPublicationProgress(db,'2026-12',[],new Date('2026-12-15T12:00:00Z'))).firstPublished).toBe(1);
 });
});
