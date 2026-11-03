import { describe, expect, it } from 'vitest';
import { selectOffers, type OfferObservation, type DeliveryEvidence, type SelectOffersInput } from './offer-selection';
import type { SourcePolicy, FxSnapshot } from './international-contracts';
import { validateVerdict } from './verdict-policy';

const now = new Date('2026-11-02T12:00:00Z');
const checkedAt = '2026-11-02T11:50:00Z';
const expiresAt = '2026-11-02T12:50:00Z';
const policy = (marketplaceCode: 'SA' | 'US'): SourcePolicy => ({ sourceId: `fixture-${marketplaceCode}`, marketplaceCode, transport: 'FIXTURE', priceMaxAgeSeconds: 3600, deliveryMaxAgeSeconds: 3600, retentionSeconds: 3600, enabled: true, status: 'VERIFIED', allowConversion: true, allowAssistant: true, allowBareLink: false });
const fx: FxSnapshot = { id: 'one-snapshot', base: 'USD', rates: { SAR: '3.75' }, sourceId: 'fixture-fx', asOf: checkedAt, expiresAt };
function observation(overrides: Partial<OfferObservation> = {}): OfferObservation {
  return { id: 'price-a', offerId: 'a', productId: 'product', listingId: 'listing', marketplaceCode: 'SA', sellerKey: 'seller', fulfillerKey: 'fulfiller', observedSellerKey: 'seller', observedFulfillerKey: 'fulfiller', scopeKey: 'price:SA:in-marketplace', shipTo: null, price: { amount: '100', currency: 'SAR' }, originalPrice: { amount: '125', currency: 'SAR' }, audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'INCLUDED', sourceId: 'fixture-SA', checkedAt, expiresAt, ...overrides };
}
function evidence(overrides: Partial<DeliveryEvidence> = {}): DeliveryEvidence {
  return { id: 'delivery-a', offerId: 'a', marketplaceCode: 'SA', sellerKey: 'seller', fulfillerKey: 'fulfiller', country: 'SA', precision: 'COUNTRY', state: 'OBSERVED_AVAILABLE', sourceId: 'fixture-SA', checkedAt, expiresAt, ...overrides };
}
function select(overrides: Partial<SelectOffersInput> = {}) {
  return selectOffers({ productId: 'product', observations: [observation()], delivery: [], context: { locale: 'ar', shipTo: null, displayCurrency: null, budget: null, audience: 'PUBLIC' }, fx: null, policies: [policy('SA'), policy('US')], now, ...overrides });
}
const context = (shipTo: 'SA' | 'US' | null, displayCurrency: 'SAR' | 'USD' | null = null) => ({ locale: 'en' as const, shipTo, displayCurrency, budget: null, audience: 'PUBLIC' as const });

