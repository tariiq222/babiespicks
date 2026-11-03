import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {PrismaClient} from '@babiespicks/db';
import {createPublicQueries} from '../public-queries';

const testUrl=process.env.TEST_DATABASE_URL;
if(testUrl){const url=new URL(testUrl);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw new Error('Local isolated test DB required');}
describe.skipIf(!testUrl)('catalog read SQL and pages on PostgreSQL',()=>{
 const db=new PrismaClient({datasources:{db:{url:testUrl??'postgresql://postgres:test@localhost/not_connected_test'}}});
 const prefix=`catalog-${randomUUID()}`;
 const now=new Date();
 const context={locale:'en' as const,shipTo:'SA' as const,displayCurrency:'SAR' as const,budget:null,audience:'PUBLIC' as const};
 const queries=createPublicQueries(db);
 let storeId:string;
 beforeAll(async()=>{
  const store=await db.store.create({data:{name:'Isolated catalog store',slug:prefix,url:'https://amazon.sa',marketplaceCode:'SA',trackingId:'test-sa-21'}});
  storeId=store.id;
  for(let i=0;i<36;i++){
   const id=`${prefix}-${i}`;
   await db.product.create({data:{id,slug:id,name:`Local product ${i}`,brand:i===35?'UnavailableBrand':i>=30?'TailBrand':'Brand',publishStatus:'PUBLISHED',isActive:true,createdAt:new Date(now.getTime()-i*1000)}});
   await db.productPrice.create({data:{productId:id,storeId,price:String(100+i*10),currency:'SAR',url:'https://amazon.sa/dp/B000000001',scrapedAt:new Date(now.getTime()-1000),inStock:true}});
   if(i===35)await db.productPrice.create({data:{productId:id,storeId,price:'1',currency:'SAR',url:'https://amazon.sa/dp/B000000001',scrapedAt:now,inStock:false}});
  }
 });
 afterAll(()=>db.$disconnect());
 it('reads latest rows before availability and builds full-catalog facets before paging',async()=>{
  const first=await queries.getCatalogPage(context,{},null,{now});
  expect(first.items).toHaveLength(24);
  expect(first.total).toBe(35);
  expect(first.filterOptions.brands).toContain('TailBrand');
  expect(first.filterOptions.brands).not.toContain('UnavailableBrand');
  expect(first.nextCursor).toBeTruthy();
  const second=await queries.getCatalogPage(context,{},first.nextCursor,{now});
  expect(second.items).toHaveLength(11);
  expect(second.total).toBe(35);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items,...second.items].map(item=>item.product.id)).size).toBe(35);
 });
 it('applies filter and typed budget before page slicing without relabelling legacy prices',async()=>{
  const brand=await queries.getCatalogPage(context,{brand:'TailBrand'},null,{now});
  expect(brand.total).toBe(5);
  expect(brand.items.every(item=>item.product.brand==='TailBrand')).toBe(true);
  const budget=await queries.getCatalogPage({...context,budget:{amount:'150',currency:'SAR'}},{},null,{now});
  expect(budget.total).toBe(6);
  const usd=await queries.getCatalogPage({...context,displayCurrency:'USD'},{},null,{now});
  expect(usd.total).toBe(35);
  expect(usd.items.every(item=>item.legacyPrice?.currency==='SAR')).toBe(true);
  const usdBudget=await queries.getCatalogPage({...context,displayCurrency:'USD',budget:{amount:'150',currency:'USD'}},{},null,{now});
  expect(usdBudget.total).toBe(0);
 });
 it('preserves legacy for empty offer metadata but not for inactive unavailable history',async()=>{
  const productId=`${prefix}-0`;
  const listing=await db.marketplaceListing.create({data:{productId,storeId,marketplaceCode:'SA',asin:'B000000001',variantKey:'default',sourceUrl:'https://amazon.sa/dp/B000000001',identityKey:`l-${prefix}`}});
  const offer=await db.purchaseOffer.create({data:{listingId:listing.id,sellerKey:'seller',fulfillerKey:'fulfiller',condition:'NEW',audience:'PUBLIC',identityKey:`o-${prefix}`}});
  const empty=await queries.getProductOffers(productId,context,now);
  expect(empty.legacyPrice?.price).toBe(100);
  await db.offerPriceObservation.create({data:{offerId:offer.id,scopeKey:'price:SA:in-marketplace',shipTo:null,audience:'PUBLIC',amount:null,currency:null,taxBasis:'UNKNOWN',sourceId:'amazon-creators-api-sa',sourceUrl:listing.sourceUrl,availability:'UNAVAILABLE',checkedAt:new Date(now.getTime()-1000),expiresAt:new Date(now.getTime()-1),identityKey:`p-${prefix}`}});
  await db.purchaseOffer.update({where:{id:offer.id},data:{isActive:false}});
  const historical=await queries.getProductOffers(productId,context,now);
  expect(historical.legacyPrice).toBeNull();
  expect(historical.product?.prices).toEqual([]);
  const page=await queries.getCatalogPage(context,{},null,{now});
  expect(page.total).toBe(34);
  expect(page.items.some(item=>item.product.id===productId)).toBe(false);
 });
});
