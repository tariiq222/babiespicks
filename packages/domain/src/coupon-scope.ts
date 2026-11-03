/**
 * Multi-currency coupon scope: the single place that decides what a coupon
 * claims and to whom it applies.
 *
 * Pure module — no Prisma, node:fs or env. The public API route, the coupons
 * page, the assistant card and MCP reads all call this module so the money
 * condition shown in each surface is the same one.
 *
 * Rules encoded here:
 * - A percentage coupon needs no currency; a fixed amount does, and so does any
 *   money limit (minimum spend or maximum discount).
 * - The discount currency and the limit currency are kept apart. A 10 USD
 *   coupon with a USD minimum never becomes an SAR minimum by preference alone.
 * - A display conversion is optional, labelled with its own rate source, and can
 *   never be written back as the original amount or the structured minimum.
 * - A valid-until instant is taken only from an ISO timestamp with an explicit
 *   offset. The description language never supplies a time zone.
 * - Legacy rows with an amount and no currency keep their raw value, are marked
 *   LEGACY_CURRENCY_UNKNOWN and are never filled in with SAR.
 * - Ended, review-required, unverified, stale, audience-mismatched and
 *   country-ineligible coupons never carry their code.
 */

import { z } from 'zod';
import { APPROVED_CURRENCIES } from './marketplaces';
import { couponSourcePolicy } from './source-policy';

// ── Constants ──────────────────────────────────────────────────────────────

/** How long a source check stays current for a coupon claim. */
export const COUPON_CHECK_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Sources whose coupons may be recorded. Membership is not source approval. */
export const COUPON_SOURCE_IDS: readonly string[] = Object.freeze(['amazon-creators-api-sa', 'amazon-creators-api-us']);

/** Hosts a coupon source URL may use. Both are already registered marketplaces. */
const SOURCE_URL_HOSTS: readonly string[] = Object.freeze(['amazon.sa', 'www.amazon.sa', 'amazon.com', 'www.amazon.com']);

export type CouponAudience = 'PUBLIC' | 'MEMBERS';
export type CouponDeliveryCountry = 'SA' | 'US';
export type CouponStatus = 'ACTIVE' | 'EXPIRED' | 'NEEDS_REVIEW' | 'USED_UP' | 'INVALID';

export type CouponReviewReason =
  | 'LEGACY_CURRENCY_UNKNOWN'
  | 'LEGACY_UNSTRUCTURED_TERMS'
  | 'AUDIENCE_UNKNOWN'
  | 'COUNTRY_UNSPECIFIED'
  | 'PRODUCT_EVIDENCE_MISSING';

export type CouponScopeIssueCode =
  | 'COUPON_CURRENCY_REQUIRED'
  | 'UNSUPPORTED_CURRENCY'
  | 'PERCENT_RANGE'
  | 'AMOUNT_NOT_POSITIVE'
  | 'AMOUNT_INVALID'
  | 'UNSUPPORTED_COUNTRY'
  | 'DUPLICATE_COUNTRY'
  | 'SOURCE_NOT_APPROVED'
  | 'CHECKED_AT_INVALID'
  | 'VALID_UNTIL_INVALID'
  | 'AUDIENCE_INVALID';

export interface CouponScopeIssue { readonly path: string; readonly code: CouponScopeIssueCode }

// ── Stored row shape ───────────────────────────────────────────────────────

/** One coupon row after the additive migration. Dates may arrive as Date (Prisma)
 * or ISO string (JSON/fixture); only an explicit offset in an ISO string counts. */