describe('selectOffers shared decision engine', () => {
  it('retains SA and US scopes on the same marketplace without overwriting either', () => {
    const sa = observation({ id: 'sa', scopeKey: 'price:SA:ship-to:SA', shipTo: 'SA' });
    const us = observation({ id: 'us', scopeKey: 'price:SA:ship-to:US', shipTo: 'US', price: { amount: '110', currency: 'SAR' } });
    const delivery = [evidence(), evidence({ id: 'us-evidence', country: 'US' })];
    expect(select({ observations: [sa, us], delivery, context: context('SA') }).quotes[0]?.observationId).toBe('sa');
    expect(select({ observations: [sa, us], delivery, context: context('US') }).quotes[0]?.observationId).toBe('us');
  });
  it('selects newest before availability and never revives an older available observation', () => {
    const result = select({ observations: [observation(), observation({ id: 'new', checkedAt: '2026-11-02T11:59:00Z', availability: 'UNAVAILABLE', price: null, originalPrice: null })] });
    expect(result.quotes).toEqual([]);
    expect(result.reason).toBe('NO_ELIGIBLE_OFFER');
  });
  it('does not use a general observation to bypass newer destination unavailability', () => {
    expect(select({ observations: [observation(), observation({ id: 'destination', scopeKey: 'price:SA:ship-to:SA', shipTo: 'SA', availability: 'UNAVAILABLE', price: null })], context: context('SA'), delivery: [evidence()] }).quotes).toEqual([]);
  });
  it('never lets a lower member price suppress or win against public price in the same scope', () => {
    const result = select({ observations: [observation(), observation({ id: 'members', audience: 'MEMBERS', checkedAt: '2026-11-02T11:59:00Z', price: { amount: '1', currency: 'SAR' } })] });
    expect(result.quotes.map(q => q.observationId)).toEqual(['price-a']);
    expect(Object.values(result.bestByGroup)).toEqual(['a']);
  });
  it('compares 40 USD against 100 SAR using one snapshot and a homogeneous tax basis', () => {
    const usd = observation({ id: 'usd', offerId: 'b', marketplaceCode: 'US', sourceId: 'fixture-US', scopeKey: 'price:US:in-marketplace', price: { amount: '40', currency: 'USD' }, originalPrice: { amount: '50', currency: 'USD' } });
    const result = select({ observations: [usd, observation()], fx, context: context(null, 'SAR') });
    expect(result.quotes.map(q => [q.offerId, q.convertedPrice?.amount])).toEqual([['a', undefined], ['b', '150']]);
    expect(result.quotes[1]?.convertedOriginalPrice).toEqual({ amount: '187.5', currency: 'SAR' });
    expect(result.quotes[1]?.discountPercent).toBe('20');
    expect(Object.values(result.bestByGroup)).toEqual(['a']);
    expect(result.fxSnapshotId).toBe(fx.id);
  });
  it('separates different tax bases and never promotes UNKNOWN into a group', () => {
    const result = select({ observations: [observation(), observation({ id: 'excluded', offerId: 'b', taxBasis: 'EXCLUDED' }), observation({ id: 'unknown', offerId: 'c', taxBasis: 'UNKNOWN' })] });
    expect(result.quotes[0]?.comparisonGroup).not.toBe(result.quotes[1]?.comparisonGroup);
    expect(result.quotes[2]?.comparisonGroup).toBeNull();
    expect(Object.values(result.bestByGroup).sort()).toEqual(['a', 'b']);
    expect(select({ observations: [observation({ taxBasis: 'UNKNOWN' })] }).reason).toBe('NO_COMPARABLE_PRICE');
  });
  it('keeps original currencies separated when FX is missing or expired', () => {
    const usd = observation({ id: 'usd', offerId: 'b', marketplaceCode: 'US', sourceId: 'fixture-US', price: { amount: '40', currency: 'USD' }, originalPrice: null });
    for (const snapshot of [null, { ...fx, expiresAt: checkedAt }]) {
      const result = select({ observations: [observation(), usd], fx: snapshot, context: context(null, 'SAR') });
      expect(new Set(result.quotes.map(q => q.comparisonGroup)).size).toBe(2);
      expect(result.quotes[1]?.price?.amount).toBe('40');
      expect(result.quotes[1]?.convertedPrice).toBeNull();
      expect(result.fxSnapshotId).toBeNull();
    }
  });
  it('puts expired or missing delivery evidence into pendingDelivery without claiming availability', () => {
    const result = select({ context: context('SA'), delivery: [evidence({ expiresAt: checkedAt })] });
    expect(result.quotes).toEqual([]);
    expect(result.pendingDelivery[0]?.delivery.state).toBe('UNKNOWN');
    expect(result.pendingDelivery[0]?.price?.amount).toBe('100');
    expect(result.bestByGroup).toEqual({});
  });
  it('newest unavailable delivery blocks older available evidence; other destinations cannot substitute', () => {
    const result = select({ context: context('SA'), delivery: [evidence(), evidence({ id: 'new', checkedAt: '2026-11-02T11:59:00Z', state: 'OBSERVED_UNAVAILABLE' }), evidence({ id: 'us', country: 'US' })] });
    expect(result.quotes).toEqual([]);
    expect(result.pendingDelivery).toEqual([]);
  });
  it('never accepts observations or delivery claims for another seller context', () => {
    expect(select({ observations: [observation(), observation({ id: 'wrong', observedSellerKey: 'another', checkedAt: '2026-11-02T11:59:00Z' })] }).quotes).toEqual([]);
    expect(select({ context: context('SA'), delivery: [evidence({ sellerKey: 'another' })] }).pendingDelivery[0]?.delivery.state).toBe('UNKNOWN');
  });
  it('reads unregistered legacy beside new observations without conversion, comparison or delivery promotion', () => {
    const legacy = observation({ id: 'legacy', offerId: 'legacy', sourceId: 'legacy-sar-backfill', fulfillerKey: null, observedFulfillerKey: null, price: { amount: '1', currency: 'SAR' } });
    const result = select({ observations: [legacy, observation()], fx, context: context(null, 'USD'), delivery: [evidence({ offerId: 'legacy' })] });
    const quote = result.quotes.find(q => q.offerId === 'legacy');
    expect(quote?.price).toEqual({ amount: '1', currency: 'SAR' });
    expect(quote?.taxBasis).toBe('UNKNOWN');
    expect(quote?.convertedPrice).toBeNull();
    expect(quote?.comparisonGroup).toBeNull();
    expect(quote?.delivery.state).toBe('UNKNOWN');
    expect(Object.values(result.bestByGroup)).toEqual(['a']);
    const withDestination = select({ observations: [legacy], context: context('SA'), delivery: [evidence({ offerId: 'legacy' })] });
    expect(withDestination.pendingDelivery[0]?.offerId).toBe('legacy');
  });
  it('disabled policies preserve original price but authorize neither conversion nor comparison', () => {
    const result = select({ policies: [{ ...policy('SA'), enabled: false }], fx, context: context(null, 'USD') });
    expect(result.quotes[0]?.price?.amount).toBe('100');
    expect(result.quotes[0]?.comparisonGroup).toBeNull();
    expect(result.quotes[0]?.convertedPrice).toBeNull();
  });
  it('enforces policy age and retention even when stored expiry is too generous, without older fallback', () => {
    const old = observation({ id: 'old', checkedAt: '2026-11-02T10:59:00Z', expiresAt });
    expect(select({ observations: [old] }).quotes).toEqual([]);
    expect(select({ observations: [observation()], policies: [{ ...policy('SA'), retentionSeconds: 1 }] }).quotes).toEqual([]);
  });
  it('does not compare general and destination-specific price bases or use another destination price', () => {
    const result = select({ observations: [observation(), observation({ id: 'specific', offerId: 'b', scopeKey: 'price:SA:ship-to:SA', shipTo: 'SA' }), observation({ id: 'us-only', offerId: 'c', shipTo: 'US' })], context: context('SA'), delivery: [evidence(), evidence({ offerId: 'b' })] });
    expect(result.quotes).toHaveLength(2);
    expect(result.quotes[0]?.comparisonGroup).not.toBe(result.quotes[1]?.comparisonGroup);
  });
  it('resolves equal prices and timestamps deterministically independent of input order', () => {
    const observations = [observation({ offerId: 'z', id: 'z' }), observation({ offerId: 'a', id: 'second' }), observation({ offerId: 'a', id: 'first' })];
    expect(select({ observations })).toEqual(select({ observations: [...observations].reverse() }));
    expect(Object.values(select({ observations }).bestByGroup)).toEqual(['a']);
    expect(select({ observations }).quotes[0]?.observationId).toBe('first');
  });
  it('drops invalid discounts instead of mixing currencies or reviving an older original price', () => {
    const result = select({ observations: [observation({ originalPrice: { amount: '200', currency: 'USD' } })] });
    expect(result.quotes[0]?.originalPrice).toBeNull();
    expect(result.quotes[0]?.discountPercent).toBeNull();
  });
  it.each([
    { availability: 'UNKNOWN' as const, price: null },
    { price: { amount: '0', currency: 'SAR' } },
    { price: { amount: '-1', currency: 'SAR' } },
    { price: { amount: '100', currency: 'USD' } },
    { isActive: false },
    { checkedAt: '2026-11-02T12:01:00Z' },
    { checkedAt: 'invalid' },
    { expiresAt: '2026-11-02T12:00:00Z' },
    { sourceId: 'fixture-US' },
  ])('fails closed on invalid latest observation %j without an older fallback', patch => {
    expect(select({ observations: [observation({ checkedAt: '2026-11-02T11:40:00Z' }), observation({ id: 'latest', ...patch })] }).quotes).toEqual([]);
  });
  it('does not bypass expired destination scope with a fresh general price', () => {
    expect(select({ observations: [observation(), observation({ id: 'specific', scopeKey: 'price:SA:ship-to:SA', shipTo: 'SA', expiresAt: checkedAt })], context: context('SA'), delivery: [evidence()] }).quotes).toEqual([]);
  });
  it('does not infer delivery when policy forbids evidence or evidence precision is unknown', () => {
    expect(select({ context: context('SA'), delivery: [evidence()], policies: [{ ...policy('SA'), deliveryMaxAgeSeconds: null }] }).pendingDelivery[0]?.delivery.state).toBe('UNKNOWN');
    expect(select({ context: context('SA'), delivery: [evidence({ precision: 'UNKNOWN' })] }).pendingDelivery[0]?.delivery.state).toBe('UNKNOWN');
    expect(select({ context: context('SA'), delivery: [evidence({ sourceId: 'unregistered' })] }).pendingDelivery[0]?.delivery.state).toBe('UNKNOWN');
  });
  it('denied conversion or failed original-price conversion preserves both originals', () => {
    const result = select({ fx, context: context(null, 'USD'), policies: [{ ...policy('SA'), allowConversion: false }] });
    expect(result.quotes[0]?.convertedPrice).toBeNull();
    expect(result.quotes[0]?.convertedOriginalPrice).toBeNull();
    const overflow = select({ fx: { ...fx, rates: { SAR: '0.000000000001' } }, context: context(null, 'USD') });
    expect(overflow.quotes[0]?.convertedPrice).toBeNull();
    expect(overflow.quotes[0]?.price?.amount).toBe('100');
    expect(overflow.quotes[0]?.originalPrice?.amount).toBe('125');
  });
  it('does not round precise decimal amounts through JavaScript numbers when selecting a winner', () => {
    const result = select({ observations: [observation({ id: 'a', offerId: 'a', price: { amount: '99999999999999.999999', currency: 'SAR' } }), observation({ id: 'z', offerId: 'z', price: { amount: '99999999999999.999998', currency: 'SAR' } })] });
    expect(Object.values(result.bestByGroup)).toEqual(['z']);
  });
  it('is pure, JSON-safe, isolates products, and leaves editorial verdict weights untouched', () => {
    const observations = [observation(), observation({ id: 'other', offerId: 'other', productId: 'other' })];
    const before = JSON.stringify(observations);
    const verdict = { safetyScore: 8, qualityScore: 8, reviewsScore: 8, priceScore: 8, longTermScore: 8, overallScore: 8, type: 'WORTH_IT' };
    const expected = validateVerdict(verdict);
    expect(JSON.parse(JSON.stringify(select({ observations }))).quotes).toHaveLength(1);
    expect(JSON.stringify(observations)).toBe(before);
    expect(validateVerdict(verdict)).toEqual(expected);
  });
});
