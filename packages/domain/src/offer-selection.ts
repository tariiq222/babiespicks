import type {
  Audience, DeliveryCountry, DeliveryInfo, DeliveryPrecision, DeliveryState,
  FxSnapshot, Money, OfferQuote, OfferSelection, ShoppingContext, SourcePolicy, TaxBasis,
} from './international-contracts';
import { positiveMoneySchema } from './international-contracts';
import { isCurrencyApprovedForMarketplace } from './marketplaces';
import { convertMoney } from './money';

/** Server projection boundary: Prisma Decimal amounts must already be canonical
 * Money strings. Expected identity comes from the selected immutable offer;
 * observed identity comes from the source observation, never browsing location. */
export interface OfferObservation {
  readonly id: string;
  readonly offerId: string;
  readonly productId: string;
  readonly listingId: string;
  readonly marketplaceCode: string;
  readonly sellerKey: string;
  readonly fulfillerKey: string | null;
  readonly observedSellerKey: string;
  readonly observedFulfillerKey: string | null;
  readonly scopeKey: string;
  readonly shipTo: DeliveryCountry | null;
  readonly price: Money | null;
  readonly originalPrice: Money | null;
  readonly audience: Audience;
  readonly availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  readonly taxBasis: TaxBasis;
  readonly sourceId: string;
  readonly checkedAt: string;
  readonly expiresAt: string;
  readonly isActive?: boolean;
}
export interface DeliveryEvidence {
  readonly id: string;
  readonly offerId: string;
  readonly marketplaceCode: string;
  readonly sellerKey: string;
  readonly fulfillerKey: string | null;
  readonly country: DeliveryCountry;
  readonly precision: DeliveryPrecision;
  readonly state: DeliveryState;
  readonly sourceId: string;
  readonly checkedAt: string;
  readonly expiresAt: string;
}
export interface SelectOffersInput {
  readonly productId: string;
  readonly observations: readonly OfferObservation[];
  readonly delivery: readonly DeliveryEvidence[];
  readonly context: ShoppingContext;
  /** One snapshot obtained through getFxSnapshot's trusted policy gate. */
  readonly fx: FxSnapshot | null;
  /** Trusted server policies, not client supplied overrides. */
  readonly policies: readonly SourcePolicy[];
  readonly now: Date;
}
export interface SelectedOfferQuote extends OfferQuote {
  readonly convertedOriginalPrice: Money | null;
  /** Exact decimal percentage, rounded to six decimals, never a binary float. */
  readonly discountPercent: string | null;
}
export interface SelectedOfferSelection extends OfferSelection {
  readonly quotes: SelectedOfferQuote[];
  readonly pendingDelivery: SelectedOfferQuote[];
}

