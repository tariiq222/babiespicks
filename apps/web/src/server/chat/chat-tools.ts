import {getMarketplace,type Money,type OfferQuote,type ShoppingContext} from '@babiespicks/domain/international';
import type {Product} from '../../shared/lib/api';
import {getLocalizedDesc,getLocalizedName} from '../../shared/lib/api';
import {parseCouponDescription} from '../../shared/lib/coupons';
import {getBestPrice,getDiscount,getShopperRating} from '../../shared/lib/catalog-filters';
import {getVerdictLabel,organizeProductDescription} from '../../shared/lib/product-details';
import type {ActiveCoupon} from '../public-queries';
// The legacy source id has one definition (Task 3); the chat only reads it, never writes it.
import {LEGACY_SOURCE_ID} from '../../../../../scripts/operations/backfill-international';
import {resolveBudget} from './chat-policy';

/**
 * The chat's catalog port. The server implementation (Task 10 wiring) reads the Task 6
 * offer selection per product through Task 7's public-queries in the SAME resolved
 * context; the legacy SAR price is only the pre-activation fallback and carries no
 * comparison or delivery claim.
 */
export interface ChatCatalog {
 products(locale:string):Promise<Product[]>;
 coupons():Promise<ActiveCoupon[]>;
 /** Task 6 selection for one product in the resolved context. */
 offers?(productId:string,context:ShoppingContext):Promise<unknown>;
 /** Legacy SAR fallback for a product with no international rows at all. */
 legacyPrice?(productId:string):Promise<unknown>;
 /** One resolved purchase target for a quote in this context (Task 7). */
 offerTarget?(input:{offerId:string;observationId:string;shipTo:'SA'|'US'|null}):Promise<unknown>;
}

/**
 * Card money in the same shape the site renders: the original amount with its own
 * currency, the engine's converted estimate and the legacy fallback, never a number
 * relabelled on the client.
 */
export interface ChatMoneyView {
 /** Original observation price. null when the source observed no price. */
 price:Money|null;
 originalPrice:Money|null;
 /** Converted estimate computed by the engine; never the original price. */
 convertedPrice:Money|null;
 /** Pre-Task-10 legacy SAR price; SAR only, no comparison or delivery claim. */
 legacyPrice:{amount:string;currency:'SAR'}|null;
 sourceId:string|null;
 checkedAt:string|null;
 taxBasis:'INCLUDED'|'EXCLUDED'|'UNKNOWN';
 discountPercent:string|null;
 /** True for the read-only legacy SAR fallback (LEGACY_SOURCE_ID); it has no purchase row. */
 legacy:boolean;
}
/** The card's link carries the context it was produced in and is cleared when that changes. */
export interface ChatLinkContext {shipTo:'SA'|'US'|null;currency:'SAR'|'USD'|null}
export interface ChatProductCard {
 id:string;slug:string;name:string;imageUrl:string|null;
 marketplaceCode:'SA'|'US'|null;
 offerId:string|null;observationId:string|null;
 /**
  * The offer purchase route for this exact quote and destination, or the product page.
  * It is only ever set after Task 7 resolveOfferTarget resolved this very quote.
  */
 href:string;
 /** Which link this is: the resolved offer target, the product page, or a legacy product page. */
 link:'OFFER'|'PRODUCT'|'LEGACY_PRODUCT';
 context:ChatLinkContext;
 money:ChatMoneyView;
 deliveryPending:boolean;
 storeName:string|null;verdictLabel:string|null;verdictScore:number|null;shopperRating:number|null;
}
export interface ChatCouponCard {id:string;code:string|null;storeName:string;storeSlug:string;description:string|null;discountPercent:number|null;discountAmount:number|null;discountCurrency:string|null;minimumSpend:{amount:string;currency:string}|null;validUntil:string|null;verified:boolean}

