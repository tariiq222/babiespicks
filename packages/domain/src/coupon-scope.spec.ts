import { describe, expect, it, vi } from 'vitest';
const approval = vi.hoisted(() => ({ enforce: false }));
vi.mock('./source-policy', async () => {
  const actual = await vi.importActual<typeof import('./source-policy')>('./source-policy');
  return { ...actual, couponSourcePolicy: (sourceId: string | null | undefined) => {
    const policy = actual.couponSourcePolicy(sourceId);
    return !approval.enforce && policy ? { ...policy, enabled: true, status: 'VERIFIED' as const } : policy;
  } };
});
import {
  couponScopeSchema,
  couponScopeIssues,
  mergeCouponScope,
  resolveCouponScope,
  isCouponEnded,
  couponVisibility,
  COUPON_SOURCE_IDS,
  type CouponScopeRow,
} from './coupon-scope';

/** A fully sourced, verified PUBLIC coupon: the baseline each case varies one field from. */
const row = (overrides: Partial<CouponScopeRow> = {}): CouponScopeRow => ({
  id: 'c1', code: 'BABY10', storeId: 's1', discountPercent: null, discountAmount: null,
  validFrom: null, validUntil: null, status: 'ACTIVE',
  couponCurrency: null, minimumSpendAmount: null, minimumSpendCurrency: null,
  eligibleCountries: ['SA'], audience: 'PUBLIC', sourceId: 'amazon-creators-api-sa',
  checkedAt: new Date('2026-11-20T10:00:00Z'), couponValidUntil: null,
  thirdPartyVerified: true,
  ...overrides,
});
const now = new Date('2026-11-20T12:00:00Z');
/** A visitor who explicitly chose one delivery country — the only context that can reveal a code. */
const inSA = { eligibleCountries: ['SA'] };

describe('coupon currency contract', () => {
  it('requires a currency for a fixed-amount discount', () => {
    expect(couponScopeIssues({ discountPercent: null, discountAmount: '10' })).toContainEqual({ path: 'couponCurrency', code: 'COUPON_CURRENCY_REQUIRED' });
  });

  it('accepts a percentage coupon without any currency', () => {
    expect(couponScopeIssues({ discountPercent: 15 })).toEqual([]);
    const scope = resolveCouponScope(row({ discountPercent: 15 }));
    expect(scope.discount).toEqual({ kind: 'PERCENT', percent: 15 });
    expect(scope.currency).toBeNull();
    expect(scope.minimumSpend).toBeNull();
    expect(scope.display).toEqual({ original: null, estimate: null, convertedFrom: null, fx: null, headline: null });
  });

  it('requires a currency once a percentage coupon states a money limit', () => {
    expect(couponScopeIssues({ discountPercent: 15, minimumSpendAmount: '200' })).toContainEqual({ path: 'couponCurrency', code: 'COUPON_CURRENCY_REQUIRED' });
    // Writing the same currency on the limit column satisfies it: one currency, one limit.
    expect(couponScopeIssues({ discountPercent: 15, minimumSpendAmount: '200', couponCurrency: 'SAR' })).toEqual([]);
    expect(couponScopeIssues({ discountPercent: 15, minimumSpendAmount: '200', minimumSpendCurrency: 'SAR' })).toEqual([]);
    // A maximum-discount ceiling is a money limit too.
    expect(couponScopeIssues({ maximumDiscountAmount: '50', couponCurrency: 'SAR' })).toEqual([]);
    expect(couponScopeIssues({ maximumDiscountAmount: '50' })).toContainEqual({ path: 'couponCurrency', code: 'COUPON_CURRENCY_REQUIRED' });
  });

  it('rejects a percentage out of range and a zero or negative amount', () => {
    expect(couponScopeIssues({ discountPercent: 0 })).toEqual([{ path: 'discountPercent', code: 'PERCENT_RANGE' }]);
    expect(couponScopeIssues({ discountPercent: 101 })).toEqual([{ path: 'discountPercent', code: 'PERCENT_RANGE' }]);
    expect(couponScopeIssues({ discountPercent: null, discountAmount: '0', couponCurrency: 'USD' })).toEqual([{ path: 'discountAmount', code: 'AMOUNT_NOT_POSITIVE' }]);
  });

  it('refuses to change the meaning of legacy rows that have an amount and no currency', () => {
    const scope = resolveCouponScope(row({ discountAmount: '25' }));
    expect(scope.currency).toBeNull();
    expect(scope.discount).toBeNull();
    expect(scope.legacyAmount).toEqual({ amount: '25', currency: null });
    expect(scope.reviewReasons).toContain('LEGACY_CURRENCY_UNKNOWN');
    expect(couponVisibility(scope, now, inSA)).toEqual({ state: 'REVIEW_REQUIRED', code: null, ended: false, verified: false });
  });

  it('rejects an unapproved currency code instead of guessing one', () => {
    expect(couponScopeSchema.safeParse({ discountPercent: null, discountAmount: '10', couponCurrency: 'XYZ' }).success).toBe(false);
    expect(couponScopeIssues({ discountAmount: '10', couponCurrency: 'xyz' })).toContainEqual({ path: 'couponCurrency', code: 'UNSUPPORTED_CURRENCY' });
  });
});