const key = (parts: unknown[]) => JSON.stringify(parts);
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const time = (at: string) => Date.parse(at);
function newer<T extends { checkedAt: string; id: string }>(a: T, b: T): boolean {
  // Invalid timestamps win their slot and subsequently fail freshness. A malformed
  // latest row must not silently resurrect an older, apparently healthy price.
  const aa = time(a.checkedAt), bb = time(b.checkedAt);
  if (!Number.isFinite(aa)) return Number.isFinite(bb) || lexical(a.id, b.id) < 0;
  if (!Number.isFinite(bb)) return false;
  return aa > bb || (aa === bb && lexical(a.id, b.id) < 0);
}
function latest<T extends { checkedAt: string; id: string }>(rows: readonly T[], slot: (row: T) => string): T[] {
  const found = new Map<string, T>();
  for (const row of rows) {
    const id = slot(row), old = found.get(id);
    if (!old || newer(row, old)) found.set(id, row);
  }
  return [...found.values()];
}
function fresh(row: { checkedAt: string; expiresAt: string }, now: Date, maxAge?: number | null, retention?: number | null): boolean {
  const checked = time(row.checkedAt), expires = time(row.expiresAt), at = now.getTime();
  if (![checked, expires, at].every(Number.isFinite) || checked > at || expires <= at || expires <= checked) return false;
  for (const limit of [maxAge, retention]) {
    if (limit === undefined) continue;
    if (limit === null || !Number.isSafeInteger(limit) || limit <= 0 || at - checked >= limit * 1000) return false;
  }
  return true;
}
function policyFor(input: SelectOffersInput, sourceId: string, marketplace: string): SourcePolicy | undefined {
  // No resolveSourcePolicy call: legacy-sar-backfill intentionally has no registry
  // entry. Unknown sources remain readable but NEVER acquire trusted context.
  return input.policies.find(p => p.sourceId === sourceId && p.marketplaceCode === marketplace);
}
const enabled = (policy: SourcePolicy | undefined) => policy?.enabled === true && policy.status === 'VERIFIED';
const units = (amount: string): bigint => {
  const [integer, fraction = ''] = amount.split('.');
  return BigInt(integer! + fraction.padEnd(6, '0'));
};
function decimal(units: bigint): string {
  const value = units.toString().padStart(7, '0');
  return `${value.slice(0, -6)}.${value.slice(-6)}`.replace(/\.?0+$/, '');
}
function discount(price: Money, original: Money | null): string | null {
  if (!original) return null;
  const base = units(original.amount);
  // Half-up at six decimal places; the ratio always comes from this observation.
  return decimal(((base - units(price.amount)) * 100_000_000n + base / 2n) / base);
}
const copyMoney = (money: Money): Money => ({ amount: money.amount, currency: money.currency });
function deliveryFor(input: SelectOffersInput, observation: OfferObservation, trusted: boolean): DeliveryInfo {
  const country = input.context.shipTo;
  const unknown: DeliveryInfo = { state: 'UNKNOWN', country, precision: 'UNKNOWN', checkedAt: null };
  if (!country || !trusted) return unknown;
  // Reduce before policy/freshness/identity. A failed newer evidence row cannot
  // be hidden by an older available claim, even from another source.
  const row = latest(input.delivery.filter(d => d.offerId === observation.offerId && d.country === country), d => key([d.offerId, d.country]))[0];
  if (!row || row.marketplaceCode !== observation.marketplaceCode || row.sellerKey !== observation.sellerKey || row.fulfillerKey !== observation.fulfillerKey) return unknown;
  const policy = policyFor(input, row.sourceId, row.marketplaceCode);
  if (!enabled(policy) || !fresh(row, input.now, policy!.deliveryMaxAgeSeconds, policy!.retentionSeconds)) return unknown;
  if (row.precision === 'UNKNOWN' || row.state === 'UNKNOWN') return unknown;
  return { state: row.state, country, precision: row.precision, checkedAt: row.checkedAt };
}
function effectivePrice(quote: SelectedOfferQuote): Money { return (quote.convertedPrice ?? quote.price)!; }
function compareQuotes(a: SelectedOfferQuote, b: SelectedOfferQuote): number {
  // There is deliberately no global cross-currency/tax price ranking. Sort each
  // compatible group independently; uncomparable originals follow by offer id.
  const group = a.comparisonGroup === b.comparisonGroup ? 0 : a.comparisonGroup === null ? 1 : b.comparisonGroup === null ? -1 : lexical(a.comparisonGroup, b.comparisonGroup);
  if (group) return group;
  if (a.comparisonGroup) {
    const aa = units(effectivePrice(a).amount), bb = units(effectivePrice(b).amount);
    if (aa !== bb) return aa < bb ? -1 : 1;
  }
  return lexical(a.offerId, b.offerId) || lexical(a.observationId, b.observationId);
}

/** The single decision engine for catalog/detail/chat/purchase projections.
 * No I/O, no mutation, no editorial scoring. Never infer shipping from market,
 * language, currency, membership or a marketplace-default price observation. */
