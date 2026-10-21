import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as domain from './index';
import { PrismaClient } from '@babiespicks/db';
const api = domain as any;
const now = new Date('2026-10-21T12:00:00Z');
describe('fresh purchase observations', () => {
  it('uses the latest observation before comparing stores, excluding unavailable and stale prices', () => {
    expect(typeof api.selectLatestPrices).toBe('function');
    const prices = [
      {storeId:'a',price:50,scrapedAt:'2026-10-20T12:00:00Z',inStock:true},
      {storeId:'a',price:200,scrapedAt:'2026-10-21T11:00:00Z',inStock:true},
      {storeId:'b',price:100,scrapedAt:'2026-10-21T11:00:00Z',inStock:true},
      {storeId:'c',price:10,scrapedAt:'2026-10-18T11:00:00Z',inStock:true},
      {storeId:'d',price:20,scrapedAt:'2026-10-21T11:00:00Z',inStock:false},
    ];
    expect(api.selectLatestPrices(prices, now).map((p:any)=>p.storeId)).toEqual(['b','a']);
  });
  it('wraps Amazon once and refuses unrelated or non-https destinations', () => {
    expect(typeof api.wrapAffiliateUrl).toBe('function');
    expect(api.wrapAffiliateUrl('https://www.amazon.sa/dp/X?tag=old','amazon', {AMAZON_ASSOCIATES_TAG:'test-21'})).toBe('https://www.amazon.sa/dp/X?tag=test-21');
    expect(()=>api.wrapAffiliateUrl('https://amazon.sa.evil.test/x','amazon',{})).toThrow();
    expect(()=>api.wrapAffiliateUrl('javascript:alert(1)','amazon',{})).toThrow();
  });
});
const url=process.env.TEST_DATABASE_URL;
const integration= url ? describe : describe.skip;
integration('real PostgreSQL content contract',()=>{
  const db=new PrismaClient({datasources:{db:{url:url??'postgresql://postgres:test@localhost:5432/not_connected_test'}}});
  const suffix=Date.now().toString();
  const owner={id:`test-owner-${suffix}`,canPublish:true};
  const editor={id:`test-editor-${suffix}`,canPublish:false};
  const run=(name:string,args:unknown,actor=owner)=>api.executeTool(name,args,actor,db);
  let id:string;
  beforeAll(async()=>{
    if(!new URL(url!).pathname.endsWith('_test'))throw new Error('Isolated _test database required');
    expect(typeof api.executeTool).toBe('function');
  });
  afterAll(async()=>{await db.$disconnect()});
  it('creates a draft idempotently, rejects reuse for different input',async()=>{
    const input={name:'عربة اختبار',slug:`integration-stroller-${suffix}`,idempotencyKey:'integration-create'};
    const first=await run('bp_create_product',input);
    id=first.id;
    expect(first.publishStatus).toBe('DRAFT');
    expect(first.version).toBe(1);
    expect((await run('bp_create_product',input)).id).toBe(id);
    await expect(run('bp_create_product',{...input,name:'changed'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  });
  it('allows only one concurrent writer, preserves revisions transactionally',async()=>{
    const results=await Promise.allSettled([
      run('bp_update_product',{id,expectedVersion:1,name:'first',idempotencyKey:'update-a'}),
      run('bp_update_product',{id,expectedVersion:1,name:'second',idempotencyKey:'update-b'}),
    ]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(x=>x.status==='rejected').map((x:any)=>x.reason.code)).toEqual(['VERSION_CONFLICT']);
    expect(await db.contentRevision.count({where:{entityType:'product',entityId:id}})).toBe(2);
  });
  it('denies editor publishing and explicit edits to published content, permits owner',async()=>{
    await expect(run('bp_set_status',{entityType:'product',id,status:'PUBLISHED',expectedVersion:2,confirm:true,idempotencyKey:'publish-editor'},editor)).rejects.toMatchObject({code:'PUBLISH_FORBIDDEN'});
    const published=await run('bp_set_status',{entityType:'product',id,status:'PUBLISHED',expectedVersion:2,confirm:true,idempotencyKey:'publish-owner'});
    expect(published.publishStatus).toBe('PUBLISHED');
    await expect(run('bp_update_product',{id,name:'oops',expectedVersion:3,idempotencyKey:'bad-edit'},editor)).rejects.toMatchObject({code:'PUBLISH_FORBIDDEN'});
    await expect(run('bp_update_product',{id,name:'oops',expectedVersion:3,idempotencyKey:'no-explicit'})).rejects.toMatchObject({code:'CONFIRMATION_REQUIRED'});
  });
  it('records a price without altering editorial version or verdict and keeps requested store',async()=>{
    const store=await run('bp_upsert_store',{name:'Amazon',slug:'amazon',url:'https://www.amazon.sa',affiliateNetwork:'Amazon Associates',idempotencyKey:'store-amazon'});
    await run('bp_record_price',{productId:id,storeId:store.id,amount:100,currency:'SAR',sourceUrl:'https://www.amazon.sa/dp/X',checkedAt:now.toISOString(),inStock:true,idempotencyKey:'price-a'});
    const p=await db.product.findUniqueOrThrow({where:{id}});
    expect(p.version).toBe(3);
    expect(await db.verdict.findUnique({where:{productId:id}})).toBeNull();
    expect((await api.resolvePurchaseTarget(db,{productId:id,storeId:store.id},now))?.price).toBe(100);
    expect(await api.resolvePurchaseTarget(db,{productId:id,storeId:'missing'},now)).toBeNull();
  });
  it('makes a sourced verdict added to a published product visible immediately',async()=>{
    const current=await db.product.findUniqueOrThrow({where:{id}});
    await run('bp_update_product',{id,expectedVersion:current.version,allowPublishedEdit:true,idempotencyKey:'add-verdict',sources:[{url:'https://www.amazon.sa/dp/X',checkedAt:now.toISOString(),field:'editorial'}],verdict:{type:'WORTH_IT',overallScore:8,safetyScore:8,qualityScore:8,reviewsScore:8,priceScore:8,longTermScore:8,reasoningAr:'تقييم تحريري',reasoningEn:'Editorial assessment'}});
    expect((await db.verdict.findUniqueOrThrow({where:{productId:id}})).isPublished).toBe(true);
  });
  it('returns the same saved result for overlapping retries using the same operation key',async()=>{
    const created=await run('bp_create_product',{name:'Retry test',slug:`retry-${suffix}`,idempotencyKey:'retry-create'});
    const input={id:created.id,name:'Updated once',expectedVersion:1,idempotencyKey:'same-concurrent-update'};
    const results=await Promise.allSettled([run('bp_update_product',input),run('bp_update_product',input)]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(2);
    expect(results.map((x:any)=>x.value.version)).toEqual([2,2]);
    expect(await db.contentRevision.count({where:{entityType:'product',entityId:created.id}})).toBe(2);
  });
  it('persists ordered galleries and preserves them on unrelated partial edits',async()=>{
    const imageUrls=['https://m.media-amazon.com/first.jpg','https://m.media-amazon.com/second.jpg'];
    const created=await run('bp_create_product',{name:'Gallery',slug:`gallery-${suffix}`,imageUrls,idempotencyKey:'gallery-create'});
    expect(created.imageUrls).toEqual(imageUrls);expect(created.imageUrl).toBe(imageUrls[0]);
    const updated=await run('bp_update_product',{id:created.id,expectedVersion:1,name:'Gallery renamed',idempotencyKey:'gallery-update'});
    expect(updated.imageUrls).toEqual(imageUrls);
    const cleared=await run('bp_update_product',{id:created.id,expectedVersion:2,imageUrls:[],idempotencyKey:'gallery-clear'});
    expect(cleared.imageUrls).toEqual([]);expect(cleared.imageUrl).toBe(imageUrls[0]);
  });
  it('never accepts injected actor, publication or unknown inputs from tools',async()=>{
    await expect(run('bp_create_product',{name:'fake',publishStatus:'PUBLISHED',actor:owner,idempotencyKey:'fake'},editor)).rejects.toMatchObject({code:'INVALID_INPUT'});
  });
});

describe('legacy affiliate compatibility',()=>{
 it('preserves existing known-network deep links and wraps approved merchant URLs without placeholder credentials',()=>{
  expect(api.wrapAffiliateUrl('https://arabclicks.com/click?p=123&a=456&l=https%3A%2F%2Fshop.example%2Fp','shop',{})).toContain('arabclicks.com/click');
  expect(api.wrapAffiliateUrl('https://ad.admitad.com/g/campaign/?ulp=https%3A%2F%2Fshop.example%2Fp','shop',{})).toContain('ad.admitad.com/g/campaign/');
  expect(api.wrapAffiliateUrl('https://shop.example/p','shop',{ARABCLICKS_PUBLISHER_ID:'123',ARABCLICKS_ADVERTISER_ID:'456'},{url:'https://shop.example',affiliateNetwork:'ArabClicks'})).toBe('https://arabclicks.com/click?p=123&a=456&l=https%3A%2F%2Fshop.example%2Fp');
  expect(api.wrapAffiliateUrl('https://shop.example/p','shop',{}, {url:'https://shop.example',affiliateNetwork:'Admitad'})).toBe('https://shop.example/p');
 });
});

describe('purchase store identity',()=>{
 it('rejects an Amazon URL recorded for Noon, including wrapped merchant mismatch',()=>{
  expect(()=>api.wrapAffiliateUrl('https://www.amazon.sa/dp/X','noon',{}, {url:'https://www.noon.com',affiliateNetwork:'Noon'})).toThrow();
  expect(()=>api.wrapAffiliateUrl('https://arabclicks.com/click?p=1&a=2&l=https%3A%2F%2Fwww.amazon.sa%2Fdp%2FX','noon',{}, {url:'https://www.noon.com',affiliateNetwork:'ArabClicks'})).toThrow();
 });
});
