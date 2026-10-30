import {describe,expect,it,vi} from 'vitest';
import {chatRequestSchema,findTextViolation,isMedicalMessage} from './chat-policy';
import {createChatLimits} from './chat-limits';
import {runChat} from './chat-service';
import {searchCatalog} from './chat-tools';
import {FIXTURE_CATALOG,FIXTURE_PRODUCTS} from './chat-fixtures';

const request=(content:string)=>chatRequestSchema.parse({locale:'ar',messages:[{role:'user',content}]});
const config={apiKey:'test',apiUrl:'https://provider.test/api/v1',model:'test-model'};
const call=(name:string,args:unknown,id=name)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const reply=(...calls:unknown[])=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:calls}}],usage:{prompt_tokens:10,completion_tokens:5}}));
const provider=(...responses:Response[])=>{const fn=vi.fn<typeof fetch>();for(const response of responses)fn.mockResolvedValueOnce(response);return fn;};
const submit=(data:Record<string,unknown>)=>call('submit_reply',{kind:'answer',text:'',productIds:[],couponIds:[],suggestions:[],...data});

describe('chat policy',()=>{
 it('detects medical messages without catching nursing products or returns',()=>{
  expect(isMedicalMessage('طفلي حرارته مرتفعة')).toBe(true);expect(isMedicalMessage('what dose of medicine')).toBe(true);
  expect(isMedicalMessage('وسادة للأم المرضعة')).toBe(false);expect(isMedicalMessage('هل ترجيع المنتج ممكن؟')).toBe(false);
 });
 it('rejects prices, ratings, links and testing claims but allows ages',()=>{
  for(const text of ['سعرها 199 ر.س','خصم ٢٥٪','تقييمها 4.6 من 5','جربناها في البيت','https://x.test','تقييم بيبي بيكس 8'])expect(findTextViolation(text)).not.toBeNull();
  expect(findTextViolation('تناسب عمر 6 شهور')).toBeNull();
 });
 it('bounds the request',()=>{
  expect(chatRequestSchema.safeParse({locale:'ar',messages:[{role:'user',content:'x'.repeat(501)}]}).success).toBe(false);
  expect(chatRequestSchema.safeParse({locale:'ar',messages:[{role:'assistant',content:'hi'}]}).success).toBe(false);
  expect(chatRequestSchema.safeParse({locale:'ar',messages:[{role:'user',content:'hi'}],extra:1}).success).toBe(false);
 });
});

describe('catalog search',()=>{
 it('excludes a known age mismatch and keeps unknown ages',()=>{
  const ids=searchCatalog(FIXTURE_PRODUCTS,'ar',{ageMonths:3}).map(product=>product.id);
  expect(ids).not.toContain('stroller');expect(ids).toContain('playmat');expect(ids).toContain('bottle');
 });
 it('applies budget and discount filters',()=>{
  expect(searchCatalog(FIXTURE_PRODUCTS,'ar',{maxPrice:100}).map(product=>product.id)).toEqual(['bottle']);
  expect(searchCatalog(FIXTURE_PRODUCTS,'ar',{discountedOnly:true}).map(product=>product.id).sort()).toEqual(['bottle','stroller']);
 });
});