export function selectOffers(input: SelectOffersInput): SelectedOfferSelection {
  const quotes: SelectedOfferQuote[] = [], pendingDelivery: SelectedOfferQuote[] = [];
  const { context } = input;
  const contextKey = key([context.locale, context.shipTo, context.displayCurrency, context.audience, context.budget]);
  const perScope = latest(input.observations.filter(o => o.productId === input.productId), o => key([o.offerId, o.marketplaceCode, o.scopeKey, o.shipTo, o.audience]));
  const perOffer = new Map<string, OfferObservation[]>();
  for (const observation of perScope) {
    if (observation.audience !== context.audience || (observation.shipTo !== null && observation.shipTo !== context.shipTo)) continue;
    const rows = perOffer.get(observation.offerId) ?? [];
    rows.push(observation);
    perOffer.set(observation.offerId, rows);
  }
  for (const rows of perOffer.values()) {
    const destination = context.shipTo ? rows.filter(o => o.shipTo === context.shipTo) : [];
    const candidates = destination.length ? destination : rows.filter(o => o.shipTo === null);
    const observation = latest(candidates, () => 'selected-scope')[0];
    if (!observation) continue;
    const policy = policyFor(input, observation.sourceId, observation.marketplaceCode);
    if (!fresh(observation, input.now, policy?.priceMaxAgeSeconds, policy?.retentionSeconds) || observation.isActive === false || observation.availability !== 'AVAILABLE') continue;
    if (!observation.sellerKey || observation.observedSellerKey !== observation.sellerKey || observation.observedFulfillerKey !== observation.fulfillerKey || (enabled(policy) && !observation.fulfillerKey)) continue;
    if (!positiveMoneySchema.safeParse(observation.price).success) continue;
    const price = copyMoney(observation.price!);
    // A registered source in the wrong marketplace is not an anonymous legacy row.
    if (input.policies.some(p => p.sourceId === observation.sourceId && p.marketplaceCode !== observation.marketplaceCode)) continue;
    if (policy && !isCurrencyApprovedForMarketplace(price.currency, policy.marketplaceCode)) continue;
    const trusted = enabled(policy);
    const originalPrice = positiveMoneySchema.safeParse(observation.originalPrice).success && observation.originalPrice!.currency === price.currency && units(observation.originalPrice!.amount) > units(price.amount) ? copyMoney(observation.originalPrice!) : null;
    let convertedPrice: Money | null = null, convertedOriginalPrice: Money | null = null;
    if (trusted && policy!.allowConversion && context.displayCurrency && context.displayCurrency !== price.currency && input.fx) {
      convertedPrice = convertMoney(price, context.displayCurrency, input.fx, input.now);
      convertedOriginalPrice = originalPrice ? convertMoney(originalPrice, context.displayCurrency, input.fx, input.now) : null;
      if (originalPrice && !convertedOriginalPrice) convertedPrice = null;
      if (!convertedPrice) convertedOriginalPrice = null;
    }
    const delivery = deliveryFor(input, observation, trusted);
    if (delivery.state === 'OBSERVED_UNAVAILABLE') continue;
    const taxBasis = trusted ? observation.taxBasis : 'UNKNOWN';
    const pending = context.shipTo !== null && delivery.state === 'UNKNOWN';
    const comparisonGroup = trusted && !pending && taxBasis !== 'UNKNOWN'
      ? key([context.shipTo, observation.shipTo === null ? 'IN_MARKETPLACE' : 'SHIP_TO', context.audience, taxBasis, (convertedPrice ?? price).currency]) : null;
    const quote: SelectedOfferQuote = {
      offerId: observation.offerId, observationId: observation.id, productId: observation.productId,
      marketplaceCode: observation.marketplaceCode, listingId: observation.listingId,
      sellerKey: observation.sellerKey, fulfillerKey: observation.fulfillerKey ?? key(['UNKNOWN_FULFILLER', observation.sourceId, observation.offerId]),
      price, originalPrice, convertedPrice, convertedOriginalPrice,
      discountPercent: discount(price, originalPrice), fxSnapshotId: convertedPrice ? input.fx!.id : null,
      taxBasis, checkedAt: observation.checkedAt, expiresAt: observation.expiresAt,
      audience: observation.audience, delivery, comparisonGroup,
    };
    (pending ? pendingDelivery : quotes).push(quote);
  }
  quotes.sort(compareQuotes);
  pendingDelivery.sort(compareQuotes);
  const bestByGroup: Record<string, string> = {};
  for (const quote of quotes) {
    if (quote.comparisonGroup && !Object.hasOwn(bestByGroup, quote.comparisonGroup)) bestByGroup[quote.comparisonGroup] = quote.offerId;
  }
  return {
    quotes, pendingDelivery, bestByGroup, contextKey,
    fxSnapshotId: [...quotes, ...pendingDelivery].some(q => q.fxSnapshotId) ? input.fx!.id : null,
    reason: Object.keys(bestByGroup).length ? 'OK' : quotes.length || pendingDelivery.length ? 'NO_COMPARABLE_PRICE' : 'NO_ELIGIBLE_OFFER',
  };
}
