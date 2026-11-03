import {describe,expect,it,vi} from 'vitest';
import {chatRequestSchema,findTextViolation,isMedicalMessage,requestContext,resolveBudget} from './chat-policy';
import {createChatLimits} from './chat-limits';
import {engineContextKey,runChat} from './chat-service';
import {CHAT_TOOLS,createToolSession,offerHref,searchCatalog,type ChatCatalog} from './chat-tools';
import {FIXTURE_CATALOG,FIXTURE_PRODUCTS,LEGACY_PRODUCT,LEGACY_SOURCE_ID,OBSERVATION_EXPIRED} from './chat-fixtures';

const request=(content:string,extra:Record<string,unknown>={})=>chatRequestSchema.parse({locale:'ar',messages:[{role:'user',content}],...extra});
const config={apiKey:'test',apiUrl:'https://provider.test/api/v1',model:'test-model'};
const call=(name:string,args:unknown,id=name)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const reply=(...calls:unknown[])=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:calls}}],usage:{prompt_tokens:10,completion_tokens:5}}));
const provider=(...responses:Response[])=>{const fn=vi.fn<typeof fetch>();for(const response of responses)fn.mockResolvedValueOnce(response);return fn;};
const submit=(data:Record<string,unknown>)=>call('submit_reply',{kind:'answer',text:'',productIds:[],couponIds:[],suggestions:[],...data});
const context=(extra:Record<string,unknown>={})=>requestContext(request('x',extra));

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

describe('shopping context on the request',()=>{
 it('accepts only explicit SA/US and SAR/USD choices, and keeps absent choices neutral',()=>{
  expect(context({shipTo:'US',displayCurrency:'USD'})).toEqual({locale:'ar',shipTo:'US',displayCurrency:'USD',budget:null,audience:'PUBLIC'});
  expect(context()).toEqual({locale:'ar',shipTo:null,displayCurrency:null,budget:null,audience:'PUBLIC'});
  for(const extra of [{shipTo:'DE'},{displayCurrency:'EUR'},{budget:{amount:'100',currency:'SAR'}},{audience:'MEMBERS'},{address:'Riyadh'}])
   expect(chatRequestSchema.safeParse({locale:'ar',messages:[{role:'user',content:'hi'}],...extra}).success).toBe(false);
 });
 it('never derives a destination or currency from the other choice',()=>{
  expect(context({shipTo:'SA'}).displayCurrency).toBeNull();
  expect(context({displayCurrency:'USD'}).shipTo).toBeNull();
 });
});

