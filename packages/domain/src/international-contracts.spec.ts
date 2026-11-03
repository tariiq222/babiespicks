import { describe, expect, it, vi } from 'vitest';
import { parseShoppingContext, validateMoney, validateSameCurrency, offerPriceSchema } from './international-contracts';
import { getMarketplace, isApprovedMarketplaceDomain, resolveMarketplaceFromDomain } from './marketplaces';
import { getAllSourcePolicies, resolveSourcePolicy, requireEnabledSourcePolicy } from './source-policy';
import { internationalSchemas, schemas } from './contracts';

// executeTool reads and writes receipts, and money.ts builds its Decimal for the
// exact-arithmetic boundary; both need the real Prisma namespace, not an empty stub.
// db is aliased to this package's own (Prisma re-exporting) entry point; @prisma/client
// itself is not a domain dependency.
vi.mock('@babiespicks/db', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), prisma: {} }));

const context = { locale: 'ar', shipTo: 'SA', displayCurrency: 'USD', budget: null, audience: 'PUBLIC' };
const observation = { availability: 'AVAILABLE', price: { amount: '10.25', currency: 'USD' }, originalPrice: { amount: '12', currency: 'USD' } };

describe('international money and context boundary', () => {
  it('rejects money without a currency, including a budget', () => {
    expect(() => validateMoney({ amount: '10' } as any, 'price')).toThrow();
    expect(() => parseShoppingContext({ ...context, budget: { amount: '10' } })).toThrow();
  });
  it.each(['-1', 'NaN', '1e2', '01', '1.0000001', '100000000000000'])('rejects noncanonical or out-of-range amount %s', amount => {
    expect(() => validateMoney({ amount, currency: 'SAR' }, 'price')).toThrow();
  });
  it('rejects an unsupported ISO currency', () => {
    expect(() => validateMoney({ amount: '10', currency: 'FAKE' }, 'price')).toThrow();
  });
  it('rejects unsupported country rather than silently accepting it as neutral', () => {
    expect(() => parseShoppingContext({ ...context, shipTo: 'GB' })).toThrow();
  });
  it('preserves independent locale, destination and currency; absent choices stay neutral', () => {
    expect(parseShoppingContext(context)).toEqual(context);
    expect(parseShoppingContext({ locale: 'en' })).toEqual({ locale: 'en', shipTo: null, displayCurrency: null, budget: null, audience: 'PUBLIC' });
  });
  it('does not accept a client membership claim or extra actor field', () => {
    expect(() => parseShoppingContext({ ...context, audience: 'MEMBERS' })).toThrow();
    expect(() => parseShoppingContext({ ...context, actor: { canPublish: true } } as any)).toThrow();
    expect(() => parseShoppingContext(null as any)).toThrow();
  });
  it('validates complete budgets without rounding or currency inference', () => {
    expect(parseShoppingContext({ ...context, budget: { amount: '100.123456', currency: 'USD' } }).budget).toEqual({ amount: '100.123456', currency: 'USD' });
    expect(() => parseShoppingContext({ ...context, displayCurrency: 'EUR' })).toThrow();
  });
  it('rejects mixed-currency discount pairs', () => {
    expect(() => validateSameCurrency({ amount: '10', currency: 'USD' }, { amount: '12', currency: 'SAR' }, 'discount')).toThrow();
    expect(offerPriceSchema.safeParse({ ...observation, originalPrice: { amount: '12', currency: 'SAR' } }).success).toBe(false);
    expect(offerPriceSchema.safeParse({ ...observation, originalPrice: { amount: '8', currency: 'USD' } }).success).toBe(false);
  });
  it('represents unavailable prices as null, never fabricated zero', () => {
    expect(offerPriceSchema.parse({ availability: 'UNAVAILABLE' }).price).toBeNull();
    expect(offerPriceSchema.safeParse({ availability: 'AVAILABLE' }).success).toBe(false);
    expect(offerPriceSchema.safeParse({ availability: 'UNAVAILABLE', price: { amount: '0', currency: 'USD' } }).success).toBe(false);
    expect(offerPriceSchema.safeParse(observation).success).toBe(true);
    expect(offerPriceSchema.safeParse({ ...observation, price: { amount: 'NaN', currency: 'USD' } }).success).toBe(false);
  });
});

