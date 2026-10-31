import type {Product} from '../../shared/lib/api';
import {getLocalizedDesc,getLocalizedName} from '../../shared/lib/api';
import {getBestPrice,getDiscount,getShopperRating} from '../../shared/lib/catalog-filters';
import {getVerdictLabel,organizeProductDescription} from '../../shared/lib/product-details';
import type {ActiveCoupon} from '../public-queries';

export interface ChatCatalog {products(locale:string):Promise<Product[]>;coupons():Promise<ActiveCoupon[]>;}
export interface ChatProductCard {id:string;slug:string;name:string;imageUrl:string|null;price:number;originalPrice:number|null;discount:number;storeName:string|null;verdictLabel:string|null;verdictScore:number|null;shopperRating:number|null}
export interface ChatCouponCard {id:string;code:string;storeName:string;storeSlug:string;description:string|null;discountPercent:number|null;discountAmount:number|null;validUntil:string|null;verified:boolean}

const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export const CHAT_TOOLS=[
 {type:'function',function:{name:'search_products',description:'Search published, priced products. Omitted filters are not applied.',parameters:object({query:{type:'string',description:'Words from the request, such as playmat or stroller'},ageMonths:{type:'integer',minimum:0,maximum:216},maxPrice:{type:'number',minimum:0},discountedOnly:{type:'boolean'}})}},
 {type:'function',function:{name:'get_product',description:'Read one published product by id, including specs, strengths, cautions and ratings.',parameters:object({id:{type:'string'}},['id'])}},
 {type:'function',function:{name:'get_deals',description:'Read the strongest current product discounts and valid store coupons.',parameters:object({})}},
 {type:'function',function:{name:'get_site_info',description:'Read how BabiesPicks works: ratings, commission, prices and buying.',parameters:object({})}},
 {type:'function',function:{name:'submit_reply',description:'Send the final reply to the user.',parameters:object({kind:{type:'string',enum:['answer','out_of_scope','medical']},text:{type:'string'},productIds:{type:'array',items:{type:'string'}},couponIds:{type:'array',items:{type:'string'}},suggestions:{type:'array',items:{type:'string'},description:'Short follow-up messages the user might send'}},['kind','text','productIds','couponIds','suggestions'])}},
] as const;