const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
/** The only budget shape a model may pass: an amount and its currency as one unit. */
const moneySchema=(description:string)=>object({amount:{type:'string',description:'Positive decimal amount, digits only, e.g. "100" or "149.50"'},currency:{type:'string',enum:['SAR','USD'],description:'The money unit; never infer it from the text'}},['amount','currency']);
export const CHAT_TOOLS=[
 {type:'function',function:{name:'search_products',description:'Search published products with a current offer for the visitor’s destination and the public audience. The context line (destination, display currency) already applies; omitted filters are not applied.',parameters:object({query:{type:'string',description:'Words from the request, such as playmat or stroller'},ageMonths:{type:'integer',minimum:0,maximum:216},underPrice:{...moneySchema('Price ceiling in the visitor’s chosen currency'),description:'Price ceiling as Money: amount plus its currency when the visitor names a budget.'},discountedOnly:{type:'boolean'}})}},
 {type:'function',function:{name:'get_product',description:'Read one published product by id, with its current offers in the visitor’s context, specs, strengths, cautions and ratings.',parameters:object({id:{type:'string'}},['id'])}},
 {type:'function',function:{name:'get_deals',description:'Read the strongest current product discounts and valid store coupons for the visitor’s destination.',parameters:object({})}},
 {type:'function',function:{name:'get_site_info',description:'Read how BabiesPicks works: ratings, commission, prices and buying.',parameters:object({})}},
 {type:'function',function:{name:'submit_reply',description:'Send the final reply to the user.',parameters:object({kind:{type:'string',enum:['answer','out_of_scope','medical']},text:{type:'string'},productIds:{type:'array',items:{type:'string'}},couponIds:{type:'array',items:{type:'string'}},suggestions:{type:'array',items:{type:'string'},description:'Short follow-up messages the user might send'}},['kind','text','productIds','couponIds','suggestions'])}},
] as const;

const SITE_INFO={
 ar:'BabiesPicks يعرض عروض منتجات الأطفال وأسعارها من أسواق أمازون حول العالم، بسعر كل عرض بعملته الأصلية، وسواء مع برايم أو بدونه، إلى جانب كوبونات المتاجر. التوصيل وأهلية برايم يعتمدان على المنتج والبائع والوجهة؛ لا نؤكدهما دون دليل لكل عرض. الشراء يتم من المتجر نفسه وليس من الموقع. تقييم أمازون يأتي من المتسوقين، وتقييم BabiesPicks تحريري مستقل من 10 وله مصادر. قد نحصل على عمولة بدون تكلفة إضافية على المشتري. الأسعار قد تتغير، والشحن والتوفر يتأكد منهما المشتري في المتجر.',
 en:'BabiesPicks lists baby product offers and prices from Amazon marketplaces around the world, each in its own original currency, with or without Prime, alongside store coupons. Delivery and Prime eligibility depend on the item, seller and destination; neither is confirmed without evidence for that offer. Purchases happen at the store, not on this site. The Amazon rating comes from shoppers; the BabiesPicks rating is a separate sourced editorial assessment out of 10. We may earn a commission at no extra cost to the buyer. Prices can change, and buyers confirm shipping and availability at the store.',
} as const;

const normalize=(value:string)=>value.toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[ً-ْ]/g,'');
const stopWords=new Set(['ابي','ابغي','لطفل','طفل','طفلي','بيبي','عن','في','من','for','the','a','baby']);
const WORD_FAMILIES=[['لعب','لعبه','العاب','toy','toys']];
const wordForms=(word:string)=>WORD_FAMILIES.find(family=>family.includes(word))??[word];
/** A name's main item comes before "with": a chair "with a toy" is not a toy. */
function searchable(product:Product,locale:string){
 const [main='',...extras]=getLocalizedName(product,locale).split(/\s(?:مع|with)\s/i);
 return {main:normalize(main),rest:normalize([...extras,product.brand,product.category?.name,product.category?.nameEn,getLocalizedDesc(product,locale)?.slice(0,600)].filter(Boolean).join(' '))};
}
function ageFit(product:Product,months:number){
 const {ageMinMonths:min,ageMaxMonths:max}=product;
 if(min==null&&max==null)return 'unknown';
 return (min??0)<=months&&months<=(max??Infinity)?'fits':'excluded';
}

// ── Money comparison without floating point ────────────────────────────────

const decimalUnits=(amount:string):bigint=>{const [integer,fraction='']=amount.split('.');return BigInt(integer!+fraction.padEnd(6,'0').slice(0,6));};
const decimalCompare=(a:string,b:string)=>decimalUnits(a)<decimalUnits(b)?-1:decimalUnits(a)>decimalUnits(b)?1:0;

// ── Task 6 selection read (structural: the engine owns every decision) ─────