describe('budget contract',()=>{
 const sa=context({shipTo:'SA',displayCurrency:'SAR'});const us=context({shipTo:'US',displayCurrency:'USD'});const neutral=context();
 it('takes an amount only with its own currency',()=>{
  expect(resolveBudget({underPrice:{amount:'100',currency:'USD'}},sa)).toEqual({ok:true,budget:{amount:'100',currency:'USD'},legacy:false});
  expect(resolveBudget({underPrice:{amount:'100',currency:'SAR'}},us)).toEqual({ok:true,budget:{amount:'100',currency:'SAR'},legacy:false});
  expect(resolveBudget({underPrice:{amount:'100'}},us)).toEqual({ok:false,reason:'BUDGET_CURRENCY_REQUIRED'});
  expect(resolveBudget({underPrice:{currency:'USD'}},us)).toEqual({ok:false,reason:'BUDGET_CURRENCY_REQUIRED'});
  expect(resolveBudget({underPrice:{amount:'100',currency:'EUR'}},us)).toEqual({ok:false,reason:'BUDGET_CURRENCY_REQUIRED'});
  expect(resolveBudget({underPrice:100},us)).toEqual({ok:false,reason:'BUDGET_INVALID'});
 });
 it('reads the legacy maxPrice only in the chosen display currency and otherwise asks',()=>{
  expect(resolveBudget({maxPrice:100},neutral)).toEqual({ok:false,reason:'LEGACY_MAX_PRICE_NEEDS_CURRENCY'});
  expect(resolveBudget({maxPrice:100},context({shipTo:'SA'}))).toEqual({ok:false,reason:'LEGACY_MAX_PRICE_NEEDS_CURRENCY'});
  expect(resolveBudget({maxPrice:100},us)).toEqual({ok:true,budget:{amount:'100',currency:'USD'},legacy:true});
  expect(resolveBudget({maxPrice:'99.5'},sa)).toEqual({ok:true,budget:{amount:'99.5',currency:'SAR'},legacy:true});
  expect(resolveBudget({maxPrice:-5},sa)).toEqual({ok:false,reason:'BUDGET_INVALID'});
 });
 it('publishes the typed Money budget and the declared legacy parameter in tools/list',()=>{
  const search=CHAT_TOOLS.find(tool=>tool.function.name==='search_products')!;
  const properties=(search.function.parameters as {properties:Record<string,{properties?:Record<string,{enum?:string[]}>;description?:string}>}).properties;
  expect(Object.keys(properties)).toEqual(['query','ageMonths','underPrice','discountedOnly']);
  expect(Object.keys(properties.underPrice!.properties!)).toEqual(['amount','currency']);
  expect(properties.underPrice!.properties!.currency!.enum).toEqual(['SAR','USD']);
  expect(properties.underPrice!.description).toMatch(/Money/);
 });
});

describe('catalog search',()=>{
 it('excludes a known age mismatch and keeps unknown ages',()=>{
  const ids=searchCatalog(FIXTURE_PRODUCTS,'ar',{ageMonths:3}).map(product=>product.id);
  expect(ids).not.toContain('stroller');expect(ids).toContain('playmat');expect(ids).toContain('bottle');
 });
 it('prefers the main item over an accessory mentioned after with',()=>{
  expect(searchCatalog(FIXTURE_PRODUCTS,'ar',{query:'لعبة'}).map(product=>product.id)).toEqual(['playmat','piano']);
 });
 it('prefers a matching category over a word in another product name',()=>{
  const crib={...FIXTURE_PRODUCTS[0],id:'crib',translations:[{locale:'ar',name:'سرير اللعب والسفر',description:null,slug:'crib'}],category:{name:'التنقل',slug:'travel'}};
  expect(searchCatalog([crib,...FIXTURE_PRODUCTS],'ar',{query:'لعبة'}).map(product=>product.id)).toEqual(['playmat','piano']);
 });
 it('keeps partial matches when nothing matches directly',()=>{
  expect(searchCatalog(FIXTURE_PRODUCTS,'ar',{query:'قوس'}).map(product=>product.id)).toEqual(['bouncer']);
 });
 it('applies a Money budget only in its own currency, exactly, and discount filters',()=>{
  expect(searchCatalog(FIXTURE_PRODUCTS,'ar',{budget:{amount:'100',currency:'SAR'}}).map(product=>product.id)).toEqual(['bottle']);
  expect(searchCatalog(FIXTURE_PRODUCTS,'ar',{budget:{amount:'99.99',currency:'SAR'}}).map(product=>product.id)).toEqual(['bottle']);
  expect(searchCatalog(FIXTURE_PRODUCTS,'ar',{budget:{amount:'100',currency:'USD'}})).toEqual([]);
  expect(searchCatalog(FIXTURE_PRODUCTS,'ar',{discountedOnly:true}).map(product=>product.id).sort()).toEqual(['bottle','stroller']);
 });
});