describe('marketplace and source policy registry', () => {
  it.each(['amazon.com.evil.test', 'evilamazon.com', 'amazon.sa.evil.test', 'evil.amazon.com'])('rejects spoofed hostname %s', hostname => {
    expect(isApprovedMarketplaceDomain(hostname)).toBe(false);
    expect(resolveMarketplaceFromDomain(hostname)).toBeUndefined();
  });
  it('accepts only explicitly listed official hostnames and keeps currency scoped', () => {
    expect(resolveMarketplaceFromDomain('www.amazon.com')).toBe('US');
    expect(resolveMarketplaceFromDomain('amazon.sa')).toBe('SA');
    expect(getMarketplace('US')?.currencies).toEqual(['USD']);
    expect(getMarketplace('GB')).toBeUndefined();
  });
  it('rejects unknown and cross-market sources without a generic fallback', () => {
    expect(() => resolveSourcePolicy('scraper', 'US')).toThrow();
    expect(() => resolveSourcePolicy('amazon-creators-api-us', 'SA')).toThrow();
  });
  it('publishes disabled policies and explicitly refuses them for new writes', () => {
    const policy = resolveSourcePolicy('amazon-creators-api-us', 'US');
    expect(policy).toMatchObject({ enabled: false, status: 'UNVERIFIED', priceMaxAgeSeconds: 3600, deliveryMaxAgeSeconds: null, retentionSeconds: 3600, allowConversion: false, allowAssistant: false, allowBareLink: false });
    expect(() => requireEnabledSourcePolicy('amazon-creators-api-us', 'US')).toThrow();
    expect(getAllSourcePolicies()).toHaveLength(4);
    expect(resolveSourcePolicy('amazon-paapi5-sa', 'SA').status).toBe('UNAVAILABLE');
  });
  it('does not allow callers to mutate registry activation', () => {
    const policy = resolveSourcePolicy('amazon-creators-api-sa', 'SA');
    expect(() => { (policy as any).enabled = true; }).toThrow();
    expect(resolveSourcePolicy('amazon-creators-api-sa', 'SA').enabled).toBe(false);
    expect(() => { (getMarketplace('US')!.currencies as string[]).push('SAR'); }).toThrow();
  });
});

describe('MCP compatibility and preparatory schemas', () => {
  it('keeps the legacy price writer SAR-only', () => {
    const legacy = { productId: 'p', storeId: 's', amount: 10, sourceUrl: 'https://amazon.com/dp/B000000001', checkedAt: '2026-11-02T12:00:00Z', idempotencyKey: 'k' };
    expect(schemas.bp_record_price.parse(legacy).currency).toBe('SAR');
    expect(schemas.bp_record_price.safeParse({ ...legacy, currency: 'USD' }).success).toBe(false);
  });
  it('registers six strict international tools and keeps the legacy writer untouched', () => {
    expect(Object.keys(internationalSchemas)).toHaveLength(6);
    expect(Object.keys(schemas)).toEqual(expect.arrayContaining(Object.keys(internationalSchemas)));
    expect(internationalSchemas.bp_get_offer.safeParse({ id: 'offer', actor: { canPublish: true } }).success).toBe(false);
    expect(internationalSchemas.bp_get_offer.parse({ id: 'offer' })).toEqual({ id: 'offer' });
  });
  it('checks listing market URLs and source currencies on planned observations', () => {
    const listing = { productId: 'p', storeId: 's', marketplaceCode: 'US', asin: 'B000000001', variantKey: 'default', sourceUrl: 'https://www.amazon.com/dp/B000000001', idempotencyKey: 'k' };
    expect(internationalSchemas.bp_upsert_listing.safeParse(listing).success).toBe(true);
    expect(internationalSchemas.bp_upsert_listing.safeParse({ ...listing, sourceUrl: 'https://amazon.com.evil.test/dp/B000000001' }).success).toBe(false);
    const price = { offerId: 'o', marketplaceCode: 'US', sellerKey: 'seller', fulfillerKey: 'unknown:listing', shipTo: null, audience: 'PUBLIC', taxBasis: 'UNKNOWN', ...observation, sourceId: 'amazon-creators-api-us', sourceUrl: listing.sourceUrl, checkedAt: '2026-11-02T12:00:00Z', idempotencyKey: 'k' };
    expect(internationalSchemas.bp_record_offer_price.safeParse(price).success).toBe(true);
    expect(internationalSchemas.bp_record_offer_price.safeParse({ ...price, sourceId: 'scraper' }).success).toBe(false);
    expect(internationalSchemas.bp_record_offer_price.safeParse({ ...price, price: { amount: '10', currency: 'SAR' }, originalPrice: null }).success).toBe(false);
    expect(internationalSchemas.bp_record_offer_price.safeParse({ ...price, verified: true }).success).toBe(false);
  });
  it('exposes disabled international capabilities without altering trusted publishing grants', async () => {
    const { executeTool } = await import('./index');
    const result = await executeTool('bp_get_capabilities', {}, { id: 'editor', canPublish: false });
    expect(result.publishing.allowed).toBe(false);
    expect(result.priceFreshnessHours).toBe(48);
    expect(result.internationalOffers).toMatchObject({ contractVersion: 2, enabled: false, deliveryCountries: ['SA', 'US'], displayCurrencies: ['SAR', 'USD'], agentInstructionVersion: '2026-11-02.2' });
    expect(result.internationalOffers.sourcePolicies).toEqual(getAllSourcePolicies());
  });
  it('can import the client subpath while all server modules are unavailable', async () => {
    vi.doMock('@babiespicks/db', () => { throw new Error('server dependency loaded'); });
    const subpath = '@babiespicks/domain/international';
    const client = await import(/* @vite-ignore */ subpath);
    expect(client.parseShoppingContext({ locale: 'ar' }).shipTo).toBeNull();
    expect(client.resolveSourcePolicy('amazon-creators-api-sa', 'SA').enabled).toBe(false);
  });
});