interface SelectedQuoteView extends OfferQuote {readonly discountPercent?:string|null}
interface SelectionView {
 quotes:SelectedQuoteView[];
 pendingDelivery:SelectedQuoteView[];
 bestByGroup:Record<string,string>;
 reason:string;
 contextKey:string;
}
interface LegacyPriceView {price:number;originalPrice:number|null;currency:'SAR';checkedAt?:string;store:{name:string}|null}

const asSelection=(value:unknown):SelectionView|null=>{
 const selection=value as Partial<SelectionView>|null|undefined;
 return selection&&Array.isArray(selection.quotes)&&Array.isArray(selection.pendingDelivery)&&typeof selection.contextKey==='string'?selection as SelectionView:null;
};
/** The Task 7 legacy price view, or null for an unmatched select many readers return as []. */
const asLegacy=(value:unknown):LegacyPriceView|null=>{
 if(Array.isArray(value))value=value[0];
 const legacy=value as Partial<LegacyPriceView>|null|undefined;
 return legacy&&!Array.isArray(legacy)&&typeof legacy.price==='number'&&legacy.currency==='SAR'?legacy as LegacyPriceView:null;
};
/** The engine's pick for the first comparison group, else its first quote, else null. */
function chosenQuote(selection:SelectionView|null):SelectedQuoteView|null{
 if(!selection)return null;
 const best=Object.values(selection.bestByGroup??{})[0];
 return (best?selection.quotes.find(quote=>quote.offerId===best):undefined)??selection.quotes[0]??null;
}
/** The store is the offer's marketplace, never the seller or the fulfiller. */
const marketName=(code:string,locale:'ar'|'en')=>{const market=getMarketplace(code);return market?(locale==='ar'?market.nameAr:market.nameEn):code;};

/**
 * The quote's own source when the engine names it (a legacy-sar-backfill row is read by
 * the engine as a quote too, but stays unregistered and must never become a purchase
 * target). The field is optional, so a selection that omits it is not treated as legacy.
 */
const quoteSource=(quote:SelectedQuoteView):string|null=>{
 const value=(quote as {sourceId?:unknown}).sourceId;
 return typeof value==='string'?value:null;
};
const isLegacyQuote=(quote:SelectedQuoteView|null)=>quote!==null&&quoteSource(quote)===LEGACY_SOURCE_ID;
function moneyView(quote:SelectedQuoteView|null,legacy:LegacyPriceView|null):ChatMoneyView{
 if(quote)return {price:quote.price,originalPrice:quote.originalPrice,convertedPrice:quote.convertedPrice,legacyPrice:null,sourceId:quoteSource(quote),checkedAt:quote.checkedAt,taxBasis:quote.taxBasis,discountPercent:quote.discountPercent??null,legacy:isLegacyQuote(quote)};
 // No engine quote at all: the legacy SAR fallback, marked as a legacy price only.
 const rate=legacy?.originalPrice&&legacy.originalPrice>legacy.price?Math.round((legacy.originalPrice-legacy.price)/legacy.originalPrice*100):null;
 return {price:null,originalPrice:null,convertedPrice:null,legacyPrice:legacy?{amount:String(legacy.price),currency:'SAR'}:null,sourceId:legacy?LEGACY_SOURCE_ID:null,checkedAt:legacy?.checkedAt??null,taxBasis:'UNKNOWN',discountPercent:rate?String(rate):null,legacy:!!legacy};
}

// ── The card's purchase link (Task 7 Contract: marketplace, listing and version) ──

/** Single-segment ids only, exactly the ids the observation route accepts. */
const TARGET_ID=/^[a-zA-Z0-9_-]{1,128}$/;
const countryOf=(value:string|null|undefined)=>value==='SA'||value==='US'?value:null;

/**
 * The offer route for one exact quote and destination. The link is the exact price
 * observation the card shows, and the destination the quote was produced for — never a
 * default, never another marketplace. A quote whose market is not the requested
 * destination stays on the product page.
 */
export function offerHref(quote:{offerId?:string|null;observationId?:string|null;marketplaceCode?:string|null;sourceId?:string|null},context:ChatLinkContext):string|null{
 const offerId=quote.offerId,observationId=quote.observationId,marketplace=countryOf(quote.marketplaceCode);
 // LEGACY_SOURCE_ID is read-only: its rows never become an offer purchase target.
 if(!offerId||!observationId||!marketplace||quote.sourceId===LEGACY_SOURCE_ID)return null;
 if(!TARGET_ID.test(offerId)||!TARGET_ID.test(observationId))return null;
 // The purchase route refuses a missing destination, and a quote only exists for its
 // own marketplace: linking to SA without an explicit SA choice would be a guess.
 if(!context.shipTo||context.shipTo!==marketplace)return null;
 return `/go/offer/${encodeURIComponent(offerId)}?observationId=${encodeURIComponent(observationId)}&shipTo=${context.shipTo}`;
}

