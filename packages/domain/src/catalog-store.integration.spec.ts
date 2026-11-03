import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,it,vi} from 'vitest';
import {PrismaClient} from '@babiespicks/db';
import {executeTool} from './index';
import {resolveOfferTarget} from './prices';
import * as policies from './source-policy';

const testUrl=process.env.TEST_DATABASE_URL;
if(testUrl){const url=new URL(testUrl);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw new Error('Local isolated test DB required');}
describe.skipIf(!testUrl)('catalog store identities on PostgreSQL',()=>{
 const db=new PrismaClient({datasources:{db:{url:testUrl??'postgresql://postgres:test@localhost/not_connected_test'}}});
 const owner={id:`catalog-owner-${randomUUID()}`,canPublish:true};
 const run=(name:string,args:unknown)=>executeTool(name,args,owner,db) as Promise<any>;
 afterAll(()=>db.$disconnect());
 const key=()=>`catalog-${randomUUID()}`;
 async function fixture(){
  const prefix=key();
  const product=await run('bp_create_product',{name:'Isolated catalog product',slug:prefix,idempotencyKey:`${prefix}-p`});
  const store=await run('bp_upsert_store',{name:'SA fixture',slug:prefix,url:'https://amazon.sa',marketplaceCode:'SA',trackingId:'test-sa-21',nameAr:'متجر اختبار',nameEn:'Test store',idempotencyKey:`${prefix}-s`});
  const listingInput={productId:product.id,storeId:store.id,marketplaceCode:'SA',asin:'B000000001',variantKey:'default',sourceUrl:'https://amazon.sa/dp/B000000001'};
  return {prefix,product,store,listingInput};
 }
 it('round-trips store fields through domain tools and preserves omitted metadata/state',async()=>{
  const f=await fixture();
  await run('bp_upsert_store',{id:f.store.id,name:f.store.name,slug:f.store.slug,url:f.store.url,isActive:false,idempotencyKey:`f-${f.prefix}`});
  const updated=await run('bp_upsert_store',{id:f.store.id,name:'Renamed',slug:f.store.slug,url:f.store.url,idempotencyKey:`u-${f.prefix}`});
  expect(updated).toMatchObject({marketplaceCode:'SA',trackingId:'test-sa-21',nameAr:'متجر اختبار',nameEn:'Test store',isActive:false});
 });
 it('prevents store-market reassignment racing a listing creation',async()=>{
  const f=await fixture();
  let update!:Promise<unknown>,listing!:Promise<unknown>;
  const waits=async(count:number)=>{
   for(let attempt=0;attempt<80;attempt++){
    const rows=await db.$queryRaw<Array<{waiting:number}>>`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`;
    if(rows[0].waiting>=count)return;
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   throw new Error('Expected task-owned store lock wait did not occur');
  };
  await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "stores" WHERE "id"=${f.store.id} FOR UPDATE`;
   update=run('bp_upsert_store',{id:f.store.id,name:'US fixture',slug:f.store.slug,url:'https://amazon.com',marketplaceCode:'US',trackingId:'test-us-20',idempotencyKey:`m-${f.prefix}`});
   // Attach rejection handlers while the test deliberately holds both requests.
   void update.catch(()=>{});
   await waits(1);
   listing=run('bp_upsert_listing',{...f.listingInput,idempotencyKey:`l-${f.prefix}`});
   void listing.catch(()=>{});
   await waits(2);
  },{timeout:10000});
  const results=await Promise.allSettled([update,listing]);
  expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1);
  const store=await db.store.findUniqueOrThrow({where:{id:f.store.id}});
  const listings=await db.marketplaceListing.findMany({where:{storeId:store.id}});
  expect(listings.every(row=>row.marketplaceCode===store.marketplaceCode)).toBe(true);
 });
 it('closes exact targets on newer unavailable or preferred-destination observations',async()=>{
  const f=await fixture();
  const listing=(await run('bp_upsert_listing',{...f.listingInput,idempotencyKey:`l-${f.prefix}`})).record;
  const offer=(await run('bp_upsert_offer',{listingId:listing.id,sellerKey:'seller',fulfillerKey:'fulfiller',condition:'NEW',audience:'PUBLIC',idempotencyKey:`o-${f.prefix}`})).record;
  await run('bp_set_status',{entityType:'product',id:f.product.id,status:'PUBLISHED',expectedVersion:offer.productVersion,confirm:true,idempotencyKey:`pub-${f.prefix}`});
  const now=new Date();
  const data={offerId:offer.id,scopeKey:'price:SA:in-marketplace',shipTo:null,audience:'PUBLIC' as const,amount:'10',currency:'SAR',taxBasis:'UNKNOWN' as const,sourceId:'amazon-creators-api-sa',sourceUrl:f.listingInput.sourceUrl,availability:'AVAILABLE' as const,checkedAt:new Date(now.getTime()-2000),expiresAt:new Date(now.getTime()+60000),identityKey:`old-${f.prefix}`};
  const old=await db.offerPriceObservation.create({data});
  const input={offerId:offer.id,observationId:old.id,shipTo:'SA' as const};
  // Real canonical disabled policy must refuse the direct route as well as the reader.
  expect(await resolveOfferTarget(db,input,now)).toBeNull();
  const approved={...policies.resolveSourcePolicy('amazon-creators-api-sa','SA'),enabled:true,status:'VERIFIED' as const};
  const allow=vi.spyOn(policies,'requireEnabledSourcePolicy').mockReturnValue(approved);
  try{
   expect((await resolveOfferTarget(db,input,now))?.url).toContain('tag=test-sa-21');
   const preferred=await db.offerPriceObservation.create({data:{...data,scopeKey:'price:SA:ship-to:SA',shipTo:'SA',amount:null,currency:null,availability:'UNAVAILABLE',checkedAt:new Date(now.getTime()-1000),identityKey:`preferred-${f.prefix}`}});
   expect(await resolveOfferTarget(db,input,now)).toBeNull();
   await db.offerPriceObservation.delete({where:{id:preferred.id}});
   await db.offerPriceObservation.create({data:{...data,amount:null,currency:null,availability:'UNAVAILABLE',checkedAt:new Date(now.getTime()-1000),identityKey:`latest-${f.prefix}`}});
   expect(await resolveOfferTarget(db,input,now)).toBeNull();
  }finally{allow.mockRestore();}
 });
});
