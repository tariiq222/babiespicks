import {describe,expect,it,vi} from 'vitest';
const approval=vi.hoisted(()=>({enforce:false}));
vi.mock('./source-policy',async()=>{
 const actual=await vi.importActual<typeof import('./source-policy')>('./source-policy');
 return {...actual,requireEnabledSourcePolicy:(sourceId:string,marketplaceCode:string)=>approval.enforce?actual.requireEnabledSourcePolicy(sourceId,marketplaceCode):{...actual.resolveSourcePolicy(sourceId,marketplaceCode),enabled:true,status:'VERIFIED' as const}};
});
import type {PrismaClient} from '@babiespicks/db';
import {resolveOfferTarget,wrapAffiliateUrl} from './prices';
const now=new Date('2026-11-03T12:00:00Z');
const offer={id:'offer',isActive:true,sellerKey:'seller',listing:{id:'listing',sourceUrl:'https://amazon.sa/dp/B000000001',marketplaceCode:'SA',store:{slug:'amazon-sa',url:'https://amazon.sa/?tag=store-url-21',marketplaceCode:'SA',isActive:true},product:{publishStatus:'PUBLISHED',isActive:true}}};
const old={sourceId:'amazon-creators-api-sa',id:'old',offerId:'offer',scopeKey:'price:SA:in-marketplace',shipTo:null,audience:'PUBLIC',availability:'AVAILABLE',amount:'100',currency:'SAR',checkedAt:new Date('2026-11-03T11:00:00Z'),expiresAt:new Date('2026-11-03T13:00:00Z'),offer};
const dbFor=(extra:Partial<typeof old>[]=[])=>({offerPriceObservation:{findFirst:async({where,orderBy}:any)=>{
 const rows=[old,...extra.map(row=>({...old,id:'new',checkedAt:new Date('2026-11-03T11:30:00Z'),...row}))].filter(row=>Object.entries(where).every(([key,value]:any)=>value&&typeof value==='object'&&!(value instanceof Date)?Object.entries(value).every(([operator,bound]:any)=>operator==='lte'?(row as any)[key]<=bound:operator==='gt'?(row as any)[key]>bound:true):(row as any)[key]===value));
 if(orderBy)rows.sort((a,b)=>b.checkedAt.getTime()-a.checkedAt.getTime()||a.id.localeCompare(b.id));
 return rows[0]??null;
}}}) as unknown as PrismaClient;
const resolve=(db:PrismaClient)=>resolveOfferTarget(db,{offerId:'offer',observationId:'old',shipTo:'SA'},now);

describe('exact offer target observations',()=>{
 it('resolves the exact current available observation',async()=>{expect((await resolve(dbFor()))?.price).toEqual({amount:'100',currency:'SAR'});});
 it.each([
  {availability:'UNAVAILABLE'},
  {availability:'AVAILABLE',expiresAt:new Date('2026-11-03T11:45:00Z')},
  {availability:'UNKNOWN'},
 ])('refuses an old target superseded by $availability even if the newer row is not purchasable',async extra=>{expect(await resolve(dbFor([extra]))).toBeNull();});
 it('does not substitute a newer price or another seller/offer',async()=>{
  expect(await resolve(dbFor([{amount:'150'}]))).toBeNull();
  expect((await resolve(dbFor([{offerId:'other-offer',availability:'UNAVAILABLE'}])))?.observedSellerKey).toBe('seller');
 });
 it('keeps different audiences and other destinations from superseding the exact scope',async()=>{
  for(const extra of [{scopeKey:'price:SA:ship-to:US',shipTo:'US' as never},{audience:'MEMBERS'}])expect((await resolve(dbFor([{...extra,availability:'UNAVAILABLE'}])))?.price.amount).toBe('100');
 });
 it.each([
  {availability:'UNAVAILABLE'},
  {availability:'AVAILABLE',expiresAt:new Date('2026-11-03T11:45:00Z')},
 ])('refuses a general target when a preferred destination observation is $availability or expired',async extra=>{
  expect(await resolve(dbFor([{...extra,scopeKey:'price:SA:ship-to:SA',shipTo:'SA' as never}]))).toBeNull();
 });
 it('refuses a public target for the real disabled source registry',async()=>{
  approval.enforce=true;
  try{expect(await resolve(dbFor())).toBeNull();}finally{approval.enforce=false;}
 });
 it('refuses an observation attributed to a different marketplace source',async()=>{
  const db=dbFor();
  const findFirst=db.offerPriceObservation.findFirst.bind(db.offerPriceObservation);
  db.offerPriceObservation.findFirst=(async(args:any)=>{const row=await findFirst(args);return row?{...row,sourceId:'amazon-creators-api-us'}:null;}) as typeof db.offerPriceObservation.findFirst;
  expect(await resolve(db)).toBeNull();
 });
 it('uses the same deterministic ID ordering as the selection engine for timestamp ties',async()=>{
  expect(await resolve(dbFor([{id:'a-tied-new',checkedAt:old.checkedAt,availability:'UNAVAILABLE'}]))).toBeNull();
 });
});

describe('explicit store tracking identity',()=>{
 it.each([['SA','amazon.sa','store-sa-21'],['US','amazon.com','store-us-20']])('prefers the explicit %s store tracking ID over every fallback',(marketplaceCode,host,trackingId)=>{
  const url=wrapAffiliateUrl(`https://${host}/dp/X?tag=observation-tag`,'amazon',{AMAZON_ASSOCIATES_TAG:'legacy-sa-21',AMAZON_ASSOCIATES_TAG_SA:'env-sa-21',AMAZON_ASSOCIATES_TAG_US:'env-us-20'},{url:`https://${host}/?tag=store-url-tag`,marketplaceCode,trackingId:` ${trackingId} `} as any);
  expect(new URL(url).searchParams.getAll('tag')).toEqual([trackingId]);
 });
 it('does not turn an explicit US tag on an unverified legacy store into US identity',()=>{
  expect(()=>wrapAffiliateUrl('https://amazon.com/dp/X','amazon',{}, {url:'https://amazon.com',marketplaceCode:null,trackingId:'store-us-20'} as any)).toThrow(/SA marketplace only/);
 });
});