export interface CouponScopeRow {
  readonly id: string;
  readonly code: string;
  readonly storeId: string;
  /** Percent as stored: Prisma Float is a number; a numeric string is tolerated. */
  readonly discountPercent?: number | string | null;
  readonly discountAmount?: string | null;
  readonly status?: CouponStatus;
  readonly validFrom?: Date | string | null;
  readonly validUntil?: Date | string | null;
  readonly couponCurrency?: string | null;
  readonly minimumSpendAmount?: string | null;
  readonly minimumSpendCurrency?: string | null;
  readonly maximumDiscountAmount?: string | null;
  readonly eligibleCountries?: readonly string[] | null;
  readonly audience?: string | null;
  readonly sourceId?: string | null;
  readonly checkedAt?: Date | string | null;
  readonly couponValidUntil?: Date | string | null;
  /** Editorial note. Never parsed for money, country, audience or time zone. */
  readonly descriptionText?: string | null;
  /** Owner/editor approval of this exact claim — not the marketplace source. */
  readonly thirdPartyVerified?: boolean;
  /** A time zone label beside a bare date, for the ignored case. */
  readonly endTimezone?: string | null;
  readonly productIds?: readonly string[] | null;
  readonly productEvidenceIds?: readonly string[] | null;
}

export interface CouponMoney { readonly amount: string; readonly currency: string | null }
export type CouponDiscount =
  | { readonly kind: 'PERCENT'; readonly percent: number }
  | { readonly kind: 'AMOUNT'; readonly money: CouponMoney };

export interface CouponValidUntil {
  /** Canonical instant. */
  readonly utc: string;
  /** Offset as written at the source (null when read from a typed Date column),
   * kept so the store's own deadline stays visible. */
  readonly sourceOffset: string | null;
}

// ── Normalizers (no guessing) ──────────────────────────────────────────────

const AMOUNT = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const OFFSET_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/;
const CURRENCY = /^[A-Z]{3}$/;

/** Exact decimal string; trailing zeros dropped without floating-point arithmetic. */
export function normalizeAmount(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value.trim();
  if (!AMOUNT.test(text)) return null;
  const [integer, fraction = ''] = text.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed ? `${integer}.${trimmed}` : integer!;
}

const positive = (amount: string | null) => amount !== null && /[1-9]/.test(amount);

/** An explicit ISO timestamp with offset → UTC instant plus its source offset. */
export function normalizeValidUntil(value: Date | string | null | undefined): CouponValidUntil | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    // A typed column lost the offset it was written with; report that instead of inventing one.
    return Number.isFinite(value.getTime()) ? { utc: value.toISOString(), sourceOffset: null } : null;
  }
  const text = value.trim();
  if (!OFFSET_ISO.test(text)) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  const sourceOffset = OFFSET_SUFFIX.exec(text)?.[1];
  if (!sourceOffset) return null;
  return { utc: new Date(parsed).toISOString(), sourceOffset };
}

const currency = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CURRENCY.test(code) ? code : null;
};

const list = (value: readonly string[] | null | undefined): string[] => Array.isArray(value) ? value.map(item => String(item).trim().toUpperCase()).filter(Boolean) : [];

// ── Validation ─────────────────────────────────────────────────────────────

export interface CouponScopeInput {
  readonly discountPercent?: number | null;
  readonly discountAmount?: string | null;
  readonly couponCurrency?: string | null;
  readonly minimumSpendAmount?: string | null;
  readonly minimumSpendCurrency?: string | null;
  readonly maximumDiscountAmount?: string | null;
  readonly eligibleCountries?: readonly string[] | null;
  readonly audience?: string | null;
  readonly sourceId?: string | null;
  readonly checkedAt?: Date | string | null;
  readonly validUntil?: Date | string | null;
}

