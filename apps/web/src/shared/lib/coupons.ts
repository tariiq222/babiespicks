import {splitSentences} from './product-details';
import type {CouponScope} from '@babiespicks/domain';

export interface CouponDetails {summary:string;terms:string[];period:string|null;sourceUrl:string|null;checkedAt:string|null}
export function couponRequestPath(storeSlug:string|undefined,shipTo:'SA'|'US'|null):string{
 const query=new URLSearchParams();
 if(storeSlug)query.set('storeSlug',storeSlug);
 if(shipTo)query.set('shipTo',shipTo);
 return `/api/coupons${query.size?`?${query}`:''}`;
}
/** Missing eligibility/source evidence is not an expiry signal. */
export function couponPresentation(coupon:{code:string|null;expired?:boolean;validUntil:string|null;visibility?:string},now=Date.now()):{ended:boolean;code:string|null;notice:'destination'|'ineligible'|'review'|'unavailable'|null}{
 const ended=!!coupon.expired||coupon.visibility==='ENDED'||!!(coupon.validUntil&&Date.parse(coupon.validUntil)<=now);
 if(ended)return {ended:true,code:null,notice:null};
 const code=coupon.visibility==='VISIBLE'||coupon.visibility==='VISIBLE_WITHOUT_COUNTRY'?coupon.code:null;
 const notice=code?null:coupon.visibility==='COUNTRY_UNKNOWN'?'destination':coupon.visibility==='COUNTRY_INELIGIBLE'?'ineligible':coupon.visibility==='REVIEW_REQUIRED'?'review':'unavailable';
 return {ended:false,code,notice};
}
const ISO_WITH_OFFSET=/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/;
/** Coupon notes arrive as one paragraph; separate its facts so nothing long lands in the card body. */
export function parseCouponDescription(value:string|null):CouponDetails {
 const text=value??'';
 const checked=text.match(ISO_WITH_OFFSET)?.[0]??null;
 const cleaned=text
  .replace(/(?:المصدر|Source)\s*:\s*https?:\/\/\S+/gi,'')
  .replace(/https?:\/\/\S+/gi,'')
  .replace(/\(?\s*(?:تم التحقق|Checked)[^)]*\)?/gi,'')
  .replace(/(?:الفترة|Period)\s*:[^.\n]*\.?/gi,'')
  .replace(/\s+/g,' ').trim();
 const [summary='',...terms]=splitSentences(cleaned);
 return {summary,terms,period:text.match(/(?:الفترة|Period)\s*:\s*([^.\n]+)/i)?.[1]?.trim()??null,sourceUrl:text.match(/https:\/\/[^\s)]+/)?.[0]?.replace(/[.,،]$/,'')??null,checkedAt:checked&&Number.isFinite(Date.parse(checked))?checked:null};
}

const DAY_MS=86400000;
/** Whole days left, counting a part of a day as one; null when there is no end date. */
export function couponDaysLeft(validUntil:string|null,now=Date.now()):number|null {
 if(!validUntil)return null;
 return Math.ceil((Date.parse(validUntil)-now)/DAY_MS);
}

/** An amount and its currency as one unit; never a bare number. */
export interface CouponThreshold {amount:string;currency:string}
/** The currency label a reader sees, e.g. "USD". */
export const couponCurrencyLabel=(currency:string|null):string=>currency??'';
const normalizeAmount=(value:string|null|undefined):string|null=>{
 if(!value)return null;
 const text=value.trim().replace(/,/g,'');
 return /^\d+(?:\.\d{1,6})?$/.test(text)&&/[1-9]/.test(text)?text:null;
};
/**
 * Read the money condition from the structured scope only.
 * The description is prose: no regex turns "٥٠٠ ريال" into a claim, because a note
 * may be stale, in another currency, or about a different store's promotion.
 */
export function couponMinimumFromScope(scope:Pick<CouponScope,'minimumSpend'>|null|undefined):CouponThreshold|null {
 const money=scope?.minimumSpend;
 if(!money)return null;
 const amount=normalizeAmount(money.amount);
 return amount&&money.currency?{amount,currency:money.currency}:null;
}

export interface CouponAmountDisplay {original:CouponThreshold|null;converted:CouponThreshold|null;fxSourceId:string|null}
/**
 * The fixed discount as shown: the store's own number first, with an optional
 * clearly labelled conversion beside it. A preference never renames the original.
 */
export function couponAmountDisplay(scope:Pick<CouponScope,'display'>|null|undefined):CouponAmountDisplay {
 const original=scope?.display.original&&normalizeAmount(scope.display.original.amount)&&scope.display.original.currency?{amount:normalizeAmount(scope.display.original.amount)!,currency:scope.display.original.currency}:null;
 const estimate=scope?.display.estimate&&normalizeAmount(scope.display.estimate.amount)&&scope.display.estimate.currency?{amount:normalizeAmount(scope.display.estimate.amount)!,currency:scope.display.estimate.currency}:null;
 const label=scope?.display.fx?.sourceId&&scope?.display.convertedFrom&&estimate?estimate:null;
 return {original,converted:label,fxSourceId:label?scope!.display.fx!.sourceId:null};
}

/** A coupon claim that only exists in prose; shown as review text, never as a tag or number. */
export function couponHasUnstructuredTerms(scope:Pick<CouponScope,'reviewReasons'>|null|undefined):boolean {
 return !!scope?.reviewReasons.includes('LEGACY_UNSTRUCTURED_TERMS');
}

/** The stored minimum survives a display conversion untouched. */
export function couponMinimumLabel(minimum:CouponThreshold|null):string|null {
 return minimum?`${minimum.amount} ${couponCurrencyLabel(minimum.currency)}`:null;
}

/** Money values in scope, for the page to name its own currency rather than assume SAR. */
export function couponScopeCurrencies(scope:Pick<CouponScope,'currency'|'minimumSpend'|'maximumDiscount'>|null|undefined):string[] {
 if(!scope)return [];
 return [...new Set([scope.currency,scope.minimumSpend?.currency,scope.maximumDiscount?.currency].filter((value):value is string=>!!value))];
}

export const couponIsOncePerCustomer=(terms:string[])=>terms.some(term=>/مرة واحدة لكل|once per customer/i.test(term));

/** "10 USD" — an amount is never shown without the currency it was written in. */
export function formatCouponAmount(value:CouponThreshold|null):string|null {
 return value?`${value.amount} ${value.currency}`:null;
}
