import {splitSentences} from './product-details';

export interface CouponDetails {summary:string;terms:string[];period:string|null;sourceUrl:string|null;checkedAt:string|null}
/** Coupon notes arrive as one paragraph; separate its facts so nothing long lands in the card body. */
export function parseCouponDescription(value:string|null):CouponDetails {
 const text=value??'';
 const checked=text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z/)?.[0]??null;
 const cleaned=text
  .replace(/(?:المصدر|Source)\s*:\s*https?:\/\/\S+/gi,'')
  .replace(/https?:\/\/\S+/gi,'')
  .replace(/\(?\s*(?:تم التحقق|Checked)[^)]*\)?/gi,'')
  .replace(/(?:الفترة|Period)\s*:[^.\n]*\.?/gi,'')
  .replace(/\s+/g,' ').trim();
 const [summary='',...terms]=splitSentences(cleaned);
 return {summary,terms,period:text.match(/(?:الفترة|Period)\s*:\s*([^.\n]+)/i)?.[1]?.trim()??null,sourceUrl:text.match(/https:\/\/[^\s)]+/)?.[0]?.replace(/[.,،]$/,'')??null,checkedAt:checked&&Number.isFinite(Date.parse(checked))?checked:null};
}