describe('tool session in context',()=>{
 const session=(extra:Record<string,unknown>,catalog:ChatCatalog=FIXTURE_CATALOG)=>createToolSession({catalog,locale:'ar',context:context(extra)});
 it('offers only an offer for the chosen destination and the public audience',async()=>{
  const sa=await session({shipTo:'SA'}).run('search_products',{}) as {products:Array<{id:string}>;context:string};
  expect(sa.products.map(item=>item.id)).not.toContain('us-only');expect(sa.products.map(item=>item.id)).not.toContain('members-only');
  expect(sa.context).toContain('Delivery destination: Saudi Arabia');
  const us=await session({shipTo:'US'}).run('search_products',{}) as {products:Array<{id:string}>};
  expect(us.products.map(item=>item.id)).toContain('us-only');expect(us.products.map(item=>item.id)).not.toContain('playmat');
 });
 it('applies the budget in its own currency only, and asks instead of guessing',async()=>{
  const sar=await session({shipTo:'SA',displayCurrency:'SAR'}).run('search_products',{underPrice:{amount:'100',currency:'SAR'}}) as {products:Array<{id:string}>;note:string};
  expect(sar.products.map(item=>item.id)).toEqual(['bottle']);expect(sar.note).toContain('100 SAR');
  const usd=await session({shipTo:'SA',displayCurrency:'USD'}).run('search_products',{underPrice:{amount:'100',currency:'USD'}}) as {products:Array<{id:string}>};
  expect(usd.products).toEqual([]);
  const noCurrency=await session({}).run('search_products',{maxPrice:100}) as {budgetAsked:boolean;error:string;products?:unknown};
  expect(noCurrency).toMatchObject({budgetAsked:true,error:'LEGACY_MAX_PRICE_NEEDS_CURRENCY'});expect(noCurrency.products).toBeUndefined();
  expect(((await session({shipTo:'SA'}).run('search_products',{underPrice:{amount:'100'}})) as {error:string}).error).toBe('BUDGET_CURRENCY_REQUIRED');
 });
 it('uses the legacy SAR fallback only without a destination and never in USD',async()=>{
  const legacy=LEGACY_PRODUCT;
  const catalog:ChatCatalog={...FIXTURE_CATALOG,products:async()=>[...FIXTURE_PRODUCTS,legacy]};
  const neutral=await createToolSession({catalog,locale:'ar',context:context()}).resolveCard(legacy);
  expect(neutral?.money.legacyPrice).toEqual({amount:'59',currency:'SAR'});expect(neutral?.money.price).toBeNull();
  const dest=await createToolSession({catalog,locale:'ar',context:context({shipTo:'SA'})}).resolveCard(legacy);
  expect(dest).toBeNull();
  const usd=await createToolSession({catalog,locale:'en',context:context({displayCurrency:'USD'})}).resolveCard(legacy);
  expect(usd).toBeNull();
 });
 it('never offers an unrelated product when nothing matches',async()=>{
  expect(await session({shipTo:'SA'}).run('search_products',{query:'كرة قدم'})).toMatchObject({products:[]});
 });
});