/** One product's resolved offers in this turn's context. */
interface ProductOffers {
 selection:SelectionView|null;
 quote:SelectedQuoteView|null;
 pending:boolean;
 legacy:LegacyPriceView|null;
 money:ChatMoneyView|null;
}

function summary(product:Product,locale:'ar'|'en',offers:ProductOffers){
 const price=offers.money;const rating=getShopperRating(product);
 return {id:product.id,name:getLocalizedName(product,locale),brand:product.brand,category:product.category?.name??null,
  price:price?.price??null,convertedPrice:price?.convertedPrice??null,currency:price?.price?.currency??null,legacyPrice:price?.legacyPrice??null,discountPercent:price?.discountPercent??null,
  taxBasis:price?.taxBasis??null,marketplace:offers.quote?marketName(offers.quote.marketplaceCode,locale):null,checkedAt:price?.checkedAt??null,deliveryPending:offers.pending,
  ageKnown:product.ageMinMonths!=null||product.ageMaxMonths!=null,ageMinMonths:product.ageMinMonths??null,ageMaxMonths:product.ageMaxMonths??null,
  babiespicksRating:product.verdict?{score:product.verdict.overallScore,label:getVerdictLabel(product.verdict.type,locale)}:null,amazonRating:rating?{average:rating.averageRating,reviews:rating.totalReviews}:null};
}
function detail(product:Product,locale:'ar'|'en',offers:ProductOffers){
 const ar=locale==='ar';const review=product.reviewSummary;const verdict=product.verdict;
 return {...summary(product,locale,offers),description:organizeProductDescription(getLocalizedDesc(product,locale)).slice(0,1500),specs:product.specs.filter(spec=>spec.locale===locale).slice(0,20).map(({key,value})=>({key,value})),strengths:(ar?review?.prosAr:review?.prosEn)??[],cautions:(ar?review?.consAr:review?.consEn)??[],ratingReason:(ar?verdict?.reasoningAr:verdict?.reasoningEn)??null,goodFitIf:(ar?verdict?.conditionsAr:verdict?.conditionsEn)??[]};
}

/**
 * Keyword match over published products. Commission never takes part in ranking.
 * `budget` is compared in exact decimals and only against a price in the same
 * currency: the chat never converts a figure to make it fit.
 */
export function searchCatalog(products:Product[],locale:string,args:{query?:string;ageMonths?:number;budget?:Money|null;discountedOnly?:boolean},limit=10):Product[]{
 const words=normalize(args.query??'').split(/\s+/).filter(word=>word.length>1&&!stopWords.has(word));
 const budget=args.budget?decimalUnits(args.budget.amount):null;
 const ranked=products.flatMap(product=>{
  const price=getBestPrice(product);if(!price)return [];
  if(budget!==null&&(!args.budget||price.currency!==args.budget.currency||decimalUnits(String(price.price))>budget))return [];
  if(args.discountedOnly&&!getDiscount(price))return [];
  const age=args.ageMonths===undefined?'unknown':ageFit(product,args.ageMonths);if(age==='excluded')return [];
  const text=searchable(product,locale);
  const has=(value:string,word:string)=>wordForms(word).some(form=>value.includes(form));
  const direct=words.filter(word=>has(text.main,word)).length;const partial=words.filter(word=>has(text.rest,word)).length;
  if(words.length&&!direct&&!partial)return [];
  const category=normalize(`${product.category?.name??''} ${product.category?.nameEn??''}`);
  return [{product,inCategory:words.some(word=>has(category,word)),direct:direct>0,rank:direct*30+partial*5+(age==='fits'?5:0)+(product.verdict?.overallScore??0)+getDiscount(price)/100}];
 });
 const sorted=ranked.sort((a,b)=>b.rank-a.rank);
 const inCategory=sorted.filter(item=>item.inCategory);const direct=sorted.filter(item=>item.direct);
 return (inCategory.length?inCategory:direct.length?direct:sorted).slice(0,limit).map(item=>item.product);
}