describe('10 USD coupon with an SAR preference', () => {
  const scope = resolveCouponScope(row({ discountAmount: '10', couponCurrency: 'USD', sourceId: 'amazon-creators-api-us', eligibleCountries: ['US'], couponValidUntil: new Date('2026-12-01T00:00:00Z') }));

  it('keeps the original USD number fixed and never relabels it as SAR', () => {
    expect(scope.discount).toEqual({ kind: 'AMOUNT', money: { amount: '10', currency: 'USD' } });
    expect(JSON.stringify(scope)).not.toContain('SAR');
  });

  it('offers a conversion that is clearly optional and labelled by its own rate and source', () => {
    const converted = mergeCouponScope(scope, {
      discount: { kind: 'AMOUNT', money: { amount: '37.5', currency: 'SAR' } },
      display: { convertedFrom: { amount: '10', currency: 'USD' }, fx: { sourceId: 'amazon-creators-api-us', asOf: '2026-11-20T11:00:00Z' } },
    });
    expect(converted.discount).toEqual({ kind: 'AMOUNT', money: { amount: '10', currency: 'USD' } });
    expect(converted.display.estimate).toEqual({ amount: '37.5', currency: 'SAR' });
    expect(converted.display.convertedFrom).toEqual({ amount: '10', currency: 'USD' });
    expect(converted.display.fx?.sourceId).toBe('amazon-creators-api-us');
    // The headline stays the store's own number; the estimate is never promoted to it.
    expect(converted.display.headline).toEqual({ amount: '10', currency: 'USD' });
    // Re-merging cannot fold the estimate back into the stored claim.
    expect(mergeCouponScope(converted, { discount: null }).discount).toEqual(scope.discount);
  });

  it('drops a conversion that has no rate label instead of showing a bare foreign number', () => {
    const unlabelled = mergeCouponScope(scope, { discount: { kind: 'AMOUNT', money: { amount: '37.5', currency: 'SAR' } } });
    expect(unlabelled.display.estimate).toBeNull();
    expect(unlabelled.display.headline).toEqual({ amount: '10', currency: 'USD' });
  });

  it('never becomes an SAR minimum-spend condition on its own', () => {
    const usdMinimum = resolveCouponScope(row({ discountAmount: '10', couponCurrency: 'USD', minimumSpendAmount: '50', sourceId: 'amazon-creators-api-us', eligibleCountries: ['US'] }));
    expect(usdMinimum.minimumSpend).toEqual({ amount: '50', currency: 'USD' });
    expect(JSON.stringify(usdMinimum.minimumSpend)).not.toContain('SAR');
    expect(scope.minimumSpend).toBeNull();
    // Even with an SAR display conversion supplied, the structured minimum does not move.
    const converted = mergeCouponScope(usdMinimum, { minimumSpend: { amount: '187.5', currency: 'SAR' } });
    expect(converted.minimumSpend).toEqual({ amount: '50', currency: 'USD' });
  });
});