describe('chat service',()=>{
 it('answers medical messages without calling the provider',async()=>{
  const send=provider();
  const result=await runChat(request('طفلي حرارته مرتفعة'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(result.kind).toBe('medical');expect(send).not.toHaveBeenCalled();expect(result.contextKey).toBe(engineContextKey(context()));
 });
 it('sends the explicit choice only, and builds cards from the engine with their own currency',async()=>{
  const send=provider(reply(call('search_products',{query:'فرشة'})),reply(submit({text:'هذي تناسبك.',productIds:['playmat']})));
  const usage=vi.fn();
  const result=await runChat(request('أبي فرشة لعب',{shipTo:'SA',displayCurrency:'SAR'}),{catalog:FIXTURE_CATALOG,config,fetch:send,onUsage:usage});
  expect(result.products.map(card=>[card.id,card.money.price])).toEqual([['playmat',{amount:'149',currency:'SAR'}]]);
  expect(result.products[0].marketplaceCode).toBe('SA');expect(result.products[0].storeName).toBe('أمازون السعودية');
  expect(result.products[0].context).toEqual({shipTo:'SA',currency:'SAR'});
  expect(result.contextKey).toBe(engineContextKey(context({shipTo:'SA',displayCurrency:'SAR'})));
  expect(result.contextKey).toBe(JSON.stringify(['ar','SA','SAR','PUBLIC',null]));
  expect(result.needsCurrency).toBe(false);expect(usage).toHaveBeenCalledTimes(2);
  const body=JSON.parse(String(send.mock.calls[1][1]?.body));
  expect(body.reasoning_effort).toBe('low');
  const shown=JSON.stringify(body.messages);
  expect(shown).not.toContain('test-key');expect(shown).not.toContain('Riyadh');expect(shown).toContain('Delivery destination: Saudi Arabia (SA). Display currency: SAR.');
 });
 it('asks for a currency instead of assuming one for "under 100"',async()=>{
  const send=provider(reply(call('search_products',{maxPrice:100})),reply(submit({text:'هذي خيارات تحت الميزانية.',productIds:['bottle']})));
  const result=await runChat(request('أبي شي أقل من 100'),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(send).toHaveBeenCalledTimes(2);expect(result.needsCurrency).toBe(true);expect(result.products).toEqual([]);
  expect(result.text).toContain('العملة');expect(findTextViolation(result.text)).toBeNull();
  // The model was told to ask, and its priced answer was replaced by the fixed prompt.
  const tool=JSON.parse(String(JSON.parse(String(send.mock.calls[1][1]?.body)).messages.at(-1).content));
  expect(tool).toMatchObject({budgetAsked:true,error:'LEGACY_MAX_PRICE_NEEDS_CURRENCY'});expect(tool.note).toContain('choose a display currency');
  expect(result.suggestions).toEqual([]);
 });
 it('applies "under 100 dollars" and "under 100 riyals" as different typed budgets',async()=>{
  const sar=provider(reply(call('search_products',{underPrice:{amount:'100',currency:'SAR'}})),reply(submit({text:'هذي تحتها.',productIds:['bottle']})));
  const sarResult=await runChat(request('أقل من 100 ريال',{shipTo:'SA',displayCurrency:'SAR'}),{catalog:FIXTURE_CATALOG,config,fetch:sar});
  expect(sarResult.products.map(card=>card.id)).toEqual(['bottle']);expect(sarResult.needsCurrency).toBe(false);
  const usd=provider(reply(call('search_products',{underPrice:{amount:'50',currency:'USD'}})),reply(submit({text:'هذي تحتها.',productIds:['usd-public']})));
  const usdResult=await runChat(request('أقل من 50 دولار',{shipTo:'US',displayCurrency:'USD'}),{catalog:FIXTURE_CATALOG,config,fetch:usd});
  expect(usdResult.products.map(card=>[card.id,card.money.price])).toEqual([['usd-public',{amount:'40',currency:'USD'}]]);expect(usdResult.needsCurrency).toBe(false);
 });
 it('never recommends an offer for the other destination or a members offer',async()=>{
  const send=provider(reply(call('search_products',{})),reply(submit({text:'تفضلي.',productIds:['us-only','members-only','playmat']})));
  const result=await runChat(request('رشحي لي',{shipTo:'SA'}),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(result.products.map(card=>card.id)).toEqual(['playmat']);
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
  const send=provider(reply(call('get_deals',{})),reply(submit({text:'هذا كوبون متجر.',couponIds:['c1','never-seen']})));
  const result=await runChat(request('وش الخصومات',{shipTo:'SA'}),{catalog:FIXTURE_CATALOG,config,fetch:send});
  expect(result.coupons.map(coupon=>[coupon.id,coupon.code])).toEqual([['c1','BABY10']]);
 });
 it('never shows a members coupon, even when a catalog row leaks into the tool result',async()=>{
  // The route filters the public feed (Task 9), and the chat holds the same line itself.
  const leaking:ChatCatalog={...FIXTURE_CATALOG,coupons:async()=>[...(await FIXTURE_CATALOG.coupons())]};
  const send=provider(reply(call('get_deals',{})),reply(submit({text:'هذا كوبون متجر.',couponIds:['c1','c-members']})));
  const result=await runChat(request('وش الخصومات',{shipTo:'SA'}),{catalog:leaking,config,fetch:send});
  expect(result.coupons.map(coupon=>coupon.id)).not.toContain('c-members');
 });
 it('degrades to catalog search in the same context on provider failure and plain text replies',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const failed=await runChat(request('لعبة أمريكية',{shipTo:'US',displayCurrency:'USD'}),{catalog:FIXTURE_CATALOG,config,fetch:provider(new Response('',{status:429}))});
  expect(failed.kind).toBe('unavailable');
  // The fallback uses the same engine: a SA-only product is not shown for US.
  expect(failed.products.map(card=>card.id)).toEqual(['us-only','usd-public']);expect(failed.products[0].money.price).toEqual({amount:'20',currency:'USD'});
  const plain=await runChat(request('فرشة'),{catalog:FIXTURE_CATALOG,config,fetch:provider(new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'نص حر'}}]})))});
  expect(plain.kind).toBe('unavailable');expect(plain.text).not.toContain('نص حر');
  warn.mockRestore();
 });
});