/** Every contract issue, in a stable order. An empty array means the claim is complete. */
export function couponScopeIssues(input: CouponScopeInput): CouponScopeIssue[] {
  const issues: CouponScopeIssue[] = [];
  const percent = input.discountPercent;
  const amount = normalizeAmount(input.discountAmount ?? null);
  const limit = normalizeAmount(input.minimumSpendAmount ?? null);
  const ceiling = normalizeAmount(input.maximumDiscountAmount ?? null);
  const discountCurrency = currency(input.couponCurrency);
  const limitCurrency = currency(input.minimumSpendCurrency);
  const hasMoney = (input.discountAmount ?? null) !== null || (input.minimumSpendAmount ?? null) !== null || (input.maximumDiscountAmount ?? null) !== null;

  if (input.couponCurrency != null && discountCurrency === null) issues.push({ path: 'couponCurrency', code: 'UNSUPPORTED_CURRENCY' });
  if (input.minimumSpendCurrency != null && limitCurrency === null) issues.push({ path: 'minimumSpendCurrency', code: 'UNSUPPORTED_CURRENCY' });
  if (discountCurrency && !APPROVED_CURRENCIES.includes(discountCurrency)) issues.push({ path: 'couponCurrency', code: 'UNSUPPORTED_CURRENCY' });
  if (limitCurrency && !APPROVED_CURRENCIES.includes(limitCurrency)) issues.push({ path: 'minimumSpendCurrency', code: 'UNSUPPORTED_CURRENCY' });

  if (percent != null) {
    const value = typeof percent === 'number' ? percent : Number.NaN;
    if (!Number.isFinite(value) || value <= 0 || value > 100) issues.push({ path: 'discountPercent', code: 'PERCENT_RANGE' });
  }
  if (input.discountAmount != null && !positive(amount)) issues.push({ path: 'discountAmount', code: amount === null ? 'AMOUNT_INVALID' : 'AMOUNT_NOT_POSITIVE' });
  if (input.minimumSpendAmount != null && !positive(limit)) issues.push({ path: 'minimumSpendAmount', code: limit === null ? 'AMOUNT_INVALID' : 'AMOUNT_NOT_POSITIVE' });
  if (input.maximumDiscountAmount != null && !positive(ceiling)) issues.push({ path: 'maximumDiscountAmount', code: ceiling === null ? 'AMOUNT_INVALID' : 'AMOUNT_NOT_POSITIVE' });

  // The crucial currency rule: a fixed amount always names its currency, and any
  // money limit or ceiling needs one too. A percentage discount with neither does not.
  const fixedAmount = input.discountAmount != null;
  const moneyLimit = input.minimumSpendAmount != null || input.maximumDiscountAmount != null;
  if (fixedAmount && !discountCurrency) issues.push({ path: 'couponCurrency', code: 'COUPON_CURRENCY_REQUIRED' });
  // A fixed amount written without its currency is already reported above; reporting a
  // missing source for the same incomplete claim would give the wrong reason.
  // The limit currency may be written on the discount side; the contract is the same.
  if (moneyLimit && !discountCurrency && !limitCurrency) issues.push({ path: 'couponCurrency', code: 'COUPON_CURRENCY_REQUIRED' });
  if (!hasMoney && discountCurrency) issues.push({ path: 'couponCurrency', code: 'COUPON_CURRENCY_REQUIRED' });

  const countries = list(input.eligibleCountries);
  for (const country of countries) if (country !== 'SA' && country !== 'US') issues.push({ path: 'eligibleCountries', code: 'UNSUPPORTED_COUNTRY' });
  if (new Set(countries).size !== countries.length) issues.push({ path: 'eligibleCountries', code: 'DUPLICATE_COUNTRY' });

  if (input.audience != null && input.audience !== 'PUBLIC' && input.audience !== 'MEMBERS') issues.push({ path: 'audience', code: 'AUDIENCE_INVALID' });

  if (input.sourceId != null && !couponSourcePolicy(input.sourceId)) issues.push({ path: 'sourceId', code: 'SOURCE_NOT_APPROVED' });
  // A usable check date without a registered source is an unsourced claim. An unusable one
  // is already reported as CHECKED_AT_INVALID and gets no second, misleading reason.
  if (input.checkedAt != null && normalizeValidUntil(input.checkedAt) !== null && !couponSourcePolicy(input.sourceId)) issues.push({ path: 'sourceId', code: 'SOURCE_NOT_APPROVED' });
  if (input.checkedAt != null && normalizeValidUntil(input.checkedAt) === null) issues.push({ path: 'checkedAt', code: 'CHECKED_AT_INVALID' });
  if (input.validUntil != null && normalizeValidUntil(input.validUntil) === null) issues.push({ path: 'validUntil', code: 'VALID_UNTIL_INVALID' });
  return issues;
}

