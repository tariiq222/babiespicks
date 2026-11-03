import {describe,expect,it} from 'vitest';
import {engineContextKey,runChat} from './chat-service';
import {chatRequestSchema,requestContext} from './chat-policy';
import {FIXTURE_CATALOG} from './chat-fixtures';

/**
 * The widget decides whether a reply's cards are still current by computing the same
 * Task 6 engine key the server stamps on the reply. These tests pin that contract on
 * the server side: the key depends on the locale, destination, display currency and
 * budget only, so a changed destination or currency always produces a different key.
 */
const call=(name:string,args:unknown)=>({id:name,type:'function',function:{name,arguments:JSON.stringify(args)}});
const key=(locale:'ar'|'en',extra:Record<string,unknown>={})=>engineContextKey(requestContext(chatRequestSchema.parse({locale,messages:[{role:'user',content:'hi'}],...extra})));

describe('reply contextKey contract',()=>{
 it('is the engine key of the resolved context, in the engine\'s array form',()=>{
  expect(key('ar',{shipTo:'SA',displayCurrency:'SAR'})).toBe(JSON.stringify(['ar','SA','SAR','PUBLIC',null]));
  expect(key('en')).toBe(JSON.stringify(['en',null,null,'PUBLIC',null]));
 });
 it('changes when the destination, the currency or the language changes',()=>{
  const base=key('ar',{shipTo:'SA',displayCurrency:'SAR'});
  expect(key('ar',{shipTo:'US',displayCurrency:'SAR'})).not.toBe(base);
  expect(key('ar',{shipTo:'SA',displayCurrency:'USD'})).not.toBe(base);
  expect(key('en',{shipTo:'SA',displayCurrency:'SAR'})).not.toBe(base);
  expect(key('ar',{shipTo:'SA'})).not.toBe(base);
 });
 it('stamps every reply, including the medical and currency-prompt replies',async()=>{
  const request=(content:string)=>chatRequestSchema.parse({locale:'ar',shipTo:'SA',displayCurrency:'SAR',messages:[{role:'user',content}]});
  const medical=await runChat(request('طفلي حرارته مرتفعة'),{catalog:FIXTURE_CATALOG,config:{apiKey:'k',apiUrl:'https://provider.test/api/v1',model:'m'},fetch:async()=>{throw new Error('not called');}});
  expect(medical.contextKey).toBe(JSON.stringify(['ar','SA','SAR','PUBLIC',null]));
  // The scripts mirror the real loop: a tool round first, then the final reply.
  const scripts=[call('search_products',{query:'فرشة'}),call('submit_reply',{kind:'answer',text:'هذي تناسبك.',productIds:['playmat'],couponIds:[],suggestions:[]})];
  const send=async()=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[scripts.shift()]}}]}));
  const answer=await runChat(request('أبي فرشة لعب'),{catalog:FIXTURE_CATALOG,config:{apiKey:'k',apiUrl:'https://provider.test/api/v1',model:'m'},fetch:send as never});
  expect(answer.contextKey).toBe(medical.contextKey);expect(answer.products[0].context).toEqual({shipTo:'SA',currency:'SAR'});
 });
});
