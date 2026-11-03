import {createHash} from 'node:crypto';
import {DomainError} from './errors';
import {describe,expect,it} from 'vitest';
import type {PrismaClient} from '@babiespicks/db';
import {executeTool} from './index';
import {schemas} from './contracts';

const owner={id:'store-owner',canPublish:true};
const editor={id:'static:editor',canPublish:false};
type Store=Record<string,any>;
function database(initial?:Store,markets:string[]=[]){
 let current=initial?{...initial}:null;
 const receipts=new Map<string,any>();
 const writes:string[]=[];
 const db={
  store:{
   findUnique:async({where}:any)=>current&&Object.entries(where).every(([key,value])=>current![key]===value)?{...current}:null,
   create:async({data}:any)=>{writes.push('store:create');current={id:'s',isActive:true,...data};return {...current};},
   update:async({data}:any)=>{writes.push('store:update');current={...current,...data};return {...current};},
  },
  marketplaceListing:{count:async({where}:any)=>markets.filter(m=>!where.marketplaceCode||m!==where.marketplaceCode.not).length},
  operationReceipt:{findUnique:async({where}:any)=>receipts.get(where.key)??null,create:async({data}:any)=>{writes.push('receipt:create');receipts.set(data.key,data);return data;}},
  $queryRaw:async(..._args:unknown[])=>[],
  $transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn(db),
 };
 return {db:db as unknown as PrismaClient,raw:db,writes,read:()=>current};
}
const input=(extra:Store={})=>({name:'Amazon',slug:'amazon-sa',url:'https://www.amazon.sa',idempotencyKey:'store',...extra});
const existing=(extra:Store={})=>({id:'s',name:'Amazon',slug:'amazon-sa',url:'https://www.amazon.sa',marketplaceCode:'SA',trackingId:'store-sa-21',nameAr:'أمازون',nameEn:'Amazon',isActive:false,...extra});

