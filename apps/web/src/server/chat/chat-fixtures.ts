import type {Product} from '../../shared/lib/api';
import type {ShoppingContext} from '@babiespicks/domain/international';
import type {ChatCatalog} from './chat-tools';
import {LEGACY_SOURCE_ID} from '../../../../../scripts/operations/backfill-international';

const store={id:'s1',name:'أمازون',slug:'amazon'};
function product(id:string,name:string,price:number,extra:Partial<Product>={}):Product{
 return {id,name,slug:id,brand:'Brand',imageUrl:null,isActive:true,translations:[{locale:'ar',name,description:`${name} للأطفال`,slug:id}],verdict:null,prices:[{price,originalPrice:null,currency:'SAR',storeId:'s1',store}],category:{name:'ألعاب',slug:'toys'},specs:[],reviewSummary:null,...extra};
}
const verdict=(overallScore:number):Product['verdict']=>({type:'WORTH_IT',overallScore,safetyScore:8,qualityScore:8,reviewsScore:8,priceScore:8,longTermScore:8,reasoningAr:'سبب',reasoningEn:'Reason',conditionsAr:[],conditionsEn:[]});
export const FIXTURE_PRODUCTS=[
 product('playmat','فرشة لعب سميكة',149,{ageMinMonths:0,ageMaxMonths:12,verdict:verdict(8)}),
 product('piano','صالة لعب بيانو',199,{ageMinMonths:0,ageMaxMonths:36,verdict:verdict(7.8)}),
 product('stroller','عربة أطفال خفيفة',499,{ageMinMonths:6,ageMaxMonths:48,category:{name:'التنقل',slug:'travel'},prices:[{price:499,originalPrice:599,currency:'SAR',storeId:'s1',store}]}),
 product('bouncer','كرسي هزاز من برايت ستارتس مع قوس ألعاب',191,{category:{name:'مستلزمات التنقل والجلوس',slug:'travel'},verdict:verdict(6.7)}),
 product('bottle','رضاعة مضادة للمغص',39,{category:{name:'الرضاعة',slug:'feeding'},prices:[{price:39,originalPrice:52,currency:'SAR',storeId:'s1',store}]}),
];

// ── Task 6-shaped selections in the fixture catalog ─────────────────────────
// The chat reads offers through the engine, so the fixture answers the same way:
// a SA price in SAR, a US-only product that must not appear for SA, and a members
// price that must never reach the public chat.

interface FixtureQuote {
 offerId:string;observationId:string;productId:string;marketplaceCode:'SA'|'US';listingId:string;
 sellerKey:string;fulfillerKey:string;
 price:{amount:string;currency:string};originalPrice:{amount:string;currency:string}|null;
 convertedPrice:{amount:string;currency:string}|null;fxSnapshotId:string|null;
 taxBasis:'INCLUDED'|'EXCLUDED'|'UNKNOWN';checkedAt:string;expiresAt:string;audience:'PUBLIC'|'MEMBERS';
 delivery:{state:'OBSERVED_AVAILABLE'|'OBSERVED_UNAVAILABLE'|'UNKNOWN';country:'SA'|'US'|null;precision:string;checkedAt:string|null};
 comparisonGroup:string;discountPercent:string|null;
 /** The engine names the price observation's source; legacy rows are read-only. */
 sourceId?:string;
}
const quote=(input:{offerId:string;productId:string;marketplaceCode:'SA'|'US';amount:string;currency:string;original?:string;audience?:'PUBLIC'|'MEMBERS';converted?:string}):FixtureQuote=>{
 const discount=input.original?String(Math.round((Number(input.original)-Number(input.amount))/Number(input.original)*100)):null;
 return {offerId:input.offerId,observationId:`obs-${input.offerId}`,productId:input.productId,marketplaceCode:input.marketplaceCode,listingId:`lst-${input.offerId}`,
  sellerKey:`seller-${input.offerId}`,fulfillerKey:`seller-${input.offerId}`,
  price:{amount:input.amount,currency:input.currency},originalPrice:input.original?{amount:input.original,currency:input.currency}:null,
  // The engine never returns a converted price for a disabled source (T1); the fixture
  // mirrors that and the card shows the original only.
  convertedPrice:null,fxSnapshotId:null,taxBasis:'INCLUDED',checkedAt:'2026-11-02T10:00:00.000Z',expiresAt:'2026-11-02T11:00:00.000Z',
  audience:input.audience??'PUBLIC',delivery:{state:'UNKNOWN',country:null,precision:'UNKNOWN',checkedAt:null},
  comparisonGroup:`${input.productId}|${input.currency}`,discountPercent:discount,sourceId:'fixture-source'};
};
/** A legacy SAR observation: readable by the engine, never a purchase target (unregistered). */
const legacyQuote=({productId,offerId,amount}:{productId:string;offerId:string;amount:string}):FixtureQuote=>({
 offerId,observationId:`obs-${offerId}`,productId,marketplaceCode:'SA',listingId:`lst-${offerId}`,
 sellerKey:`seller-${offerId}`,fulfillerKey:'NO_TRUSTED_FULFILLER',price:{amount,currency:'SAR'},originalPrice:null,
 convertedPrice:null,fxSnapshotId:null,taxBasis:'UNKNOWN',checkedAt:'2026-11-01T00:00:00.000Z',expiresAt:'2027-11-01T00:00:00.000Z',
 audience:'PUBLIC',delivery:{state:'UNKNOWN',country:null,precision:'UNKNOWN',checkedAt:null},
 comparisonGroup:`${productId}|SAR`,discountPercent:null,sourceId:LEGACY_SOURCE_ID,
});
const SELECTIONS:Record<string,FixtureQuote>={
 playmat:quote({offerId:'o-playmat',productId:'playmat',marketplaceCode:'SA',amount:'149',currency:'SAR',original:'199'}),
 piano:quote({offerId:'o-piano',productId:'piano',marketplaceCode:'SA',amount:'199',currency:'SAR'}),
 stroller:quote({offerId:'o-stroller',productId:'stroller',marketplaceCode:'SA',amount:'499',currency:'SAR',original:'599'}),
 bouncer:quote({offerId:'o-bouncer',productId:'bouncer',marketplaceCode:'SA',amount:'191',currency:'SAR'}),
 bottle:quote({offerId:'o-bottle',productId:'bottle',marketplaceCode:'SA',amount:'39',currency:'SAR',original:'52'}),
 'us-only':quote({offerId:'o-usonly',productId:'us-only',marketplaceCode:'US',amount:'20',currency:'USD'}),
 'members-only':quote({offerId:'o-members',productId:'members-only',marketplaceCode:'SA',amount:'99',currency:'SAR',audience:'MEMBERS'}),
 'usd-public':quote({offerId:'o-usd',productId:'usd-public',marketplaceCode:'US',amount:'40',currency:'USD'}),
};

