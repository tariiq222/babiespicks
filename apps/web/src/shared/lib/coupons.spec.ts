import {describe,expect,it} from 'vitest';
import {couponDaysLeft,couponIsOncePerCustomer,couponMinimumSpend,parseCouponDescription} from './coupons';

describe('coupon description',()=>{
 it('separates summary, terms, period, source and check date',()=>{
  const details=parseCouponDescription('خصم 15% عند الشراء بـ 200 ريال أو أكثر (منها فيليبس أفنت). يسري فقط على منتجات أمازون. الفترة: 22 أكتوبر – 22 نوفمبر 2026. المصدر: https://www.amazon.sa/-/en/promotion/psp/A1YR74HFSIY093 (تم التحقق 2026-10-31T06:50:00Z)');
  expect(details).toEqual({summary:'خصم 15% عند الشراء بـ 200 ريال أو أكثر (منها فيليبس أفنت).',terms:['يسري فقط على منتجات أمازون.'],period:'22 أكتوبر – 22 نوفمبر 2026',sourceUrl:'https://www.amazon.sa/-/en/promotion/psp/A1YR74HFSIY093',checkedAt:'2026-10-31T06:50:00Z'});
 });
 it('keeps a plain note and handles an empty one',()=>{
  expect(parseCouponDescription('خصم للطلب الأول').summary).toBe('خصم للطلب الأول');
  expect(parseCouponDescription(null).summary).toBe('');
 });
 it('reads days left, minimum spend and the once-only term',()=>{
  const now=Date.parse('2026-11-20T12:00:00Z');
  expect(couponDaysLeft('2026-11-22T00:00:00Z',now)).toBe(2);expect(couponDaysLeft('2026-11-19T00:00:00Z',now)).toBeLessThan(0);expect(couponDaysLeft(null,now)).toBeNull();
  expect(couponMinimumSpend('خصم 15% عند الشراء بـ 200 ريال أو أكثر')).toBe(200);expect(couponMinimumSpend('خصم للطلب الأول')).toBeNull();
  expect(couponIsOncePerCustomer(['مرة واحدة لكل عميلة، في طلب واحد.'])).toBe(true);
 });
});
