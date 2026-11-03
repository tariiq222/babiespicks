import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
// Approval belongs to the trusted registry. This fixture replaces that module only
// inside this test process; production has no env/request override or source change.
const resolver = vi.hoisted(() => vi.fn());
vi.mock('@babiespicks/domain', async importOriginal => {
  const actual = await importOriginal<typeof import('@babiespicks/domain')>();
  return { ...actual, getAllSourcePolicies: () => [{ sourceId: 'fixture-US', marketplaceCode: 'US', transport: 'FIXTURE', priceMaxAgeSeconds: 3600, deliveryMaxAgeSeconds: 3600, retentionSeconds: 3600, enabled: true, status: 'VERIFIED', allowConversion: false, allowAssistant: true, allowBareLink: false }], resolveOfferTarget: resolver };
});
import { createPublicQueries } from '../public-queries';
import { parseShoppingContext } from '@babiespicks/domain';
const now = new Date('2026-11-03T12:00:00Z');
const context = parseShoppingContext({ locale: 'en', shipTo: 'US', displayCurrency: 'USD', audience: 'PUBLIC' });
function database() {
  const product = { id: 'p', name: 'Product', slug: 'p', isActive: true, createdAt: now, translations: [], specs: [], sources: [], imageUrls: [], verdict: null, reviewSummary: null, category: null, prices: [] };
  const offer = { id: 'offer', listingId: 'listing', isActive: true, sellerKey: 'seller', fulfillerKey: 'fulfiller', listing: { id: 'listing', productId: 'p', marketplaceCode: 'US', product: { publishStatus: 'PUBLISHED', isActive: true }, store: { id: 's', name: 'Amazon US', slug: 'amazon-us', isActive: true, marketplaceCode: 'US' } }, priceObservations: [{ id: 'current', offerId: 'offer', scopeKey: 'default', shipTo: 'US', amount: '20.123456', currency: 'USD', originalAmount: '30', audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'EXCLUDED', sourceId: 'fixture-US', checkedAt: now, expiresAt: new Date(now.getTime() + 60000) }], deliveryEvidence: [{ id: 'delivery', offerId: 'offer', country: 'US', precision: 'COUNTRY', state: 'OBSERVED_AVAILABLE', sourceId: 'fixture-US', checkedAt: now, expiresAt: new Date(now.getTime() + 60000) }] };
  return { productRow: product, offer,
    $queryRaw: vi.fn().mockResolvedValue([]), product: { findFirst: vi.fn().mockResolvedValue(product), findMany: vi.fn().mockResolvedValue([product]) }, purchaseOffer: { findMany: vi.fn().mockResolvedValue([offer]) } };
}
beforeEach(() => resolver.mockReset());
it('projects approved exact source money and only exposes a path after the canonical resolver succeeds', async () => {
  const db = database(); resolver.mockResolvedValue({ url: 'https://www.amazon.com/dp/EXACT?tag=fixture-20' });
  const page = await createPublicQueries(db as never).getProductOffers('p', context, now);
  expect(page.offers?.quotes[0]).toMatchObject({ observationId: 'current', price: { amount: '20.123456', currency: 'USD' }, store: { id: 's', slug: 'amazon-us' }, purchasePath: '/go/offer/offer?observationId=current&locale=en&shipTo=US' });
  expect(resolver).toHaveBeenCalledExactlyOnceWith(db, { offerId: 'offer', observationId: 'current', shipTo: 'US' }, now);
  expect(page.product?.prices).toEqual([]); expect(page.legacyPrice).toBeNull();
});
it('keeps an approved quote unlinked when exact current target validation fails', async () => {
  resolver.mockResolvedValue(null);
  const page = await createPublicQueries(database() as never).getProductOffers('p', context, now);
  expect(page.offers?.quotes[0]).toMatchObject({ price: { amount: '20.123456', currency: 'USD' }, purchasePath: null });
});
it('filters disabled stores before the engine without reviving a legacy fallback', async () => {
  const db = database(); db.offer.listing.store.isActive = false;
  const page = await createPublicQueries(db as never).getProductOffers('p', context, now);
  expect(page.offers?.quotes).toEqual([]); expect(page.offers?.pendingDelivery).toEqual([]); expect(page.legacyPrice).toBeNull(); expect(resolver).not.toHaveBeenCalled();
});
it('keeps unverified delivery explicit even for an approved price', async () => {
  const db = database(); db.offer.deliveryEvidence = [];
  resolver.mockResolvedValue(null);
  const page = await createPublicQueries(db as never).getProductOffers('p', context, now);
  expect(page.offers?.quotes).toEqual([]);
  expect(page.offers?.pendingDelivery[0]).toMatchObject({ price: { amount: '20.123456', currency: 'USD' }, comparisonGroup: null, delivery: { state: 'UNKNOWN' }, purchasePath: null });
  expect(page.offers?.bestByGroup).toEqual({});
});
it('never projects offers if the product has been withdrawn from its final published read', async () => {
  const db = database(); db.product.findFirst.mockResolvedValue(null as never);
  const page = await createPublicQueries(db as never).getProductOffers('p', context, now);
  expect(page).toMatchObject({ product: null, total: 0, legacyPrice: null }); expect(page.offers?.quotes).toEqual([]); expect(page.offers?.pendingDelivery).toEqual([]); expect(resolver).not.toHaveBeenCalled();
});