describe('MCP marketplace store administration',()=>{
 it('accepts writable nullable identity metadata and keeps explicit publishing grants',async()=>{
  const args=input({marketplaceCode:'SA',trackingId:' scoped-sa-21 ',nameAr:' أمازون ',nameEn:' Amazon SA '});
  expect(schemas.bp_upsert_store.safeParse(args).success).toBe(true);
  const world=database();
  await expect(executeTool('bp_upsert_store',args,editor,world.db)).rejects.toMatchObject({code:'PUBLISH_FORBIDDEN'});
  expect(world.writes).toEqual([]);
  const saved=await executeTool('bp_upsert_store',args,owner,world.db);
  expect(saved).toMatchObject({marketplaceCode:'SA',trackingId:'scoped-sa-21',nameAr:'أمازون',nameEn:'Amazon SA'});
  expect(await executeTool('bp_upsert_store',args,owner,world.db)).toEqual(saved);
  expect(world.writes).toEqual(['store:create','receipt:create']);
  await expect(executeTool('bp_upsert_store',{...args,nameEn:'Different'},owner,world.db)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(executeTool('bp_upsert_store',args,editor,world.db)).rejects.toMatchObject({code:'PUBLISH_FORBIDDEN'});
 });
 it('preserves omitted metadata and inactive state while permitting explicit nullable clears',async()=>{
  const world=database(existing());
  expect(await executeTool('bp_upsert_store',input({id:'s'}),owner,world.db)).toMatchObject({marketplaceCode:'SA',trackingId:'store-sa-21',nameAr:'أمازون',nameEn:'Amazon',isActive:false});
  expect(await executeTool('bp_upsert_store',input({id:'s',marketplaceCode:null,trackingId:null,nameAr:null,nameEn:null,idempotencyKey:'clear'}),owner,world.db)).toMatchObject({marketplaceCode:null,trackingId:null,nameAr:null,nameEn:null,isActive:false});
 });
 it.each(['https://amazon.com','https://amazon.sa.evil.test','https://unverified.amazon.sa','https://amazon.sa:444'])('rejects an SA identity on %s',async url=>{
  const world=database();
  await expect(executeTool('bp_upsert_store',input({url,marketplaceCode:'SA'}),owner,world.db)).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(world.writes).toEqual([]);
 });
 it('validates the merged market when an update omits it',async()=>{
  const world=database(existing({marketplaceCode:'US',url:'https://amazon.com',trackingId:'store-us-20'}));
  await expect(executeTool('bp_upsert_store',input({id:'s'}),owner,world.db)).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(world.writes).toEqual([]);
 });
 it('rejects malformed or empty identity metadata at the strict boundary',()=>{
  for(const extra of [{marketplaceCode:'UK'},{trackingId:' '},{trackingId:'tag&other=1'},{nameAr:' '},{nameEn:'x'.repeat(201)}])expect(schemas.bp_upsert_store.safeParse(input(extra)).success).toBe(false);
 });
 it('blocks clearing or rehoming a listing-backed known market',async()=>{
  for(const marketplaceCode of [null,'US']){
   const world=database(existing(),['SA']);
   await expect(executeTool('bp_upsert_store',input({id:'s',url:marketplaceCode==='US'?'https://amazon.com':'https://amazon.sa',marketplaceCode,trackingId:null}),owner,world.db)).rejects.toMatchObject({code:'INVALID_INPUT'});
   expect(world.writes).toEqual([]);
  }
 });
 it('allows a legacy declaration only when every linked listing matches its exact market',async()=>{
  const matching=database(existing({marketplaceCode:null,trackingId:null}),['SA']);
  expect(await executeTool('bp_upsert_store',input({id:'s',marketplaceCode:'SA'}),owner,matching.db)).toMatchObject({marketplaceCode:'SA'});
  const conflicting=database(existing({marketplaceCode:null,trackingId:null}),['US']);
  await expect(executeTool('bp_upsert_store',input({id:'s',marketplaceCode:'SA'}),owner,conflicting.db)).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(conflicting.writes).toEqual([]);
 });
 it('rereads the selected store after acquiring its transaction row lock',async()=>{
  const world=database(existing());
  world.raw.$queryRaw=async()=>{Object.assign(world.read()!,{marketplaceCode:'US',url:'https://amazon.com',trackingId:'store-us-20'});return [];};
  await expect(executeTool('bp_upsert_store',input({id:'s'}),owner,world.db)).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(world.writes).toEqual([]);
 });
 it('does not carry an old tracking ID into a changed market by omission',async()=>{
  const world=database(existing());
  await expect(executeTool('bp_upsert_store',input({id:'s',url:'https://amazon.com',marketplaceCode:'US'}),owner,world.db)).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(world.writes).toEqual([]);
 });
 it('continues supporting an unscoped non-Amazon store',async()=>{
  const world=database();
  expect(await executeTool('bp_upsert_store',input({slug:'noon',url:'https://www.noon.com'}),owner,world.db)).toMatchObject({slug:'noon',url:'https://www.noon.com',isActive:true});
 });
});

// Pre3.1 receipts hashed the parsed scalar fields, including default isActive:true.
const oldHash=(value:Store)=>createHash('sha256').update(JSON.stringify(value,Object.keys(value).sort())).digest('hex');
function oldReceipt(args:Store,result:Store){
 return {key:oldHash({actor:owner.id,name:'bp_upsert_store',key:args.idempotencyKey}),inputHash:oldHash({...args,isActive:args.isActive??true}),result};
}
async function seedOldReceipt(world:ReturnType<typeof database>,args:Store,result:Store){
 await world.raw.operationReceipt.create({data:oldReceipt(args,result)});
 world.writes.length=0;
}
describe('store receipt compatibility across omitted-active contract update',()=>{
 it('returns a genuine old omitted-field saved result without rewriting the current store',async()=>{
  const world=database(existing());
  const saved=existing({isActive:true});
  await seedOldReceipt(world,input(),saved);
  expect(await executeTool('bp_upsert_store',input(),owner,world.db)).toEqual(saved);
  expect(world.read()?.isActive).toBe(false);
  expect(world.writes).toEqual([]);
 });
 it('also preserves an identical explicitly false legacy retry',async()=>{
  const world=database(existing());
  const args=input({isActive:false});
  const saved=existing({isActive:false});
  await seedOldReceipt(world,args,saved);
  expect(await executeTool('bp_upsert_store',args,owner,world.db)).toEqual(saved);
  expect(world.writes).toEqual([]);
 });
 it.each([{isActive:false},{trackingId:'different-21'},{marketplaceCode:null},{name:'Different'}])('keeps a changed old operation conflicting for %j',async change=>{
  const world=database(existing());
  await seedOldReceipt(world,input(),existing({isActive:true}));
  await expect(executeTool('bp_upsert_store',input(change),owner,world.db)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect(world.writes).toEqual([]);
 });
 it.each([[{}, {isActive:true}],[{isActive:true},{}]])('distinguishes new omission from explicit true in both directions',async(first,second)=>{
  const world=database(existing());
  await executeTool('bp_upsert_store',input(first),owner,world.db);
  world.writes.length=0;
  await expect(executeTool('bp_upsert_store',input(second),owner,world.db)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect(world.writes).toEqual([]);
 });
 it('still checks revoked publishing rights before replaying an old saved result',async()=>{
  const world=database(existing());
  await seedOldReceipt(world,input(),existing({isActive:true}));
  await expect(executeTool('bp_upsert_store',input(),{...owner,canPublish:false},world.db)).rejects.toMatchObject({code:'PUBLISH_FORBIDDEN'});
  expect(world.writes).toEqual([]);
 });
 it.each(['P2002','VERSION_CONFLICT'])('uses legacy-compatible matching after an overlapping %s failure',async code=>{
  const world=database();const saved=existing({isActive:true});const receipt=oldReceipt(input(),saved);
  let reads=0;
  world.raw.operationReceipt.findUnique=async()=>++reads===1?null:receipt;
  world.raw.$transaction=async()=>{throw code==='VERSION_CONFLICT'?new DomainError('VERSION_CONFLICT','overlapping operation'):{code:'P2002'};};
  expect(await executeTool('bp_upsert_store',input(),owner,world.db)).toEqual(saved);
  expect(world.writes).toEqual([]);
 });
});