// ── Resolved scope ─────────────────────────────────────────────────────────

export interface CouponFxLabel {
  readonly sourceId: string;
  readonly asOf: string;
}

export interface CouponDisplay {
  /** The stored original, repeated so every surface shows the same number. */
  readonly original: CouponMoney | null;
  /** Optional estimate. Present only when a caller approved a conversion. */
  readonly estimate: CouponMoney | null;
  readonly convertedFrom: CouponMoney | null;
  readonly fx: CouponFxLabel | null;
  /** The number to render: the original when it exists; an estimate is never the headline. */
  readonly headline: CouponMoney | null;
}

export interface CouponScope {
  readonly id: string;
  readonly code: string;
  readonly storeId: string;
  readonly percent: number | null;
  /** What the coupon claims, or null when the claim cannot be stated safely. */
  readonly discount: CouponDiscount | null;
  /** ISO-4217 of the discount claim; null for a percentage coupon or a legacy unknown. */
  readonly currency: string | null;
  readonly minimumSpend: CouponMoney | null;
  readonly maximumDiscount: CouponMoney | null;
  /** A stored amount whose currency was never recorded. Kept raw, never inferred. */
  readonly legacyAmount: CouponMoney | null;
  readonly eligibleCountries: readonly CouponDeliveryCountry[] | null;
  /** null means unknown, not public. */
  readonly audience: CouponAudience | null;
  readonly sourceId: string | null;
  readonly checkedAt: string | null;
  readonly validUntil: CouponValidUntil | null;
  readonly status: CouponStatus;
  readonly verified: boolean;
  readonly productIds: readonly string[] | null;
  readonly reviewReasons: readonly CouponReviewReason[];
  readonly issues: readonly CouponScopeIssue[];
  readonly display: CouponDisplay;
}

function money(amount: string | null, currencyCode: string | null): CouponMoney | null {
  return amount === null ? null : { amount, currency: currencyCode };
}

