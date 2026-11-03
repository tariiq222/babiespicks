import {describe,expect,it} from 'vitest';
import {couponAmountDisplay,couponDaysLeft,couponIsOncePerCustomer,couponMinimumFromScope,couponMinimumLabel,couponScopeCurrencies,couponHasUnstructuredTerms,parseCouponDescription,couponPresentation,couponRequestPath} from './coupons';
import {mergeCouponScope,resolveCouponScope,type CouponScopeRow} from '@babiespicks/domain';

const row=(overrides:Partial<CouponScopeRow>={}):CouponScopeRow=>({id:'c1',code:'BABY10',storeId:'s1',discountPercent:null,discountAmount:null,validFrom:null,validUntil:null,status:'ACTIVE',couponCurrency:null,minimumSpendAmount:null,minimumSpendCurrency:null,eligibleCountries:['SA'],audience:'PUBLIC',sourceId:'amazon-creators-api-sa',checkedAt:new Date('2026-11-20T10:00:00Z'),couponValidUntil:null,thirdPartyVerified:true,...overrides});

describe('coupon description',()=>{
 it('forwards destination to global and store coupon reads',()=>{
  expect(couponRequestPath(undefined,'SA')).toBe('/api/coupons?shipTo=SA');
  expect(couponRequestPath('amazon-us','US')).toBe('/api/coupons?storeSlug=amazon-us&shipTo=US');
 });
 it('does not call an active hidden-code coupon expired',()=>{
  expect(couponPresentation({code:null,expired:false,validUntil:null,visibility:'COUNTRY_UNKNOWN'})).toEqual({ended:false,code:null,notice:'destination'});
  expect(couponPresentation({code:null,expired:false,validUntil:null,visibility:'UNVERIFIED_SOURCE'})).toEqual({ended:false,code:null,notice:'unavailable'});
  expect(couponPresentation({code:'OLD',expired:false,validUntil:'2020-01-01T00:00:00Z',visibility:'VISIBLE'}).ended).toBe(true);
 });
 it('separates summary, terms, period, source and check date',()=>{
  const details=parseCouponDescription('خصم 15% عند الشراء بـ 200 ريال أو أكثر (منها فيليبس أفنت). يسري فقط على منتجات أمازون. الفترة: 22 أكتوبر – 22 نوفمبر 2026. المصدر: https://www.amazon.sa/-/en/promotion/psp/A1YR74HFSIY093 (تم التحقق 2026-10-31T06:50:00Z)');
  expect(details).toEqual({summary:'خصم 15% عند الشراء بـ 200 ريال أو أكثر (منها فيليبس أفنت).',terms:['يسري فقط على منتجات أمازون.'],period:'22 أكتوبر – 22 نوفمبر 2026',sourceUrl:'https://www.amazon.sa/-/en/promotion/psp/A1YR74HFSIY093',checkedAt:'2026-10-31T06:50:00Z'});
 });
 it('keeps a plain note and handles an empty one',()=>{
  expect(parseCouponDescription('خصم للطلب الأول').summary).toBe('خصم للطلب الأول');
  expect(parseCouponDescription(null).summary).toBe('');
 });
 it('reads days left and the once-only term',()=>{
  const now=Date.parse('2026-11-20T12:00:00Z');
  expect(couponDaysLeft('2026-11-22T00:00:00Z',now)).toBe(2);expect(couponDaysLeft('2026-11-19T00:00:00Z',now)).toBeLessThan(0);expect(couponDaysLeft(null,now)).toBeNull();
  expect(couponIsOncePerCustomer(['مرة واحدة لكل عميلة، في طلب واحد.'])).toBe(true);
 });
 it('keeps an offset when the note records it and ignores a bare date',()=>{
  expect(parseCouponDescription('(تم التحقق 2026-11-20T14:00:00+03:00)').checkedAt).toBe('2026-11-20T14:00:00+03:00');
  expect(parseCouponDescription('(تم التحقق 2026-11-20)').checkedAt).toBeNull();
 });
});

describe('money condition comes from structured fields',()=>{
 it('no longer extracts a minimum spend from the description text',()=>{
  const note='خصم 15% عند الشراء بـ 200 ريال أو أكثر';
  const legacy=resolveCouponScope(row({discountPercent:15,descriptionText:note}));
  expect(couponMinimumFromScope(legacy)).toBeNull();
  expect(couponHasUnstructuredTerms(legacy)).toBe(false);
 });
 it('shows the stored minimum with its own currency',()=>{
  const scope=resolveCouponScope(row({discountPercent:15,minimumSpendAmount:'200.000000',couponCurrency:'SAR'}));
  expect(couponMinimumFromScope(scope)).toEqual({amount:'200',currency:'SAR'});
  expect(couponMinimumLabel(couponMinimumFromScope(scope))).toBe('200 SAR');
 });
 it('never states a minimum without a currency',()=>{
  expect(couponMinimumFromScope({minimumSpend:{amount:'50',currency:null}} as never)).toBeNull();
  expect(couponMinimumFromScope(null)).toBeNull();
 });
 it('marks a note-only money claim for review instead of rendering it as a tag',()=>{
  const legacy=resolveCouponScope(row({discountPercent:null,descriptionText:'حد أدنى 200 ريال'}));
  expect(couponHasUnstructuredTerms(legacy)).toBe(true);
  expect(couponMinimumFromScope(legacy)).toBeNull();
 });
});

describe('10 USD coupon with an SAR preference',()=>{
 const scope=resolveCouponScope(row({discountAmount:'10',couponCurrency:'USD',minimumSpendAmount:'50',minimumSpendCurrency:'USD',sourceId:'amazon-creators-api-us',eligibleCountries:['US']}));
 it('keeps the original USD number as the headline',()=>{
  expect(couponAmountDisplay(scope)).toEqual({original:{amount:'10',currency:'USD'},converted:null,fxSourceId:null});
 });
 it('shows the conversion as an optional, labelled second value',()=>{
  const converted=mergeCouponScope(scope,{discount:{kind:'AMOUNT',money:{amount:'37.5',currency:'SAR'}},display:{convertedFrom:{amount:'10',currency:'USD'},fx:{sourceId:'amazon-creators-api-us',asOf:'2026-11-20T11:00:00Z'}}});
  expect(couponAmountDisplay(converted)).toEqual({original:{amount:'10',currency:'USD'},converted:{amount:'37.5',currency:'SAR'},fxSourceId:'amazon-creators-api-us'});
  // The original is unchanged; nothing relabels 10 USD as 10 SAR.
  expect(couponAmountDisplay(converted).original).toEqual({amount:'10',currency:'USD'});
 });
 it('does not turn the USD minimum into a Riyadh-currency limit',()=>{
  expect(couponMinimumFromScope(scope)).toEqual({amount:'50',currency:'USD'});
  const converted=mergeCouponScope(scope,{minimumSpend:{amount:'187.5',currency:'SAR'}});
  expect(couponMinimumFromScope(converted)).toEqual({amount:'50',currency:'USD'});
  expect(couponScopeCurrencies(converted)).toEqual(['USD']);
 });
 it('keeps a legacy amount wordless instead of printing it as SAR',()=>{
  const legacy=resolveCouponScope(row({discountAmount:'25'}));
  expect(couponAmountDisplay(legacy)).toEqual({original:null,converted:null,fxSourceId:null});
  expect(couponScopeCurrencies(legacy)).toEqual([]);
 });
});
