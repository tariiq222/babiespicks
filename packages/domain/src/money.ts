import { Prisma } from '@babiespicks/db';
import type { FxSnapshot, Money } from './international-contracts';

// Isolate precision from Decimal's process-wide defaults. Decimal(20,6) values and
// decimal-string rates (26 digits) need more than Decimal's default 20 digits.
const Decimal = Prisma.Decimal.clone({ precision: 100, rounding: Prisma.Decimal.ROUND_HALF_UP });
const amountPattern = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
const ratePattern = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,12})?$/;
const currencyPattern = /^[A-Z]{3}$/;
const maxAmount = new Decimal('99999999999999.999999');

/** Arithmetic only, NOT source approval. Callers must enforce the price source's
 * allowConversion policy and obtain one approved snapshot for the entire request.
 * Rates mean units of currency per ONE base unit. No display/minor-unit rounding
 * (including JPY) occurs here; round only to the shared Decimal(20,6) boundary.
 */
export function convertMoney(value: Money | null, target: string, fx: FxSnapshot, now: Date): Money | null {
  try {
    if (!value || typeof value.amount !== 'string' || !amountPattern.test(value.amount) || !currencyPattern.test(value.currency) || !currencyPattern.test(target)) return null;
    if (!isUsableFxSnapshot(fx, now)) return null;
    const from = value.currency === fx.base ? '1' : fx.rates[value.currency];
    const to = target === fx.base ? '1' : fx.rates[target];
    if (!from || !to) return null;
    const result = new Decimal(value.amount).mul(to).div(from);
    if (!result.isFinite() || result.isNegative() || result.gt(maxAmount)) return null;
    const rounded = result.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    // A positive unknown-size price must never become a synthetic free price.
    if (!result.isZero() && rounded.isZero()) return null;
    return { amount: rounded.toFixed(6).replace(/\.?0+$/, '') || '0', currency: target };
  } catch { return null; }
}

/** Structural/freshness check shared by repository reads and arithmetic. The
 * alphabetic currency check is not a marketplace activation allowlist. */
export function isUsableFxSnapshot(fx: FxSnapshot, now: Date): boolean {
  if (!fx || !fx.id || !fx.sourceId || !currencyPattern.test(fx.base) || !fx.rates || typeof fx.rates !== 'object' || Array.isArray(fx.rates)) return false;
  const asOf = Date.parse(fx.asOf), expiresAt = Date.parse(fx.expiresAt), time = now.getTime();
  if (![asOf, expiresAt, time].every(Number.isFinite) || asOf > time || expiresAt <= time || expiresAt <= asOf) return false;
  for (const [currency, rate] of Object.entries(fx.rates)) {
    if (!currencyPattern.test(currency) || typeof rate !== 'string' || !ratePattern.test(rate) || !/[1-9]/.test(rate)) return false;
  }
  return fx.rates[fx.base] === undefined || new Decimal(fx.rates[fx.base]!).eq(1);
}