describe('structured minimum replaces regex extraction', () => {
  it('takes the minimum from the column pair, not from the description text', () => {
    const fromText = resolveCouponScope(row({ discountPercent: 15, descriptionText: 'خصم 15% عند الشراء بـ 200 ريال أو أكثر' }));
    expect(fromText.minimumSpend).toBeNull();
    expect(fromText.discount).toEqual({ kind: 'PERCENT', percent: 15 });
    const structured = resolveCouponScope(row({ discountPercent: 15, minimumSpendAmount: '200.000000', couponCurrency: 'SAR', descriptionText: 'خصم 15% عند الشراء بـ 200 ريال أو أكثر' }));
    expect(structured.minimumSpend).toEqual({ amount: '200', currency: 'SAR' });
    expect(structured.discount).toEqual({ kind: 'PERCENT', percent: 15 });
  });

  it('flags the notes-only row for review instead of inventing claims from the text', () => {
    // A percentage with no amount explains itself; a note that only names a spend threshold is
    // an unstructured claim about money that the columns do not carry.
    const scope = resolveCouponScope(row({ discountPercent: null, descriptionText: 'حد أدنى 200 ريال' }));
    expect(scope.reviewReasons).toEqual(['LEGACY_UNSTRUCTURED_TERMS']);
    expect(resolveCouponScope(row({ discountPercent: 15, descriptionText: 'خصم 15% على منتجات أمازون' })).reviewReasons).toEqual([]);
    expect(scope.minimumSpend).toBeNull();
    expect(couponVisibility(scope, now, inSA)).toMatchObject({ state: 'REVIEW_REQUIRED', code: null });
  });

  it('accepts only a complete ISO timestamp with an explicit offset for the end date', () => {
    // A typed Date column keeps the instant; the offset it was written with is not recoverable.
    expect(resolveCouponScope(row({ validUntil: new Date('2026-12-01T00:00:00+03:00') })).validUntil).toEqual({ utc: '2026-11-30T21:00:00.000Z', sourceOffset: null });
    expect(resolveCouponScope(row({ validUntil: '2026-12-01T00:00:00+03:00' })).validUntil).toEqual({ utc: '2026-11-30T21:00:00.000Z', sourceOffset: '+03:00' });
    expect(couponScopeIssues({ discountPercent: 10, validUntil: '2026-12-01T00:00:00+03:00' })).toEqual([]);
    expect(resolveCouponScope(row({ validUntil: '2026-12-01' })).validUntil).toBeNull();
    expect(resolveCouponScope(row({ validUntil: '2026-12-01T00:00:00' })).validUntil).toBeNull();
    // A time-zone label supplied elsewhere never repairs a bare date.
    expect(resolveCouponScope(row({ validUntil: '2026-12-01T00:00:00', endTimezone: 'Asia/Riyadh' })).validUntil).toBeNull();
    expect(couponScopeIssues({ discountPercent: 10, validUntil: '2026-12-01' })).toContainEqual({ path: 'validUntil', code: 'VALID_UNTIL_INVALID' });
  });
});

describe('foreign-marketplace end time', () => {
  it('ends a US coupon by its own UTC instant, not the Riyadh wall clock', () => {
    // 2026-12-01T00:00:00Z is 03:00 in Riyadh on the same day.
    const scope = resolveCouponScope(row({ discountAmount: '10', couponCurrency: 'USD', sourceId: 'amazon-creators-api-us', eligibleCountries: ['US'], couponValidUntil: new Date('2026-12-01T00:00:00+00:00') }));
    expect(scope.validUntil).toEqual({ utc: '2026-12-01T00:00:00.000Z', sourceOffset: null });
    expect(resolveCouponScope(row({ couponValidUntil: '2026-12-01T00:00:00+00:00' })).validUntil).toEqual({ utc: '2026-12-01T00:00:00.000Z', sourceOffset: '+00:00' });
    expect(isCouponEnded(scope, new Date('2026-11-30T23:59:59Z'))).toBe(false);
    expect(isCouponEnded(scope, new Date('2026-12-01T00:00:00Z'))).toBe(true);
    // An English description does not shift the instant by three hours.
    const described = resolveCouponScope(row({ discountAmount: '10', couponCurrency: 'USD', sourceId: 'amazon-creators-api-us', eligibleCountries: ['US'], couponValidUntil: new Date('2026-12-01T00:00:00+00:00'), descriptionText: 'Expires December 1, 2026' }));
    expect(described.validUntil?.utc).toBe(scope.validUntil?.utc);
  });
});