/** Build the resolved scope. Unusable stored combinations stay flagged, not repaired. */
export function resolveCouponScope(row: CouponScopeRow): CouponScope {
  // A numeric string (JSON boundary) is the only tolerated non-number form; anything else reads as null.
  const rawPercent = typeof row.discountPercent === 'string' ? (row.discountPercent.trim() === '' ? null : Number(row.discountPercent)) : row.discountPercent ?? null;
  const issues = couponScopeIssues({
    discountPercent: rawPercent !== null && Number.isFinite(rawPercent) ? rawPercent : null,
    discountAmount: row.discountAmount, couponCurrency: row.couponCurrency,
    minimumSpendAmount: row.minimumSpendAmount, minimumSpendCurrency: row.minimumSpendCurrency,
    maximumDiscountAmount: row.maximumDiscountAmount, eligibleCountries: row.eligibleCountries,
    audience: row.audience, sourceId: row.sourceId, checkedAt: row.checkedAt,
    validUntil: row.couponValidUntil ?? row.validUntil,
  });
  const reviewReasons: CouponReviewReason[] = [];
  const percentValue = rawPercent !== null && Number.isFinite(rawPercent) ? rawPercent : null;
  const amount = normalizeAmount(row.discountAmount ?? null);
  const discountCurrency = currency(row.couponCurrency);
  const limit = normalizeAmount(row.minimumSpendAmount ?? null);
  const ceiling = normalizeAmount(row.maximumDiscountAmount ?? null);
  const limitCurrency = currency(row.minimumSpendCurrency);
  const approvedCurrency = discountCurrency && APPROVED_CURRENCIES.includes(discountCurrency) ? discountCurrency : null;

  let discount: CouponDiscount | null = null;
  let legacyAmount: CouponMoney | null = null;
  if (amount !== null && positive(amount)) {
    if (approvedCurrency) discount = { kind: 'AMOUNT', money: { amount, currency: approvedCurrency } };
    else {
      legacyAmount = { amount, currency: null };
      reviewReasons.push('LEGACY_CURRENCY_UNKNOWN');
    }
  }
  if (percentValue !== null && percentValue > 0 && percentValue <= 100 && issues.every(issue => issue.path !== 'discountPercent')) {
    // A percentage is the coupon's claim; an amount beside it is its legacy form.
    if (!discount) discount = { kind: 'PERCENT', percent: percentValue };
    else if (amount !== null) reviewReasons.push('LEGACY_UNSTRUCTURED_TERMS');
  }
  const minimumSpend = limit !== null && positive(limit) ? money(limit, (limitCurrency && APPROVED_CURRENCIES.includes(limitCurrency) ? limitCurrency : null) ?? approvedCurrency) : null;
  const maximumDiscount = ceiling !== null && positive(ceiling) ? money(ceiling, approvedCurrency ?? (limitCurrency && APPROVED_CURRENCIES.includes(limitCurrency) ? limitCurrency : null)) : null;

  const countries = list(row.eligibleCountries);
  const eligibleCountries = countries.length ? countries.filter((country): country is CouponDeliveryCountry => country === 'SA' || country === 'US') : null;
  if (!eligibleCountries) reviewReasons.push('COUNTRY_UNSPECIFIED');
  const audience = row.audience === 'PUBLIC' || row.audience === 'MEMBERS' ? row.audience : null;
  if (!audience) {
    reviewReasons.push('AUDIENCE_UNKNOWN');
  }
  const sourceId = typeof row.sourceId === 'string' && row.sourceId.trim() ? row.sourceId.trim() : null;
  // Any stored combination the money/scope contract cannot state goes to review, not display.
  if (issues.length) reviewReasons.push('LEGACY_UNSTRUCTURED_TERMS');
  // A note beside a complete structured claim is prose; only a note standing in for the
  // whole claim contradicts it.
  if (row.descriptionText && !discount && !legacyAmount) reviewReasons.push('LEGACY_UNSTRUCTURED_TERMS');
  if (row.productIds && !row.productEvidenceIds) reviewReasons.push('PRODUCT_EVIDENCE_MISSING');
  // The addendum columns carry the coupon's own end; legacy validUntil is read as a fallback only.
  if (!row.couponValidUntil && row.validUntil) reviewReasons.push('LEGACY_UNSTRUCTURED_TERMS');

  const original = discount?.kind === 'AMOUNT' ? discount.money : legacyAmount;
  return {
    id: row.id, code: row.code, storeId: row.storeId, percent: percentValue, discount, currency: discount?.kind === 'AMOUNT' ? discount.money.currency : null,
    minimumSpend, maximumDiscount, legacyAmount,
    eligibleCountries, audience, sourceId,
    checkedAt: normalizeValidUntil(row.checkedAt)?.utc ?? null,
    validUntil: normalizeValidUntil(row.couponValidUntil ?? row.validUntil),
    status: row.status ?? 'ACTIVE',
    verified: row.thirdPartyVerified === true,
    productIds: row.productIds && row.productEvidenceIds ? [...row.productIds] : null,
    reviewReasons: [...new Set(reviewReasons)].sort(),
    issues,
    display: { original, estimate: null, convertedFrom: null, fx: null, headline: original },
  };
}

export interface CouponConversions {
  /** The structured minimum, as stored. Replacing it with a converted value is refused. */
  readonly minimumSpend?: CouponMoney | null;
  /** A display estimate only. The stored discount always wins as headline. */
  readonly discount?: CouponDiscount | null;
  readonly maximumDiscount?: CouponMoney | null;
  readonly display?: { readonly convertedFrom?: CouponMoney | null; readonly fx?: CouponFxLabel | null } | null;
  readonly reviewReasons?: readonly CouponReviewReason[];
}

/**
 * Attach an optional display conversion without changing the stored claim.
 * `discount` is a converted estimate; it is kept beside the original, never over it,
 * and it cannot move `minimumSpend`.
 */