describe('chat service',()=>{
 it('answers medical messages without calling the provider',async()=>{
  const send=provider();
  const result=await runChat(request('طفلي حرارته مرتفعة'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(result.kind).toBe('medical');expect(send).not.toHaveBeenCalled();
 });
 it('builds cards from the database and sends no key material to the model',async()=>{
  const send=provider(reply(call('search_products',{query:'فرشة'})),reply(submit({text:'هذي تناسبك.',productIds:['playmat']})));
  const usage=vi.fn();
  const result=await runChat(request('أبي فرشة لعب'),{catalog:FIXTURE_CATALOG,config,fetch:send,onUsage:usage});
  expect(result.products.map(card=>[card.id,card.price])).toEqual([['playmat',149]]);expect(usage).toHaveBeenCalledTimes(2);
  const body=JSON.parse(String(send.mock.calls[1][1]?.body));
  expect(body.reasoning_effort).toBe('low');expect(JSON.stringify(body.messages)).not.toContain('test-key');
 });
 it('drops ids the tools never returned',async()=>{
  const send=provider(reply(submit({text:'تفضلي.',productIds:['invented','playmat']})));
  const result=await runChat(request('رشحي لي'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(result.products).toEqual([]);
 });
 it('retries once on a price in text, then shows fixed text with cards',async()=>{
  const bad=()=>reply(submit({text:'سعرها 149 ر.س',productIds:['playmat']}));
  const send=provider(reply(call('search_products',{})),bad(),bad());
  const result=await runChat(request('أبي فرشة'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(send).toHaveBeenCalledTimes(3);expect(result.text).not.toContain('149');expect(result.products[0].id).toBe('playmat');
 });
 it('replaces model text for out of scope replies',async()=>{
  const send=provider(reply(submit({kind:'out_of_scope',text:'قصيدة طويلة'})));
  const result=await runChat(request('اكتب قصيدة'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(result.kind).toBe('out_of_scope');expect(result.text).not.toContain('قصيدة طويلة');
 });
 it('forces a final reply once tool rounds run out',async()=>{
  const search=()=>reply(call('search_products',{query:'فرشة'}));
  const send=provider(search(),search(),search(),reply(submit({text:'هذي تناسبك.',productIds:['playmat']})));
  const result=await runChat(request('أبي فرشة'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(result.kind).toBe('answer');expect(JSON.parse(String(send.mock.calls[3][1]?.body)).tool_choice).toEqual({type:'function',function:{name:'submit_reply'}});
 });
 it('declines when the model omits kind and text',async()=>{
  const send=provider(reply(call('submit_reply',{suggestions:[]})));
  expect((await runChat(request('سؤال'),{catalog:FIXTURE_CATALOG,config,fetch:send})).kind).toBe('out_of_scope');
 });
 it('retries a hung provider call once',async()=>{
  const timeout=Object.assign(new Error('timed out'),{name:'TimeoutError'});
  const send=vi.fn<typeof fetch>().mockRejectedValueOnce(timeout).mockResolvedValueOnce(reply(submit({text:'تفضلي.'})));
  const result=await runChat(request('رشحي لي'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(send).toHaveBeenCalledTimes(2);expect(result.kind).toBe('answer');
 });
 it('does not retry a rejected request',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const send=provider(new Response('',{status:401}));
  expect((await runChat(request('فرشة'),{catalog:FIXTURE_CATALOG,config,fetch:send})).kind).toBe('unavailable');
  expect(send).toHaveBeenCalledTimes(1);warn.mockRestore();
 });
 it('returns coupons only after the deals tool produced them',async()=>{
  const send=provider(reply(call('get_deals',{})),reply(submit({text:'هذا كوبون متجر.',couponIds:['c1']})));
  const result=await runChat(request('وش الخصومات'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(result.coupons[0].code).toBe('BABY10');
 });
 it('degrades to catalog search on provider failure and plain text replies',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const failed=await runChat(request('فرشة'),{catalog:FIXTURE_CATALOG,config,fetch:provider(new Response('',{status:429}))});
  expect(failed.kind).toBe('unavailable');expect(failed.products[0].id).toBe('playmat');
  const plain=await runChat(request('فرشة'),{catalog:FIXTURE_CATALOG,config,fetch:provider(new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'نص حر'}}]})))});
  expect(plain.kind).toBe('unavailable');expect(plain.text).not.toContain('نص حر');
  warn.mockRestore();
 });
});

describe('chat limits',()=>{
 it('limits requests per window and stops at the daily budget',()=>{
  let time=0;const limits=createChatLimits(()=>time);
  for(let i=0;i<10;i++)expect(limits.allowRequest('a')).toBe(true);
  expect(limits.allowRequest('a')).toBe(false);expect(limits.allowRequest('b')).toBe(true);
  time=61000;expect(limits.allowRequest('a')).toBe(true);
  expect(limits.withinBudget(0.01)).toBe(true);limits.recordUsage({promptTokens:1e6,completionTokens:0});expect(limits.withinBudget(0.01)).toBe(false);
  time+=86400000;expect(limits.withinBudget(0.01)).toBe(true);
 });
});