describe('audience and eligible countries', () => {
  it('hides a members-only coupon from the public surface and keeps it for members', () => {
    const scope = resolveCouponScope(row({ code: 'VIP20', discountPercent: 20, audience: 'MEMBERS' }));
    expect(scope.audience).toBe('MEMBERS');
    expect(couponVisibility(scope, now, inSA)).toEqual({ state: 'AUDIENCE_MISMATCH', code: null, ended: false, verified: false });
    expect(couponVisibility(scope, now, { audience: 'MEMBERS', eligibleCountries: ['SA'] })).toEqual({ state: 'VISIBLE', code: 'VIP20', ended: false, verified: true });
    expect(couponVisibility(scope, now, { audience: 'PUBLIC', eligibleCountries: ['SA'] })).toMatchObject({ state: 'AUDIENCE_MISMATCH', code: null });
  });

  it('treats a missing audience as unknown, never as public', () => {
    const scope = resolveCouponScope(row({ discountPercent: 10, audience: null }));
    expect(scope.audience).toBeNull();
    expect(scope.reviewReasons).toContain('AUDIENCE_UNKNOWN');
    expect(couponVisibility(scope, now, { audience: 'MEMBERS', eligibleCountries: ['SA'] })).toMatchObject({ state: 'AUDIENCE_UNKNOWN', code: null });
  });

  it('marks a coupon as ineligible outside its listed countries and as unknown when unlisted', () => {
    const sa = resolveCouponScope(row({ discountPercent: 10, eligibleCountries: ['SA'] }));
    expect(couponVisibility(sa, now, { eligibleCountries: ['US'] })).toEqual({ state: 'COUNTRY_INELIGIBLE', code: null, ended: false, verified: false });
    expect(couponVisibility(sa, now, { eligibleCountries: ['SA'] })).toMatchObject({ state: 'VISIBLE', code: 'BABY10' });
    const unlisted = resolveCouponScope(row({ discountPercent: 10, eligibleCountries: [] }));
    expect(unlisted.eligibleCountries).toBeNull();
    // Unlisted on a card is not tied to a destination; on the coupon page the visitor's
    // country decides, and with none chosen the code stays hidden.
    expect(couponVisibility(unlisted, now, { ...inSA, scope: 'product' })).toMatchObject({ state: 'VISIBLE_WITHOUT_COUNTRY', code: 'BABY10' });
    expect(couponVisibility(unlisted, now, { ...inSA, scope: 'storeWide' })).toMatchObject({ state: 'VISIBLE_WITHOUT_COUNTRY', code: 'BABY10' });
    // Store-wide with no country column: visible, but the page does not claim a destination.
    expect(couponVisibility(unlisted, now)).toEqual({ state: 'VISIBLE', code: 'BABY10', ended: false, verified: true });
    expect(couponVisibility(unlisted, now, inSA).code).not.toBeNull();
    expect(unlisted.reviewReasons).toContain('COUNTRY_UNSPECIFIED');
  });

  it('rejects a country outside SA/US and de-duplicates a repeated code', () => {
    expect(couponScopeIssues({ discountPercent: 10, eligibleCountries: ['SA', 'AE'] })).toContainEqual({ path: 'eligibleCountries', code: 'UNSUPPORTED_COUNTRY' });
    expect(couponScopeIssues({ discountPercent: 10, eligibleCountries: ['SA', 'SA'] })).toContainEqual({ path: 'eligibleCountries', code: 'DUPLICATE_COUNTRY' });
    expect(couponScopeSchema.safeParse({ discountPercent: 10, eligibleCountries: ['SA', 'AE'] }).success).toBe(false);
  });
});

describe('sources and verification', () => {
  it('rejects a source that is not registered for any marketplace', () => {
    expect(couponScopeIssues({ discountPercent: 10, sourceId: 'some-scraper' })).toContainEqual({ path: 'sourceId', code: 'SOURCE_NOT_APPROVED' });
    expect(couponScopeIssues({ discountPercent: 10, sourceId: COUPON_SOURCE_IDS[0] })).toEqual([]);
    expect(couponScopeSchema.safeParse({ discountPercent: 10, sourceId: 'some-scraper' }).success).toBe(false);
  });

  it('never promotes an unverified source to verified for every product', () => {
    const withSource = resolveCouponScope(row({ discountPercent: 10, thirdPartyVerified: false }));
    expect(couponVisibility(withSource, now, inSA)).toEqual({ state: 'UNVERIFIED_SOURCE', code: null, ended: false, verified: false });
    for (const scope of ['coupon', 'product', 'storeWide'] as const) expect(couponVisibility(withSource, now, { ...inSA, scope })).toMatchObject({ verified: false, code: null });
    expect(couponVisibility(resolveCouponScope(row({ discountPercent: 10 })), now, inSA)).toMatchObject({ state: 'VISIBLE', verified: true });
  });

  it('does not treat a stale or future check as fresh', () => {
    const stale = resolveCouponScope(row({ discountPercent: 10, checkedAt: new Date('2026-10-01T00:00:00Z') }));
    expect(couponVisibility(stale, now, inSA)).toMatchObject({ state: 'STALE_CHECK', code: null });
    const future = resolveCouponScope(row({ discountPercent: 10, checkedAt: new Date('2026-11-21T00:00:00Z') }));
    expect(couponVisibility(future, now, inSA)).toMatchObject({ state: 'STALE_CHECK', code: null });
    const uncited = resolveCouponScope(row({ discountPercent: 10, checkedAt: null }));
    expect(couponVisibility(uncited, now, inSA)).toMatchObject({ state: 'STALE_CHECK', code: null });
  });

  it('requires an approved source before a check date counts', () => {
    expect(couponScopeIssues({ discountPercent: 10, checkedAt: '2026-11-20T11:00:00Z' })).toContainEqual({ path: 'sourceId', code: 'SOURCE_NOT_APPROVED' });
    expect(couponScopeIssues({ discountPercent: 10, sourceId: 'amazon-creators-api-sa', checkedAt: '2026-11-20' })).toContainEqual({ path: 'checkedAt', code: 'CHECKED_AT_INVALID' });
    const noSource = resolveCouponScope(row({ discountPercent: 10, sourceId: null }));
    expect(couponVisibility(noSource, now, inSA)).toEqual({ state: 'SOURCE_NOT_APPROVED', code: null, ended: false, verified: false });
  });
});

