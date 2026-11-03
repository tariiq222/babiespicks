import {afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('./source-policy',async()=>{
 const actual=await vi.importActual<typeof import('./source-policy')>('./source-policy');
 return {...actual,requireEnabledSourcePolicy:(sourceId:string,marketplaceCode:string)=>({...actual.resolveSourcePolicy(sourceId,marketplaceCode),enabled:true,status:'VERIFIED' as const})};
});
import {resolveOfferTarget,resolvePurchaseTarget,wrapAffiliateUrl} from './prices';
import {executeTool} from './index';
import {validateVerdict} from './verdict-policy';
describe('affiliate destination ownership',()=>{
 const store={url:'https://www.amazon.sa/?tag=babiespicks-21',affiliateNetwork:'Amazon Associates'};
 it('adds the configured store tag to an untagged observation when no runtime tag exists',()=>{
  expect(wrapAffiliateUrl('https://www.amazon.sa/dp/B00NVMIO02','amazon-sa',{},store)).toBe('https://www.amazon.sa/dp/B00NVMIO02?tag=babiespicks-21');
 });
 it('prefers the runtime tag and replaces a stale tag exactly once',()=>{
  const target=wrapAffiliateUrl('https://www.amazon.sa/dp/X?tag=other&tag=duplicate','amazon-sa',{AMAZON_ASSOCIATES_TAG:'babiespicks-21'},store);
  expect(new URL(target).searchParams.getAll('tag')).toEqual(['babiespicks-21']);
 });
 it('applies the tag to a marketplace the store is verified for',()=>{
  const usStore={...store,url:'https://www.amazon.com/?tag=babiespicks-20',marketplaceCode:'US'};
  expect(wrapAffiliateUrl('https://www.amazon.com/dp/X','amazon-us',{AMAZON_ASSOCIATES_TAG:'legacy-sa-21',AMAZON_ASSOCIATES_TAG_US:'test-us-20'},usStore)).toBe('https://www.amazon.com/dp/X?tag=test-us-20');
 });
 it.each([
  ['SA','amazon.sa','test-sa-21'],
  ['US','amazon.com','test-us-20'],
 ])('uses the %s tag when both markets and a generic override are configured',(marketplaceCode,host,tag)=>{
  const env={AMAZON_ASSOCIATES_TAG:'legacy-sa-21',AMAZON_ASSOCIATES_TAG_SA:' test-sa-21 ',AMAZON_ASSOCIATES_TAG_US:' test-us-20 '};
  const target=wrapAffiliateUrl(`https://www.${host}/dp/X?tag=stale&tag=duplicate`,'amazon',env,{url:`https://www.${host}/?tag=store-tag`,marketplaceCode});
  expect(new URL(target).searchParams.getAll('tag')).toEqual([tag]);
 });
 it.each(['SA','US'])('rejects %s when only a tag in the observation is available',marketplaceCode=>{
  const host=marketplaceCode==='SA'?'amazon.sa':'amazon.com';
  expect(()=>wrapAffiliateUrl(`https://${host}/dp/X?tag=untrusted`,'amazon',{}, {url:`https://${host}`,marketplaceCode})).toThrow(/Missing affiliate tag/);
 });
 it('never falls back to the generic Saudi tag for a verified US store',()=>{
  expect(()=>wrapAffiliateUrl('https://amazon.com/dp/X','amazon-us',{AMAZON_ASSOCIATES_TAG:'legacy-sa-21',AMAZON_ASSOCIATES_TAG_SA:'test-sa-21',AMAZON_ASSOCIATES_TAG_US:'  '},{url:'https://amazon.com',marketplaceCode:'US'})).toThrow(/Missing affiliate tag/);
 });
 it('allows a verified US store to supply its own scoped tag',()=>{
  expect(wrapAffiliateUrl('https://amazon.com/dp/X','amazon-us',{AMAZON_ASSOCIATES_TAG:'legacy-sa-21'},{url:'https://amazon.com/?tag=test-us-20',marketplaceCode:'US'})).toBe('https://amazon.com/dp/X?tag=test-us-20');
 });
 it('rejects blank store tags',()=>{
  expect(()=>wrapAffiliateUrl('https://amazon.sa/dp/X','amazon-sa',{}, {url:'https://amazon.sa/?tag=%20%20',marketplaceCode:'SA'})).toThrow(/Missing affiliate tag/);
 });
 it('rejects unsupported Amazon subdomains even with a scoped tag',()=>{
  expect(()=>wrapAffiliateUrl('https://unverified.amazon.com/dp/X','amazon-us',{AMAZON_ASSOCIATES_TAG_US:'test-us-20'},{marketplaceCode:'US'})).toThrow();
 });
 it('never writes the tag over a marketplace the verified store does not belong to',()=>{
  const usStore={...store,marketplaceCode:'US'};
  expect(()=>wrapAffiliateUrl('https://www.amazon.sa/dp/X','amazon-sa',{AMAZON_ASSOCIATES_TAG:'babiespicks-20'},usStore)).toThrow(/another marketplace/);
 });
 it('keeps the legacy fallback pinned to the SA marketplace only',()=>{
  const legacyStore={marketplaceCode:null};
  const env={AMAZON_ASSOCIATES_TAG:'babiespicks-21'};
  expect(wrapAffiliateUrl('https://www.amazon.sa/dp/X','amazon-sa',env,legacyStore)).toBe('https://www.amazon.sa/dp/X?tag=babiespicks-21');
  expect(()=>wrapAffiliateUrl('https://www.amazon.com/dp/X','amazon-us',env,legacyStore)).toThrow(/SA marketplace only/);
  expect(()=>wrapAffiliateUrl('https://www.amazon.com/dp/X','amazon-us',{AMAZON_ASSOCIATES_TAG_US:'test-us-20'},legacyStore)).toThrow(/SA marketplace only/);
 });
 it('still refuses an unrelated host even with a verified marketplace store',()=>{
  const usStore={...store,url:'https://www.amazon.com/?tag=babiespicks-20',marketplaceCode:'US'};
  expect(()=>wrapAffiliateUrl('https://www.noon.com/p/X','noon',{},usStore)).toThrow();
 });
});
describe('market-scoped purchase resolution',()=>{
 afterEach(()=>vi.unstubAllEnvs());
 const configure=()=>{
  vi.stubEnv('AMAZON_ASSOCIATES_TAG','legacy-sa-21');
  vi.stubEnv('AMAZON_ASSOCIATES_TAG_SA','test-sa-21');
  vi.stubEnv('AMAZON_ASSOCIATES_TAG_US','test-us-20');
 };
 const now=new Date('2026-11-03T06:00:00Z');
 it.each([
  ['SA','amazon.sa','SAR','test-sa-21'],
  ['US','amazon.com','USD','test-us-20'],
 ])('resolves an exact %s offer with its own marketplace tag',async(marketplaceCode,host,currency,tag)=>{
  configure();
  const store={slug:'amazon',url:`https://${host}`,marketplaceCode,isActive:true};
  const offer={id:'offer',isActive:true,sellerKey:'seller',listing:{id:'listing',sourceUrl:`https://${host}/dp/X?tag=stale`,marketplaceCode,store,product:{publishStatus:'PUBLISHED',isActive:true}}};
  const db={offerPriceObservation:{findFirst:async({where}:any)=>where.shipTo==='SA'||where.shipTo==='US'?null:({id:'observation',scopeKey:'price:market:in-marketplace',amount:'100',currency,sourceId:marketplaceCode==='SA'?'amazon-creators-api-sa':'amazon-creators-api-us',shipTo:null,audience:'PUBLIC',offer})}} as unknown as Parameters<typeof resolveOfferTarget>[0];
  const target=await resolveOfferTarget(db,{offerId:'offer',observationId:'observation',shipTo:marketplaceCode as 'SA'|'US'},now);
  expect(target?.url).toBe(`https://${host}/dp/X?tag=${tag}`);
 });
 it('does not produce a US purchase target with only Saudi configuration',async()=>{
  configure();
  vi.stubEnv('AMAZON_ASSOCIATES_TAG_US','');
  const store={slug:'amazon',url:'https://amazon.com',marketplaceCode:'US',isActive:true};
  const offer={id:'offer',isActive:true,sellerKey:'seller',listing:{id:'listing',sourceUrl:'https://amazon.com/dp/X?tag=stale',marketplaceCode:'US',store,product:{publishStatus:'PUBLISHED',isActive:true}}};
  const db={offerPriceObservation:{findFirst:async({where}:any)=>where.shipTo==='SA'||where.shipTo==='US'?null:({id:'observation',scopeKey:'price:market:in-marketplace',amount:'100',currency:'USD',sourceId:'amazon-creators-api-us',shipTo:null,audience:'PUBLIC',offer})}} as unknown as Parameters<typeof resolveOfferTarget>[0];
  expect(await resolveOfferTarget(db,{offerId:'offer',observationId:'observation',shipTo:'US'},now)).toBeNull();
 });
 it('keeps legacy Saudi purchase links on the Saudi tag when US is configured',async()=>{
  configure();
  const store={slug:'amazon-sa',url:'https://amazon.sa',marketplaceCode:null,isActive:true};
  const db={product:{findFirst:async()=>({prices:[{storeId:'sa',store,price:100,currency:'SAR',url:'https://amazon.sa/dp/X',scrapedAt:now,inStock:true}]})}} as unknown as Parameters<typeof resolvePurchaseTarget>[0];
  const target=await resolvePurchaseTarget(db,{productId:'product'},now);
  expect(target?.url).toBe('https://amazon.sa/dp/X?tag=test-sa-21');
 });
});
describe('editorial verdict guidance',()=>{
 it('explains that 7.6 belongs to WORTH_IT rather than silently lowering component scores',()=>{
  expect(()=>validateVerdict({safetyScore:7.6,qualityScore:7.6,reviewsScore:7.6,priceScore:7.6,longTermScore:7.6,overallScore:7.6,type:'WORTH_IT_WITH'})).toThrow(/7\.6.*WORTH_IT/);
 });
 it.each([[7.5,'WORTH_IT'],[7.4,'WORTH_IT_WITH'],[6,'WORTH_IT_WITH'],[5.9,'WAIT'],[4.5,'WAIT'],[4.4,'NOT_WORTH_IT']])('accepts the documented boundary %s with %s',(score,type)=>{
  expect(validateVerdict({safetyScore:score,qualityScore:score,reviewsScore:score,priceScore:score,longTermScore:score,overallScore:score,type})).toEqual({score,type});
 });
 it('publishes the rules through capabilities without database access',async()=>{
  const caps=await executeTool('bp_get_capabilities',{}, {id:'test-reader',canPublish:false});
  expect(caps.verdictPolicy.weights).toEqual({safetyScore:0.25,qualityScore:0.25,reviewsScore:0.2,priceScore:0.15,longTermScore:0.15});
  expect(caps.verdictPolicy.thresholds[0]).toEqual({type:'WORTH_IT',minInclusive:7.5});
 });
});