/** Whether a quote price fits the budget; a different currency never counts. */
const withinBudget=(price:Money|null,budget:Money|null):boolean=>{
 if(!budget)return true;
 return !!price&&price.currency===budget.currency&&decimalCompare(price.amount,budget.amount)<=0;
};

// The card carries the same structured money the page shows: the amount with its own
// currency and the stored minimum, never a guess parsed out of the description.
export const toCouponCard=(coupon:ActiveCoupon):ChatCouponCard=>({id:coupon.id,code:coupon.code,storeName:coupon.store.name,storeSlug:coupon.store.slug,description:parseCouponDescription(coupon.description).summary||null,discountPercent:coupon.discountPercent,discountAmount:coupon.discountAmount,discountCurrency:coupon.discountCurrency??null,minimumSpend:coupon.minimumSpend??null,validUntil:coupon.validUntil,verified:coupon.verified});

/** The context line given to the model: choices and units only, never an address or a key. */
export function contextLine(context:ShoppingContext):string{
 const destination=context.shipTo==='SA'?'Saudi Arabia (SA)':context.shipTo==='US'?'United States (US)':'not chosen';
 const currency=context.displayCurrency??'not chosen';
 const budget=context.budget?`${context.budget.amount} ${context.budget.currency}`:'not set';
 return `Delivery destination: ${destination}. Display currency: ${currency}. Budget: ${budget}. Audience: public.`;
}

export interface ToolSessionOptions {
 catalog:ChatCatalog;
 locale:'ar'|'en';
 context:ShoppingContext;
 /** The engine's own contextKey for this context; computed identically when omitted. */
 contextKey?:string;
 now?:Date;
}

/**
 * One conversation turn's view of the catalog in the resolved context: only ids this
 * turn actually returned can reach a reply, every price comes from the Task 6
 * selection, and a budget always travels with one currency.
 */
