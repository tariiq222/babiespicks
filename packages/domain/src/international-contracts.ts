/**
 * International contracts for BabiesPicks — Money, ShoppingContext, OfferQuote,
 * OfferSelection, FxSnapshot. Pure types and parsers with no Prisma, node:fs,
 * or env dependencies. Safe for client-side import via subpath export.
 */

import { z } from 'zod';
import { APPROVED_CURRENCIES, getMarketplace, isCurrencyApprovedForMarketplace, type MarketplaceCode } from './marketplaces';
export * from './marketplaces';
export * from './source-policy';
// CouponScope is Money + coupon conditions; client-safe and needed by the web surfaces.
export * from './coupon-scope';

// ── Core value types ────────────────────────────────────────────────────────

/** Decimal amount stored as string to avoid floating-point loss. ISO 4217 currency. */
export interface Money {
  readonly amount: string;
  readonly currency: string;
}

export type DeliveryCountry = 'SA' | 'US';
export type DisplayCurrency = 'SAR' | 'USD';
export type TaxBasis = 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
export type DeliveryState = 'OBSERVED_AVAILABLE' | 'OBSERVED_UNAVAILABLE' | 'UNKNOWN';
export type DeliveryPrecision = 'COUNTRY' | 'POSTAL_SAMPLE' | 'UNKNOWN';
export type Audience = 'PUBLIC' | 'MEMBERS';

export interface ShoppingContext {
  readonly locale: 'ar' | 'en';
  readonly shipTo: DeliveryCountry | null;
  readonly displayCurrency: DisplayCurrency | null;
  readonly budget: Money | null;
  readonly audience: 'PUBLIC';
}

export interface FxSnapshot {
  readonly id: string;
  readonly base: string;
  readonly rates: Record<string, string>;
  readonly sourceId: string;
  readonly asOf: string;
  readonly expiresAt: string;
}

export interface DeliveryInfo {
  readonly state: DeliveryState;
  readonly country: DeliveryCountry | null;
  readonly precision: DeliveryPrecision;
  readonly checkedAt: string | null;
}

export interface OfferQuote {
  readonly offerId: string;
  readonly observationId: string;
  readonly productId: string;
  readonly marketplaceCode: string;
  readonly listingId: string;
  readonly sellerKey: string;
  readonly fulfillerKey: string;
  /** null when price is unavailable — never a synthetic 0. */
  readonly price: Money | null;
  readonly originalPrice: Money | null;
  readonly convertedPrice: Money | null;
  readonly fxSnapshotId: string | null;
  readonly taxBasis: TaxBasis;
  readonly checkedAt: string;
  readonly expiresAt: string;
  readonly audience: Audience;
  readonly delivery: DeliveryInfo;
  readonly comparisonGroup: string | null;
}

export interface OfferSelection {
  readonly quotes: OfferQuote[];
  readonly pendingDelivery: OfferQuote[];
  readonly bestByGroup: Record<string, string>;
  readonly reason: 'OK' | 'NO_ELIGIBLE_OFFER' | 'NO_COMPARABLE_PRICE';
  readonly contextKey: string;
  readonly fxSnapshotId: string | null;
}

// ── Validation helpers ──────────────────────────────────────────────────────

const VALID_DELIVERY_COUNTRIES: ReadonlySet<string> = new Set(['SA', 'US']);
const VALID_DISPLAY_CURRENCIES: ReadonlySet<string> = new Set(['SAR', 'USD']);
const VALID_LOCALES: ReadonlySet<string> = new Set(['ar', 'en']);

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

/**
 * Validate a Money value. Rejects missing/empty currency and non-numeric amounts.
 * A null/undefined Money is valid (price unavailable), but a present Money must be complete.
 */
export function validateMoney(money: Money | null | undefined, label: string): void {
  if (money === null || money === undefined) return;
  if (!APPROVED_CURRENCIES.includes(money.currency)) {
    throw new ContractValidationError(`${label}: currency is required when amount is present`);
  }
  if (typeof money.amount !== 'string' || money.amount.trim() === '') {
    throw new ContractValidationError(`${label}: amount must be a non-empty decimal string`);
  }
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(money.amount)) {
    throw new ContractValidationError(`${label}: amount must be a valid decimal string`);
  }
}