export const OBSERVATION_EXPIRED:ReadonlySet<string>=new Set(['obs-o-playmat']);
export const LEGACY_PRODUCT=product('legacy-pad','وسادة سفر قديمة',59);
export {LEGACY_SOURCE_ID};
/** Engine-shaped selection for one product in a context: a wrong destination or the members audience never qualifies. */
export function fixtureSelection(productId:string,context:ShoppingContext){
 const row=SELECTIONS[productId];if(!row)return null;
 // A quote must match the audience and the destination: a members-only row is not a
 // public quote (the chat never asks for a members audience), and a US offer is not a
 // quote for a SA visitor.
 const eligible=row.audience===context.audience&&(context.shipTo===null||row.marketplaceCode===context.shipTo);
 return {quotes:eligible?[row]:[],pendingDelivery:eligible?[row]:[],bestByGroup:eligible?{[row.comparisonGroup]:row.offerId}:{},
  reason:eligible?'OK':'NO_ELIGIBLE_OFFER',contextKey:JSON.stringify({locale:context.locale,shipTo:context.shipTo,displayCurrency:context.displayCurrency,budget:context.budget,audience:context.audience}),fxSnapshotId:null};
}
export const FIXTURE_EXTRA_PRODUCTS=[
 product('us-only','لعبة أمريكية فقط',20,{prices:[{price:20,originalPrice:null,currency:'USD',storeId:'s2',store:{id:'s2',name:'Amazon US',slug:'amazon-us'}}]}),
 product('members-only','فرشة للأعضاء',99),
 product('usd-public','رضاعة دولارية',40,{prices:[{price:40,originalPrice:null,currency:'USD',storeId:'s2',store:{id:'s2',name:'Amazon US',slug:'amazon-us'}}]}),
];
export const FIXTURE_CATALOG:ChatCatalog={
 products:async()=>[...FIXTURE_PRODUCTS,...FIXTURE_EXTRA_PRODUCTS,LEGACY_PRODUCT],
 coupons:async()=>[
  {id:'c1',code:'BABY10',description:'خصم للطلب الأول',discountPercent:10,discountAmount:null,discountCurrency:null,minimumSpend:null,validUntil:null,verified:true,visibility:'VISIBLE',audience:'PUBLIC',eligibleCountries:['SA'],store:{name:'أمازون',slug:'amazon'}},
  // A members-only coupon must never reach the public chat, whatever the model asks for.
  {id:'c-members',code:'MEMBERS50',description:'خصم للأعضاء',discountPercent:50,discountAmount:null,discountCurrency:null,minimumSpend:null,validUntil:null,verified:true,visibility:'VISIBLE',audience:'MEMBERS',eligibleCountries:['SA'],store:{name:'أمازون',slug:'amazon'}},
 ],
 offers:async(productId:string,context:ShoppingContext)=>fixtureSelection(productId,context),
 legacyPrice:async(productId:string)=>productId==='legacy-pad'?{price:59,originalPrice:null,currency:'SAR',checkedAt:'2026-11-01T00:00:00.000Z',store:{name:'أمازون',slug:'amazon'}}:null,
 // Task 7 resolveOfferTarget in the fixture: only the observation of a quote eligible in
 // this destination resolves; an observation in OBSERVATION_EXPIRED does not.
 offerTarget:async({offerId,observationId,shipTo})=>{
  const row=Object.values(SELECTIONS).find(item=>item.offerId===offerId&&item.observationId===observationId);
  if(!row||shipTo===null||row.marketplaceCode!==shipTo||row.audience!=='PUBLIC')return null;
  if(OBSERVATION_EXPIRED.has(observationId))return null;
  return {url:`https://www.${row.marketplaceCode==='SA'?'amazon.sa':'amazon.com'}/dp/${offerId}`,offerId:row.offerId,listingId:row.listingId,marketplaceCode:row.marketplaceCode,observedSellerKey:row.sellerKey,price:row.price};
 },
};