export function createToolSession({catalog,locale,context,contextKey:givenKey,now=new Date()}:ToolSessionOptions){
 const seenProducts=new Map<string,Product>();const seenCoupons=new Map<string,ActiveCoupon>();const resolved=new Map<string,ProductOffers>();
 let all:Promise<Product[]>|undefined;let budgetAsked=false;
 // Same key the engine stamps on a selection for this context.
 const contextKey=givenKey??JSON.stringify([context.locale,context.shipTo,context.displayCurrency,'PUBLIC',context.budget]);
 const linkContext:ChatLinkContext={shipTo:context.shipTo,currency:context.displayCurrency};
 const sessionContext=context;
 const load=()=>all??=catalog.products(locale);
 const remember=(products:Product[])=>{for(const product of products)seenProducts.set(product.id,product);return products;};

 async function offersOf(productId:string,effective:ShoppingContext):Promise<ProductOffers>{
  const cacheKey=`${productId}|${effective.budget?.amount??''}|${effective.budget?.currency??''}`;
  const cached=resolved.get(cacheKey);if(cached)return cached;
  const selection=asSelection(await catalog.offers?.(productId,effective));
  let quote=chosenQuote(selection);
  // A resolved offer link is the acceptance condition of the card. When Task 7 cannot
  // resolve this exact observation for this destination (expired, superseded, another
  // marketplace), the card steps down to the next quote the engine already returned:
  // it never guesses a marketplace and never keeps a dead purchase target.
  for(const candidate of [quote,...(selection?.quotes??[]).filter(item=>item!==quote),...(selection?.pendingDelivery??[])]){
   if(!candidate)continue;
   const isLegacyRow=isLegacyQuote(candidate);
   // The unregistered legacy source never becomes a purchase target: it stays readable
   // with its own price and keeps the product-page link.
   if(isLegacyRow||!catalog.offerTarget){quote=candidate;break;}
   const target=await catalog.offerTarget({offerId:candidate.offerId,observationId:candidate.observationId,shipTo:sessionContext.shipTo});
   if(target&&(target as {url?:unknown}).url){quote=candidate;break;}
  }
  const pending=!!quote&&selection!.pendingDelivery.some(item=>item.offerId===quote.offerId&&item.observationId===quote.observationId);
  let legacy:LegacyPriceView|null=null;
  // The legacy SAR price predates destinations: with a destination chosen it is not
  // evidence for that destination, and with a non-SAR display currency it would be
  // shown in a unit it never had, so it is not used there at all.
  if(!quote&&catalog.legacyPrice&&!sessionContext.shipTo&&(!sessionContext.displayCurrency||sessionContext.displayCurrency==='SAR'))legacy=asLegacy(await catalog.legacyPrice(productId));
  const result:ProductOffers={selection,quote,pending,legacy,money:quote||legacy?moneyView(quote,legacy):null};
  resolved.set(cacheKey,result);return result;
 }
  // The budget is always the resolved context's budget: a per-call budget is folded into
  // that context before selection, never evaluated against a second, stored one.
  const inBudget=(entry:ProductOffers,effective:ShoppingContext)=>entry.quote?withinBudget(entry.quote.price,effective.budget):entry.legacy?(!effective.budget||(effective.budget.currency==='SAR'&&decimalCompare(String(entry.legacy.price),effective.budget.amount)<=0)):false;
 const productHref=(product:Product)=>`/products/${product.slug}`;
 /**
  * The card's link: the resolved offer target when this exact quote is buyable for the
  * chosen destination, otherwise the product page in the same contextKey. A legacy
  * product keeps its read-only original price and its product-page link.
  */
 async function cardLink(product:Product,entry:ProductOffers):Promise<{href:string;link:ChatProductCard['link']}>{
  const page={href:productHref(product),link:(entry.legacy?'LEGACY_PRODUCT':'PRODUCT') as ChatProductCard['link']};
  if(!entry.quote||entry.legacy)return page;
  const href=offerHref(entry.quote,linkContext);
  if(!href||!catalog.offerTarget)return page;
  const target=await catalog.offerTarget({offerId:entry.quote.offerId,observationId:entry.quote.observationId,shipTo:linkContext.shipTo});
  return target&&(target as {url?:unknown}).url?{href,link:'OFFER'}:page;
 }
 async function cardFor(product:Product,entry:ProductOffers):Promise<ChatProductCard>{
  const {href,link}=await cardLink(product,entry);
  return {id:product.id,slug:product.slug,name:getLocalizedName(product,locale),imageUrl:product.imageUrl,
   marketplaceCode:(entry.quote?.marketplaceCode??null) as 'SA'|'US'|null,
   offerId:entry.quote?.offerId??null,observationId:entry.quote?.observationId??null,
   href,link,context:linkContext,money:entry.money!,
   deliveryPending:entry.pending,
   storeName:entry.quote?marketName(entry.quote.marketplaceCode,locale):entry.legacy?.store?.name??null,
   verdictLabel:product.verdict?getVerdictLabel(product.verdict.type,locale):null,verdictScore:product.verdict?.overallScore??null,
   shopperRating:getShopperRating(product)?.averageRating??null};
 }
 // Only a coupon addressed to the public (and, with a destination chosen, to that
 // destination) exists for this turn: the route filters the feed, and the chat keeps
 // the same line so a members coupon can never be named in a reply.
 const publicCoupons=async()=>{
  const coupons=(await catalog.coupons()).filter(coupon=>(!coupon.audience||coupon.audience==='PUBLIC')&&(!context.shipTo||!coupon.eligibleCountries||(coupon.eligibleCountries as readonly string[]).includes(context.shipTo)));
  for(const coupon of coupons)seenCoupons.set(coupon.id,coupon);
  return coupons;
 };
 return {
 /** Every product this turn returned for the public audience: only these may reach a reply. */
  seenProducts,seenCoupons,load,contextKey:()=>contextKey,budgetAsked:()=>budgetAsked,
  /** The card for one seen product, or null when it has no current public offer here. */
  async resolveCard(product:Product):Promise<ChatProductCard|null>{
   const entry=await offersOf(product.id,context);
   return entry.money&&inBudget(entry,context)?cardFor(product,entry):null;
  },
  /**
   * The same card on its product page: used when the offer target no longer resolves.
   * The price fields and contextKey are untouched; only the link is stepped down.
   */
  async withoutOfferLink(card:ChatProductCard):Promise<ChatProductCard>{
   if(card.link!=='OFFER'||!card.offerId||!card.observationId||!catalog.offerTarget)return card;
   const target=await catalog.offerTarget({offerId:card.offerId,observationId:card.observationId,shipTo:card.context.shipTo});
   if(target&&(target as {url?:unknown}).url)return card;
   return {...card,href:`/products/${card.slug}`,link:card.money.legacy?'LEGACY_PRODUCT':'PRODUCT'};
  },
  /** A card whose offer no longer exists: priced fields dropped, no purchase target, no link. */
  goneCard(product:Product):ChatProductCard{
   return {id:product.id,slug:product.slug,name:getLocalizedName(product,locale),imageUrl:product.imageUrl,marketplaceCode:null,offerId:null,observationId:null,href:productHref(product),link:'PRODUCT',context:linkContext,
    money:{price:null,originalPrice:null,convertedPrice:null,legacyPrice:null,sourceId:null,checkedAt:null,taxBasis:'UNKNOWN',discountPercent:null,legacy:false},deliveryPending:false,
    storeName:null,verdictLabel:product.verdict?getVerdictLabel(product.verdict.type,locale):null,verdictScore:product.verdict?.overallScore??null,shopperRating:getShopperRating(product)?.averageRating??null};
  },
  /** Card for a product the model returned: only if this turn's tools produced it. */
  async existingCard(productId:string):Promise<ChatProductCard|null>{
   const product=seenProducts.get(productId);
   if(!product)return null;
   const entry=await offersOf(productId,context);
   return entry.money&&inBudget(entry,context)?cardFor(product,entry):null;
  },
  async run(name:string,args:Record<string,unknown>):Promise<unknown>{
   if(name==='search_products'){
    const asked=args.underPrice!=null||args.maxPrice!=null?resolveBudget(args,context):null;
    if(asked&&!asked.ok){budgetAsked=true;return {error:asked.reason,budgetAsked:true,note:'No price filter was applied and no currency was guessed. Ask the visitor to choose a display currency first.'};}
    // The tool's budget lives in this call only; the stored context stays the request's.
    const effective:ShoppingContext=asked&&asked.ok?{...context,budget:asked.budget}:context;
    const products=await load();
    const matched=searchCatalog(products,locale,{query:typeof args.query==='string'?args.query:undefined,ageMonths:typeof args.ageMonths==='number'?args.ageMonths:undefined,discountedOnly:args.discountedOnly===true});
    // Every candidate is resolved through the engine; only a current public offer for
    // this destination (or the legacy fallback) counts as a recommendation.
    const eligible:Array<{product:Product;entry:ProductOffers}>=[];
    for(const product of matched){const entry=await offersOf(product.id,effective);if(entry.money&&inBudget(entry,effective))eligible.push({product,entry});}
    const note=effective.budget?`Budget filter applied: ${effective.budget.amount} ${effective.budget.currency}. Prices in another currency are not matched.`:'No budget filter.';
    const recommended=eligible.slice(0,10);
    remember(recommended.map(item=>item.product));
    // Nothing in scope: never offer an unrelated product as "the closest option".
    if(!recommended.length)return {context:contextLine(effective),note,products:[],message:'No product matches this request for this destination with a current price.'};
    return {context:contextLine(effective),note,products:recommended.map(item=>summary(item.product,locale,item.entry))};
   }
   if(name==='get_product'){
    const product=(await load()).find(item=>item.id===args.id);
    if(!product)return {error:'Product is not available'};
    const entry=await offersOf(product.id,context);
    if(!entry.money||!inBudget(entry,context))return {error:'No current public offer for this product in the visitor’s context'};
    remember([product]);return detail(product,locale,entry);
   }
   if(name==='get_deals'){
    const result:Array<{product:Product;entry:ProductOffers;discount:number}>=[];
    for(const product of await load()){const entry=await offersOf(product.id,context);const discount=entry.quote?.discountPercent?Number(entry.quote.discountPercent):entry.legacy?.originalPrice?Math.round((entry.legacy.originalPrice-entry.legacy.price)/entry.legacy.originalPrice*100):0;if(entry.money&&discount>0&&inBudget(entry,context))result.push({product,entry,discount});}
    result.sort((a,b)=>b.discount-a.discount||a.product.id.localeCompare(b.product.id));
    const discounted=remember(result.slice(0,8).map(item=>item.product));
    const coupons=await publicCoupons();
    return {context:contextLine(context),products:discounted.map(product=>summary(product,locale,result.find(item=>item.product.id===product.id)!.entry)),coupons:coupons.map(coupon=>({id:coupon.id,store:coupon.store.name,description:parseCouponDescription(coupon.description).summary,verified:coupon.verified,validUntil:coupon.validUntil}))};
   }
   if(name==='get_site_info')return SITE_INFO[locale];
   return {error:'Unknown tool'};
  },
 };
}
export type ToolSession=ReturnType<typeof createToolSession>;