const SITE_INFO={
 ar:'BabiesPicks يعرض عروض منتجات الأطفال وأسعارها وكوبوناتها في السعودية. الشراء يتم من المتجر نفسه وليس من الموقع. تقييم أمازون يأتي من المتسوقين، وتقييم BabiesPicks تحريري مستقل من 10 وله مصادر. قد نحصل على عمولة بدون تكلفة إضافية على المشتري. الأسعار قد تتغير، والشحن والتوفر يتأكد منهما المشتري في المتجر.',
 en:'BabiesPicks lists baby product offers, prices and coupons in Saudi Arabia. Purchases happen at the store, not on this site. The Amazon rating comes from shoppers; the BabiesPicks rating is a separate sourced editorial assessment out of 10. We may earn a commission at no extra cost to the buyer. Prices can change, and buyers confirm shipping and availability at the store.',
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
function summary(product:Product,locale:string){
 const price=getBestPrice(product);const rating=getShopperRating(product);
 return {id:product.id,name:getLocalizedName(product,locale),brand:product.brand,category:product.category?.name??null,price:price?.price??null,discountPercent:getDiscount(price)||null,store:price?.store?.name??null,ageKnown:product.ageMinMonths!=null||product.ageMaxMonths!=null,ageMinMonths:product.ageMinMonths??null,ageMaxMonths:product.ageMaxMonths??null,babiespicksRating:product.verdict?{score:product.verdict.overallScore,label:getVerdictLabel(product.verdict.type,locale)}:null,amazonRating:rating?{average:rating.averageRating,reviews:rating.totalReviews}:null};
}
function detail(product:Product,locale:string){
 const ar=locale==='ar';const review=product.reviewSummary;const verdict=product.verdict;
 return {...summary(product,locale),description:organizeProductDescription(getLocalizedDesc(product,locale)).slice(0,1500),specs:product.specs.filter(spec=>spec.locale===locale).slice(0,20).map(({key,value})=>({key,value})),strengths:(ar?review?.prosAr:review?.prosEn)??[],cautions:(ar?review?.consAr:review?.consEn)??[],ratingReason:(ar?verdict?.reasoningAr:verdict?.reasoningEn)??null,goodFitIf:(ar?verdict?.conditionsAr:verdict?.conditionsEn)??[]};
}
const score=(product:Product)=>(product.verdict?.overallScore??0)+getDiscount(getBestPrice(product))/100;

/** Keyword match over published, priced products. Commission never takes part in ranking. */
export function searchCatalog(products:Product[],locale:string,args:{query?:string;ageMonths?:number;maxPrice?:number;discountedOnly?:boolean},limit=10):Product[]{
 const words=normalize(args.query??'').split(/\s+/).filter(word=>word.length>1&&!stopWords.has(word));
 const ranked=products.flatMap(product=>{
  const price=getBestPrice(product);if(!price)return [];
  if(args.maxPrice!==undefined&&price.price>args.maxPrice)return [];
  if(args.discountedOnly&&!getDiscount(price))return [];
  const age=args.ageMonths===undefined?'unknown':ageFit(product,args.ageMonths);if(age==='excluded')return [];
  const text=searchable(product,locale);
  const has=(value:string,word:string)=>wordForms(word).some(form=>value.includes(form));
  const direct=words.filter(word=>has(text.main,word)).length;const partial=words.filter(word=>has(text.rest,word)).length;
  if(words.length&&!direct&&!partial)return [];
  const category=normalize(`${product.category?.name??''} ${product.category?.nameEn??''}`);
  return [{product,inCategory:words.some(word=>has(category,word)),direct:direct>0,rank:direct*30+partial*5+(age==='fits'?5:0)+score(product)}];
 });
 const sorted=ranked.sort((a,b)=>b.rank-a.rank);
 const inCategory=sorted.filter(item=>item.inCategory);const direct=sorted.filter(item=>item.direct);
 return (inCategory.length?inCategory:direct.length?direct:sorted).slice(0,limit).map(item=>item.product);
}

export function toProductCard(product:Product,locale:string):ChatProductCard|null{
 const price=getBestPrice(product);if(!price)return null;
 return {id:product.id,slug:product.slug,name:getLocalizedName(product,locale),imageUrl:product.imageUrl,price:price.price,originalPrice:price.originalPrice,discount:getDiscount(price),storeName:price.store?.name??null,verdictLabel:product.verdict?getVerdictLabel(product.verdict.type,locale):null,verdictScore:product.verdict?.overallScore??null,shopperRating:getShopperRating(product)?.averageRating??null};
}
export const toCouponCard=(coupon:ActiveCoupon):ChatCouponCard=>({id:coupon.id,code:coupon.code,storeName:coupon.store.name,storeSlug:coupon.store.slug,description:coupon.description,discountPercent:coupon.discountPercent,discountAmount:coupon.discountAmount,validUntil:coupon.validUntil,verified:coupon.verified});

/** One conversation turn's view of the catalog: only ids it actually returned can reach the reply. */
export function createToolSession(catalog:ChatCatalog,locale:'ar'|'en'){
 const seenProducts=new Map<string,Product>();const seenCoupons=new Map<string,ActiveCoupon>();let all:Promise<Product[]>|undefined;
 const load=()=>all??=catalog.products(locale);
 const remember=(products:Product[])=>{for(const product of products)seenProducts.set(product.id,product);return products;};
 return {
  seenProducts,seenCoupons,load,
  async run(name:string,args:Record<string,unknown>):Promise<unknown>{
   if(name==='search_products'){
    const products=await load();const matches=searchCatalog(products,locale,args as never);
    if(matches.length||!args.query)return remember(matches).map(product=>summary(product,locale));
    return {note:'Closest available products. Do not search again; present them as options that may fit.',products:remember(searchCatalog(products,locale,{...args,query:undefined} as never,5)).map(product=>summary(product,locale))};
   }
   if(name==='get_product'){
    const product=(await load()).find(item=>item.id===args.id);
    return product?detail(remember([product])[0],locale):{error:'Product is not available'};
   }
   if(name==='get_deals'){
    const discounted=remember([...await load()].filter(product=>getDiscount(getBestPrice(product))>0).sort((a,b)=>getDiscount(getBestPrice(b))-getDiscount(getBestPrice(a))).slice(0,8));
    const coupons=await catalog.coupons();for(const coupon of coupons)seenCoupons.set(coupon.id,coupon);
    return {products:discounted.map(product=>summary(product,locale)),coupons:coupons.map(coupon=>({id:coupon.id,store:coupon.store.name,description:coupon.description,verified:coupon.verified,validUntil:coupon.validUntil}))};
   }
   if(name==='get_site_info')return SITE_INFO[locale];
   return {error:'Unknown tool'};
  },
 };
}
