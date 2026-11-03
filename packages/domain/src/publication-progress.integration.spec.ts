import {createHash,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PrismaClient} from '@babiespicks/db';
import {getPublicationProgress} from './publication-progress';
import {getProductSection} from './product-section';
const url=process.env.TEST_DATABASE_URL;
if(url){const target=new URL(url);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||!target.pathname.endsWith('_test'))throw new Error('Local isolated test DB required');}
describe.skipIf(!url)('daily publishing reads on real PostgreSQL',()=>{
 const db=new PrismaClient({datasources:{db:{url:url??'postgresql://postgres:test@localhost/not_connected_test'}}});
 const prefix=`progress-${randomUUID()}`;
 const now=new Date('2026-11-03T12:00:00Z');
 const description='وصف كامل 🧸 '.repeat(1500);
 beforeAll(async()=>{
  // A large monthly count must never block or substitute for the daily counter.
  for(let i=0;i<55;i++)await db.product.create({data:{id:`${prefix}-${i}`,slug:`${prefix}-${i}`,name:'Local progress fixture',isActive:true,publishStatus:'PUBLISHED',publishedAt:new Date(i<9?'2026-11-03T10:00:00Z':'2026-11-02T10:00:00Z'),sources:[{field:'verdict',url:'https://manufacturer.test/product',checkedAt:'2026-11-02T12:00:00Z'}],...(i===0?{translations:{create:{locale:'ar',name:'اختبار محلي',slug:`${prefix}-ar`,description}},verdict:{create:{type:'WORTH_IT',overallScore:8,safetyScore:8,qualityScore:8,reviewsScore:8,priceScore:8,longTermScore:8,reasoningAr:'دليل اختبار محلي',reasoningEn:'Local fixture',isPublished:true}}}:{})}});
  await db.product.create({data:{slug:`${prefix}-draft`,name:'Local draft',publishStatus:'DRAFT'}});
 });
 afterAll(()=>db.$disconnect());
 it('counts nine first publications today independently of the other46 in the month',async()=>{
  const result=await getPublicationProgress(db,undefined,now);
  expect(result).toEqual({date:'2026-11-03',timezone:'Asia/Riyadh',dailyMinimum:3,dailyMaximum:6,firstPublishedToday:9,remainingToMinimum:0,remainingCapacity:0,currentlyPublishedToday:9,publishedTotal:55,drafts:1,publicationDateUnknown:0,asOf:now.toISOString()});
  expect(result).not.toHaveProperty('month');expect(result).not.toHaveProperty('editorialReviewRemaining');
 });
 it('uses Riyadh day boundaries and never recounts an archived or republished record',async()=>{
  for(const [label,at] of [['before','2026-11-02T20:59:59Z'],['start','2026-11-02T21:00:00Z'],['end','2026-11-03T21:00:00Z']])await db.product.create({data:{slug:`${prefix}-${label}`,name:'Boundary fixture',isActive:true,publishStatus:'PUBLISHED',publishedAt:new Date(at)}});
  await db.product.update({where:{id:`${prefix}-8`},data:{publishStatus:'ARCHIVED'}});
  expect(await getPublicationProgress(db,'2026-11-03',now)).toMatchObject({firstPublishedToday:10,currentlyPublishedToday:9,remainingCapacity:0});
  await db.product.update({where:{id:`${prefix}-8`},data:{publishStatus:'PUBLISHED',version:{increment:1}}});
  expect(await getPublicationProgress(db,'2026-11-03',now)).toMatchObject({firstPublishedToday:10,currentlyPublishedToday:10});
  expect(await getPublicationProgress(db,undefined,new Date('2026-11-03T21:00:00Z'))).toMatchObject({date:'2026-11-04',firstPublishedToday:1,remainingToMinimum:2,remainingCapacity:5});
 });
 it('reconstructs the complete stored translation without exposing unrelated sections',async()=>{
  let offset=0;let text='';let version:number|undefined;let hash:string|undefined;
  while(true){
   const result=await getProductSection(db,{id:`${prefix}-0`,section:'translation',locale:'ar',offset,limit:3000,expectedVersion:version,expectedHash:hash});
   expect(Array.from(result.chunk).length).toBeLessThanOrEqual(3000);
   expect(result).not.toHaveProperty('prices');expect(result).not.toHaveProperty('sources');
   version=result.version;hash=result.sha256;text+=result.chunk;
   if(result.nextOffset===null)break;offset=result.nextOffset;
  }
  expect(JSON.parse(text).description).toBe(description);
  expect(createHash('sha256').update(text).digest('hex')).toBe(hash);
  await db.product.update({where:{id:`${prefix}-0`},data:{version:{increment:1},translations:{update:{where:{productId_locale:{productId:`${prefix}-0`,locale:'ar'}},data:{description:'Updated local fixture'}}}}});
  await expect(getProductSection(db,{id:`${prefix}-0`,section:'translation',locale:'ar',offset:1,limit:3000,expectedVersion:version,expectedHash:hash})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect(await db.product.count()).toBe(59);
 });
});