describe('ended coupons', () => {
  it('keeps the record but never the code', () => {
    const scope = resolveCouponScope(row({ code: 'BABY10', discountPercent: 10, couponValidUntil: new Date('2026-11-19T00:00:00Z') }));
    expect(couponVisibility(scope, now, inSA)).toEqual({ state: 'ENDED', code: null, ended: true, verified: false });
  });

  it('hides the code for every non-visible state', () => {
    const expiredStatus = resolveCouponScope(row({ code: 'BABY10', discountPercent: 10, status: 'EXPIRED' }));
    expect(couponVisibility(expiredStatus, now, inSA)).toEqual({ state: 'ENDED', code: null, ended: true, verified: false });
    for (const scope of [
      resolveCouponScope(row({ discountAmount: '25' })),
      resolveCouponScope(row({ discountPercent: 10, thirdPartyVerified: false })),
      resolveCouponScope(row({ discountPercent: 10, audience: 'MEMBERS' })),
      resolveCouponScope(row({ discountPercent: 10, checkedAt: new Date('2026-10-01T00:00:00Z') })),
    ]) expect(couponVisibility(scope, now, inSA).code).toBeNull();
  });

  it('does not present an ended coupon as a product-specific discount', () => {
    const productScoped = resolveCouponScope(row({ discountPercent: 10, descriptionText: 'خصم على منتج فيليبس أفنت' }));
    expect(productScoped.productIds).toBeNull();
    // A product link needs its own evidence record; a note is not one.
    const withoutEvidence = resolveCouponScope(row({ discountPercent: 10, productIds: ['p1'] }));
    expect(withoutEvidence.productIds).toBeNull();
    expect(withoutEvidence.reviewReasons).toContain('PRODUCT_EVIDENCE_MISSING');
    expect(couponVisibility(withoutEvidence, now, inSA)).toMatchObject({ state: 'REVIEW_REQUIRED', code: null });
    const withEvidence = resolveCouponScope(row({ discountPercent: 10, productIds: ['p1'], productEvidenceIds: ['e1'] }));
    expect(withEvidence.productIds).toEqual(['p1']);
    expect(couponVisibility(withEvidence, now, inSA)).toMatchObject({ state: 'VISIBLE', code: 'BABY10' });
  });
});

describe('release coupon safeguards', () => {
  it('preserves a minimum currency separately from the discount currency', () => {
    const scope = resolveCouponScope(row({ discountAmount: '10', couponCurrency: 'USD', minimumSpendAmount: '50', minimumSpendCurrency: 'SAR' }));
    expect(scope.minimumSpend).toEqual({ amount: '50', currency: 'SAR' });
    expect(scope.discount).toEqual({ kind: 'AMOUNT', money: { amount: '10', currency: 'USD' } });
  });
  it('never releases a code for a disabled or unverified registered source', () => {
    approval.enforce = true;
    try {
      for (const sourceId of ['amazon-creators-api-sa', 'amazon-creators-api-us']) {
        const scope = resolveCouponScope(row({ discountPercent: 10, sourceId }));
        for (const surface of ['coupon', 'product', 'storeWide'] as const) {
          expect(couponVisibility(scope, now, { ...inSA, scope: surface })).toMatchObject({ state: 'SOURCE_NOT_APPROVED', code: null, verified: false });
        }
      }
    } finally { approval.enforce = false; }
  });
});