describe('assistant cards link to the resolved offer',()=>{
 const session=(extra:Record<string,unknown>,catalog:ChatCatalog=FIXTURE_CATALOG)=>createToolSession({catalog,locale:'ar',context:context(extra)});
 const PRODUCT_LINK=(slug:string)=>`/products/${slug}`;
 it('links a card to the market, listing version and destination the engine resolved',async()=>{
  const card=await session({shipTo:'SA'}).resolveCard(FIXTURE_PRODUCTS[2]!);
  expect(card).toMatchObject({id:'stroller',offerId:'o-stroller',observationId:'obs-o-stroller',marketplaceCode:'SA',link:'OFFER',href:'/go/offer/o-stroller?observationId=obs-o-stroller&shipTo=SA'});
  expect(card!.context).toEqual({shipTo:'SA',currency:null});
  // No purchase link may be derived for a destination the quote was not resolved for.
  expect(offerHref({offerId:'o-usonly',observationId:'obs-o-usonly',marketplaceCode:'US'},{shipTo:'SA',currency:null})).toBeNull();
  expect(offerHref({offerId:'o-usonly',observationId:'obs-o-usonly',marketplaceCode:'US'},{shipTo:null,currency:null})).toBeNull();
  expect(offerHref({offerId:'o-usonly',observationId:'obs-o-usonly',marketplaceCode:'US'},{shipTo:'US',currency:'USD'})).toBe('/go/offer/o-usonly?observationId=obs-o-usonly&shipTo=US');
  const us=await session({shipTo:'US',displayCurrency:'USD'}).resolveCard({...FIXTURE_PRODUCTS[0]!,id:'usd-public',slug:'usd-public'});
  expect(us).toMatchObject({href:'/go/offer/o-usd?observationId=obs-o-usd&shipTo=US',link:'OFFER'});
 });
 it('falls back to the product page, in the same contextKey, when the observation is expired',async()=>{
  const catalog:ChatCatalog={...FIXTURE_CATALOG,offerTarget:async()=>null};
  const card=await session({shipTo:'SA',displayCurrency:'SAR'},catalog).resolveCard(FIXTURE_PRODUCTS[0]!);
  expect(card).toMatchObject({id:'playmat',href:PRODUCT_LINK('playmat'),link:'PRODUCT'});
  expect(card!.href).not.toContain('/go/offer');expect(card!.money.price).toEqual({amount:'149',currency:'SAR'});
  // An expired observation never keeps its offer link through a late card read either.
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const send=provider(reply(call('search_products',{query:'فرشة'})),reply(submit({text:'هذي تناسبك.',productIds:['playmat']})));
  const result=await runChat(request('أبي فرشة لعب',{shipTo:'SA',displayCurrency:'SAR'}),{catalog,config,fetch:send});
  expect(result.products[0]).toMatchObject({id:'playmat',href:PRODUCT_LINK('playmat'),link:'PRODUCT'});
  expect(result.contextKey).toBe(engineContextKey(context({shipTo:'SA',displayCurrency:'SAR'})));
  expect(OBSERVATION_EXPIRED.has('obs-o-playmat')).toBe(true);warn.mockRestore();
 });
 it('keeps a legacy product on its product page with its original SAR price only',async()=>{
  const neutral=await session({}).resolveCard(LEGACY_PRODUCT);
  expect(neutral).toMatchObject({id:'legacy-pad',offerId:null,observationId:null,href:PRODUCT_LINK('legacy-pad'),link:'LEGACY_PRODUCT'});
  expect(neutral!.money).toMatchObject({price:null,legacyPrice:{amount:'59',currency:'SAR'},legacy:true});
  expect(neutral!.href).not.toContain('/go/offer');
  // The unregistered legacy source never becomes a purchase target, even read as a quote.
  expect(offerHref({offerId:'o-legacy-pad',observationId:'obs-o-legacy-pad',marketplaceCode:'SA',sourceId:LEGACY_SOURCE_ID},{shipTo:'SA',currency:null})).toBeNull();
  // A destination does not turn the read-only legacy fallback into a buyable offer.
  const withDestination=await createToolSession({catalog:FIXTURE_CATALOG,locale:'ar',context:context({shipTo:'SA'})}).resolveCard(LEGACY_PRODUCT);
  expect(withDestination).toBeNull();
 });
 it('never produces a purchase link for an offer in another destination',async()=>{
  const sa=await session({shipTo:'SA'});
  // A US quote is not eligible for SA at all: no card, and no SA link for the US offer.
  expect(await sa.resolveCard({...FIXTURE_PRODUCTS[0]!,id:'us-only',slug:'us-only'})).toBeNull();
  const usCard=await session({shipTo:'US'}).resolveCard({...FIXTURE_PRODUCTS[0]!,id:'us-only',slug:'us-only'});
  expect(usCard!.href).toBe('/go/offer/o-usonly?observationId=obs-o-usonly&shipTo=US');
  // A catalog that answers a SA context with a US quote still gets no link for it.
  const crossContext:ChatCatalog={...FIXTURE_CATALOG,offers:async(_productId,selectionContext)=>selectionContext.shipTo===null?{...fixtureLike('o-usonly','US'),contextKey:'k'}:null};
  const stray=await createToolSession({catalog:crossContext,locale:'ar',context:context({shipTo:'SA'})}).resolveCard(FIXTURE_PRODUCTS[0]!);
  expect(stray).toBeNull();
  const neutralCard=await createToolSession({catalog:crossContext,locale:'ar',context:context()}).resolveCard(FIXTURE_PRODUCTS[0]!);
  expect(neutralCard).toMatchObject({link:'PRODUCT',href:PRODUCT_LINK('playmat')});
 });
 const fixtureLike=(offerId:string,marketplaceCode:'SA'|'US')=>({quotes:[{offerId,observationId:`obs-${offerId}`,productId:'playmat',marketplaceCode,listingId:`lst-${offerId}`,sellerKey:'s',fulfillerKey:'s',price:{amount:'20',currency:'USD'},originalPrice:null,convertedPrice:null,fxSnapshotId:null,taxBasis:'INCLUDED',checkedAt:'2026-11-02T10:00:00.000Z',expiresAt:'2026-11-02T11:00:00.000Z',audience:'PUBLIC',delivery:{state:'UNKNOWN',country:null,precision:'UNKNOWN',checkedAt:null},comparisonGroup:null,discountPercent:null}],pendingDelivery:[],bestByGroup:{},reason:'NO_COMPARABLE_PRICE'});
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