/**
 * Validate that a source/marketplace code is registered in the marketplace registry.
 */
export function validateMarketplaceCode(code: string, label: string): asserts code is MarketplaceCode {
  if (!getMarketplace(code)) {
    throw new ContractValidationError(`${label}: unapproved marketplace code "${code}"`);
  }
}

/**
 * Validate that a delivery country is SA or US.
 */
export function validateDeliveryCountry(country: string | null, label: string): asserts country is DeliveryCountry | null {
  if (country === null) return;
  if (!VALID_DELIVERY_COUNTRIES.has(country)) {
    throw new ContractValidationError(`${label}: country must be SA or US, got "${country}"`);
  }
}

/**
 * Validate that two Money values in a single discount context share the same currency.
 * Mixing currencies in one discount calculation is forbidden.
 */
export function validateSameCurrency(a: Money | null, b: Money | null, label: string): void {
  if (!a || !b) return;
  if (a.currency !== b.currency) {
    throw new ContractValidationError(
      `${label}: cannot mix currencies ${a.currency} and ${b.currency} in a single discount context`
    );
  }
}

/**
 * Validate that a currency is approved for its marketplace.
 */
export function validateCurrencyForMarketplace(currency: string, marketplaceCode: string, label: string): void {
  const mc = marketplaceCode as MarketplaceCode;
  if (!isCurrencyApprovedForMarketplace(currency, mc)) {
    throw new ContractValidationError(
      `${label}: currency ${currency} is not approved for marketplace ${marketplaceCode}`
    );
  }
}

// ── Parsers ─────────────────────────────────────────────────────────────────

export interface RawShoppingContext {
  locale?: unknown;
  shipTo?: unknown;
  displayCurrency?: unknown;
  budget?: unknown;
  audience?: unknown;
}

/** Decimal(20,6) boundary, with at most fourteen integer digits. No JS-number coercion. */
export const moneySchema = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/),
  currency: z.string().refine(c => APPROVED_CURRENCIES.includes(c), 'Unapproved currency'),
}).strict();
export const positiveMoneySchema = moneySchema.refine(m => /[1-9]/.test(m.amount), 'Price must be positive');
export const deliveryCountrySchema = z.enum(['SA', 'US']);
export const marketplaceCodeSchema = z.enum(['SA', 'US']);
export const audienceSchema = z.enum(['PUBLIC', 'MEMBERS']);
export const taxBasisSchema = z.enum(['INCLUDED', 'EXCLUDED', 'UNKNOWN']);
export const timestampSchema = z.iso.datetime({ offset: true });

/** Exact comparison of canonical nonnegative decimals without floating-point rounding. */
function decimalUnits(amount: string): bigint {
  const [integer, fraction = ''] = amount.split('.');
  return BigInt(integer! + fraction.padEnd(6, '0'));
}
export const offerPriceSchema = z.object({
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN']),
  price: positiveMoneySchema.nullable().default(null),
  originalPrice: positiveMoneySchema.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.availability === 'AVAILABLE' && !value.price) ctx.addIssue({ code: 'custom', message: 'Available observation requires a price', path: ['price'] });
  // Zod refinements can still run after a child regex issue; never parse invalid money.
  if (value.originalPrice && (!value.price || value.price.currency !== value.originalPrice.currency ||
    (positiveMoneySchema.safeParse(value.price).success && positiveMoneySchema.safeParse(value.originalPrice).success && decimalUnits(value.originalPrice.amount) <= decimalUnits(value.price.amount)))) {
    ctx.addIssue({ code: 'custom', message: 'Discount requires higher original price in the same currency', path: ['originalPrice'] });
  }
});
export const shoppingContextSchema = z.object({
  locale: z.enum(['ar', 'en']),
  shipTo: deliveryCountrySchema.nullable().default(null),
  displayCurrency: z.enum(['SAR', 'USD']).nullable().default(null),
  budget: moneySchema.nullable().default(null),
  audience: z.literal('PUBLIC').default('PUBLIC'),
}).strict();
/** Missing choices are neutral. Invalid supplied values are rejected, not reinterpreted. */
export function parseShoppingContext(input: unknown): ShoppingContext {
  return shoppingContextSchema.parse(input);
}