export function mergeCouponScope(scope: CouponScope, conversions: CouponConversions): CouponScope {
  const estimate = conversions.discount?.kind === 'AMOUNT' ? conversions.discount.money : null;
  const convertedFrom = conversions.display?.convertedFrom ?? (estimate && scope.display.original ? scope.display.original : null);
  const fx = estimate ? conversions.display?.fx ?? null : null;
  const estimateUsable = estimate !== null && fx !== null && convertedFrom !== null && estimate.currency !== convertedFrom.currency;
  return {
    ...scope,
    minimumSpend: scope.minimumSpend,
    maximumDiscount: conversions.maximumDiscount && conversions.maximumDiscount.currency === scope.maximumDiscount?.currency ? conversions.maximumDiscount : scope.maximumDiscount,
    reviewReasons: [...new Set([...scope.reviewReasons, ...(conversions.reviewReasons ?? [])])].sort(),
    display: {
      original: scope.display.original,
      estimate: estimateUsable ? estimate : null,
      convertedFrom: estimateUsable ? convertedFrom : null,
      fx: estimateUsable ? fx : null,
      headline: scope.display.original ?? (estimateUsable ? estimate : null),
    },
  };
}

// ── Visibility ─────────────────────────────────────────────────────────────

export interface CouponViewContext {
  readonly audience?: 'PUBLIC' | 'MEMBERS';
  readonly eligibleCountries?: readonly string[];
  /** Where the coupon is being shown: the coupon page, a product card, or store-wide. */
  readonly scope?: 'coupon' | 'product' | 'storeWide';
}

export type CouponVisibilityState =
  | 'VISIBLE'
  | 'ENDED'
  | 'REVIEW_REQUIRED'
  | 'SOURCE_NOT_APPROVED'
  | 'UNVERIFIED_SOURCE'
  | 'STALE_CHECK'
  | 'AUDIENCE_MISMATCH'
  | 'AUDIENCE_UNKNOWN'
  | 'COUNTRY_INELIGIBLE'
  | 'COUNTRY_UNKNOWN'
  | 'VISIBLE_WITHOUT_COUNTRY';

export interface CouponVisibility {
  readonly state: CouponVisibilityState;
  /** The code to render, or null. Only 'VISIBLE' carries one. */
  readonly code: string | null;
  readonly ended: boolean;
  readonly verified: boolean;
}

/** Every non-visible state reports `verified:false` and no code, whatever the editor flag says. */
function view(state: CouponVisibilityState): CouponVisibility {
  return { state, code: null, ended: state === 'ENDED', verified: false };
}

/**
 * Whether a stored coupon may be shown, and whether its code may be revealed.
 * Precedence: ended/unavailable first, then missing source, then an unstated audience
 * or country, then the reviewer gate, then freshness and audience/country match.
 */
