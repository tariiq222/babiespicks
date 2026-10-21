import {describe,it,expect} from 'vitest';
import {wrapAffiliateUrl} from './prices';
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