export function couponVisibility(scope: CouponScope, now: Date, context: CouponViewContext = {}): CouponVisibility {
  const time = now.getTime();
  const end = scope.validUntil?.utc;
  // Any non-active status ends the coupon, and so does a past instant in any offset.
  if (scope.status !== 'ACTIVE' || (end && Date.parse(end) <= time)) return view('ENDED');
  if (!scope.sourceId) return view('SOURCE_NOT_APPROVED');
  const sourcePolicy = couponSourcePolicy(scope.sourceId);
  if (!sourcePolicy || !sourcePolicy.enabled || sourcePolicy.status !== 'VERIFIED') return view('SOURCE_NOT_APPROVED');
  // Unknown context is not an invitation to guess: no audience, no country, no code.
  if (scope.audience === null) return view('AUDIENCE_UNKNOWN');
  // A stored combination that contradicts the money contract is for review, not display.
  const blocking = scope.issues.filter(issue => ['COUPON_CURRENCY_REQUIRED', 'UNSUPPORTED_CURRENCY', 'PERCENT_RANGE', 'AMOUNT_NOT_POSITIVE', 'AMOUNT_INVALID', 'UNSUPPORTED_COUNTRY', 'AUDIENCE_INVALID'].includes(issue.code));
  if (blocking.length || scope.reviewReasons.some(reason => (['LEGACY_CURRENCY_UNKNOWN', 'LEGACY_UNSTRUCTURED_TERMS', 'PRODUCT_EVIDENCE_MISSING'] as string[]).includes(reason))) return view('REVIEW_REQUIRED');
  const checked = scope.checkedAt ? Date.parse(scope.checkedAt) : Number.NaN;
  if (!Number.isFinite(checked) || checked > time || time - checked > COUPON_CHECK_MAX_AGE_SECONDS * 1000) return view('STALE_CHECK');
  if (scope.audience !== (context.audience ?? 'PUBLIC')) return view('AUDIENCE_MISMATCH');
  const countries = context.eligibleCountries?.map(item => item.toUpperCase()) ?? [];
  const couponPage = (context.scope ?? 'coupon') === 'coupon';
  const singleCountry = new Set(countries).size === 1;
  // No listed country and no context column: the coupon is not tied to a destination.
  if (!scope.eligibleCountries && !couponPage) return { state: 'VISIBLE_WITHOUT_COUNTRY', code: scope.verified ? scope.code : null, ended: false, verified: scope.verified };
  if (!couponPage && !singleCountry) return view('COUNTRY_UNKNOWN');
  if (scope.eligibleCountries && !singleCountry) return view('COUNTRY_UNKNOWN');
  if (scope.eligibleCountries && !scope.eligibleCountries.includes(countries[0] as CouponDeliveryCountry)) return view('COUNTRY_INELIGIBLE');
  // A coupon is never promoted to "verified" by the mere existence of a source row.
  if (!scope.verified) return view('UNVERIFIED_SOURCE');
  return { state: 'VISIBLE', code: scope.code, ended: false, verified: true };
}

/** True for any end signal: a past instant in any offset, or a non-active status. */
export function isCouponEnded(scope: CouponScope, now: Date): boolean {
  const end = scope.validUntil?.utc;
  return scope.status !== 'ACTIVE' || (!!end && Date.parse(end) <= now.getTime());
}

// ── MCP write contract ─────────────────────────────────────────────────────

const amountInput = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/, 'Decimal(20,6) string required').nullable();
export const couponScopeSchema = z.object({
  couponCurrency: z.string().regex(/^[A-Z]{3}$/).refine(value => APPROVED_CURRENCIES.includes(value), 'Unapproved currency').nullable(),
  discountPercent: z.number().min(0).max(100).nullable(),
  discountAmount: amountInput,
  minimumSpendAmount: amountInput,
  minimumSpendCurrency: z.string().regex(/^[A-Z]{3}$/).refine(value => APPROVED_CURRENCIES.includes(value), 'Unapproved currency').nullable(),
  maximumDiscountAmount: amountInput,
  eligibleCountries: z.array(z.enum(['SA', 'US'])).max(2).nullable(),
  audience: z.enum(['PUBLIC', 'MEMBERS']).nullable(),
  sourceId: z.string().trim().min(1).max(200).nullable(),
  checkedAt: z.iso.datetime({ offset: true }).nullable(),
  validUntil: z.iso.datetime({ offset: true }).nullable(),
}).strict().superRefine((value, ctx) => {
  for (const issue of couponScopeIssues(value)) ctx.addIssue({ code: 'custom', message: issue.code, path: [issue.path] });
  if (value.sourceId && !isCouponSourceUrlPair(value.sourceId)) ctx.addIssue({ code: 'custom', message: 'SOURCE_NOT_APPROVED', path: ['sourceId'] });
});

/** A coupon source is a marketplace source; nothing else may be attached to a coupon. */
function isCouponSourceUrlPair(sourceId: string): boolean {
  const policy = couponSourcePolicy(sourceId);
  return !!policy && (policy.marketplaceCode === 'SA' || policy.marketplaceCode === 'US');
}

/** Source URL check shared with the route: exact registered marketplace host, HTTPS, no credentials. */
export function isCouponSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && SOURCE_URL_HOSTS.includes(url.hostname.toLowerCase());
  } catch { return false; }
}
