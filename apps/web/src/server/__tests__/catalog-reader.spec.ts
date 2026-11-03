import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createPublicQueries } from '../public-queries';
import { parseShoppingContext } from '@babiespicks/domain';
const now = new Date('2026-11-03T12:00:00Z');
const context = parseShoppingContext({ locale: 'en', shipTo: 'SA', displayCurrency: 'SAR', audience: 'PUBLIC' });
function row(index: number) {
  const id = `p${String(index).padStart(3, '0')}`;
  return { id, name: `Baby ${index}`, slug: id, isActive: true, createdAt: new Date(now.getTime() - index * 1000), translations: [], specs: [], sources: [] as Array<{ field: string; url: string; checkedAt: string }>, imageUrls: [], verdict: index === 29 ? { isPublished: true, type: 'WORTH_IT' } : null, reviewSummary: null as { averageRating: number; totalReviews: number } | null,
    category: { slug: index >= 24 ? 'care' : 'sleep', name: index >= 24 ? 'عناية' : 'نوم', nameEn: index >= 24 ? 'Care' : 'Sleep', order: index >= 24 ? 2 : 1 }, brand: index >= 24 ? 'Later' : 'First',
    prices: [{ id: `price${index}`, storeId: 's', price: 10 + index * 10, originalPrice: index === 29 ? 500 : null, currency: 'SAR', url: 'https://www.amazon.sa/dp/X', inStock: true, scrapedAt: now, store: { id: 's', name: 'Amazon', slug: 'amazon', isActive: true, url: 'https://www.amazon.sa/?tag=test-sa-21' } }],
  };
}
function database(rows = Array.from({ length: 30 }, (_, i) => row(i))) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    product: {
      count: vi.fn().mockResolvedValue(rows.length),
      findFirst: vi.fn(async () => rows[0] ?? null),
      findMany: vi.fn(async (args: { where?: { id?: string | { in?: string[]; gt?: string } }; cursor?: { id: string }; skip?: number; take?: number }) => {
        let found = rows;
        if (typeof args.where?.id === 'string') found = found.filter(r => r.id === args.where!.id);
        else if (args.where?.id?.in) found = found.filter(r => (args.where!.id as { in: string[] }).in.includes(r.id));
        if (args.cursor) found = found.slice(found.findIndex(r => r.id === args.cursor!.id) + (args.skip ?? 0));
        return found.slice(0, args.take ?? found.length);
      }),
    },
    purchaseOffer: { findMany: vi.fn().mockResolvedValue([]) },
  };
}
describe('catalog reader global decision boundary', () => {
  it('keeps facets beyond page 24, exact totals and a truly final cursor', async () => {
    const db = database(); const queries = createPublicQueries(db as never);
    const first = await queries.getCatalogPage(context, {}, null, { now });
    expect(first.items).toHaveLength(24);
    expect(first.filterOptions.brands).toEqual(['First', 'Later']);
    expect(first.filterOptions.categories.map(c => c.slug)).toEqual(['sleep', 'care']);
    expect(first.total).toBe(30); expect(first.nextCursor).toBeTruthy();
    const last = await queries.getCatalogPage(context, {}, first.nextCursor, { now });
    expect(last.items.map(i => i.product.id)).toEqual(Array.from({ length: 6 }, (_, i) => row(i + 24).id));
    expect(last.nextCursor).toBeNull(); expect(last.total).toBe(30);
  });
  it('applies category, brand, discount, verdict and exact budget before slicing without collapsing facets', async () => {
    const queries = createPublicQueries(database() as never);
    const filtered = await queries.getCatalogPage(context, { category: 'care', brand: 'Later', discount: true, worth: true } as never, null, { now, limit: 1 });
    expect(filtered.items.map(i => i.product.id)).toEqual(['p029']); expect(filtered.total).toBe(1); expect(filtered.nextCursor).toBeNull();
    expect(filtered.filterOptions.brands).toEqual(['First', 'Later']);
    const budget = await queries.getCatalogPage({ ...context, budget: { amount: '30', currency: 'SAR' } }, {}, null, { now, limit: 1 });
    expect(budget.total).toBe(3); expect(budget.items).toHaveLength(1);
    const foreign = await queries.getCatalogPage({ ...context, budget: { amount: '10000', currency: 'USD' } }, {}, null, { now });
    expect(foreign.items).toEqual([]);
  });
  it('applies search, sourced ratings and price bands before pagination and resets changed-state cursors', async () => {
    const rows = [row(0), { ...row(29), name: 'Needle', sources: [{ field: 'reviewSummary', url: 'https://www.amazon.sa/dp/X', checkedAt: now.toISOString() }], reviewSummary: { averageRating: 4.5, totalReviews: 7 } }];
    const queries = createPublicQueries(database(rows) as never);
    const first = await queries.getCatalogPage(context, {}, null, { now, limit: 1 });
    const filtered = await queries.getCatalogPage(context, { q: 'Needle', rated: true, price: '300-1000' } as never, first.nextCursor, { now, limit: 1 });
    expect(filtered.items.map(i => i.product.id)).toEqual(['p029']); expect(filtered.total).toBe(1);
    const changed = await queries.getCatalogPage({ ...context, displayCurrency: 'USD' }, {}, first.nextCursor, { now, limit: 1 });
    expect(changed.items[0]!.product.id).toBe('p000'); expect(changed.items[0]!.legacyPrice?.currency).toBe('SAR');
  });
  it('keeps all valid legacy stores on detail and does not revive them behind unavailable international rows', async () => {
    const product = row(0); product.prices.push({ ...product.prices[0]!, id: 'other', storeId: 's2', price: 20, store: { ...product.prices[0]!.store, id: 's2' } });
    const db = database([product]); const queries = createPublicQueries(db as never);
    expect((await queries.getProductOffers(product.id, context, now)).product?.prices).toHaveLength(2);
    db.purchaseOffer.findMany.mockResolvedValue([{ id: 'offer', listingId: 'listing', isActive: true, sellerKey: 'seller', fulfillerKey: 'fulfiller', listing: { id: 'listing', productId: product.id, marketplaceCode: 'US', product: { publishStatus: 'PUBLISHED', isActive: true }, store: { id: 'foreign', name: 'Amazon US', slug: 'amazon-us', isActive: true, marketplaceCode: 'US' } }, priceObservations: [{ id: 'unavailable', offerId: 'offer', scopeKey: 'default', shipTo: null, amount: null, currency: 'USD', originalAmount: null, audience: 'PUBLIC', availability: 'UNAVAILABLE', taxBasis: 'EXCLUDED', sourceId: 'amazon-creators-api-us', checkedAt: now, expiresAt: new Date(now.getTime() - 1) }], deliveryEvidence: [] }] as never);
    const page = await queries.getProductOffers(product.id, context, now);
    expect(page.legacyPrice).toBeNull(); expect(page.product?.prices).toEqual([]);
  });
  it('hides money, comparisons and purchase links from disabled source pending metadata', async () => {
    const product = row(0); const db = database([product]);
    db.purchaseOffer.findMany.mockResolvedValue([{ id: 'offer', listingId: 'listing', isActive: true, sellerKey: 'seller', fulfillerKey: 'fulfiller', listing: { id: 'listing', productId: product.id, marketplaceCode: 'US', product: { publishStatus: 'PUBLISHED', isActive: true }, store: { id: 'foreign', name: 'Amazon US', slug: 'amazon-us', isActive: true, marketplaceCode: 'US' } }, priceObservations: [{ id: 'obs', offerId: 'offer', scopeKey: 'default', shipTo: null, amount: '20', currency: 'USD', originalAmount: '30', audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'EXCLUDED', sourceId: 'amazon-creators-api-us', checkedAt: now, expiresAt: new Date(now.getTime() + 60000) }], deliveryEvidence: [] }] as never);
    const page = await createPublicQueries(db as never).getProductOffers(product.id, context, now);
    const quote = page.offers?.pendingDelivery[0];
    expect(quote).toMatchObject({ price: null, originalPrice: null, convertedPrice: null, convertedOriginalPrice: null, discountPercent: null, comparisonGroup: null, fxSnapshotId: null, purchasePath: null });
    expect(page.product?.prices).toEqual([]);
  });
});

import { createCatalogCollector } from '../catalog-reader';
import type { CatalogPageItem, OfferQuoteView } from '../../shared/lib/api';
function internationalItem(id: string, currency = 'USD', amount = '20', group: string | null = 'US:EXCLUDED:USD'): CatalogPageItem {
  const quote: OfferQuoteView = { offerId: id, observationId: `obs-${id}`, listingId: 'listing', productId: id, marketplaceCode: 'US', sellerKey: 'seller', fulfillerKey: 'fulfiller', price: { amount, currency }, originalPrice: null, convertedPrice: null, convertedOriginalPrice: null, discountPercent: null, fxSnapshotId: null, taxBasis: 'EXCLUDED', checkedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60000).toISOString(), audience: 'PUBLIC', delivery: { state: 'OBSERVED_AVAILABLE', country: 'US', precision: 'COUNTRY', checkedAt: now.toISOString() }, comparisonGroup: group };
  return { product: { ...row(0), id, legacyOnly: false, prices: [] } as unknown as CatalogPageItem['product'], offers: { quotes: [quote], pendingDelivery: [], bestByGroup: group ? { [group]: id } : {}, reason: 'OK', contextKey: '', fxSnapshotId: null }, legacyPrice: null };
}
it('matches a budget against original money even when a different display conversion exists', () => {
  const collector = createCatalogCollector({ ...context, budget: { amount: '25', currency: 'USD' } }, {}, null, 24, now);
  const item = internationalItem('us'); item.offers!.quotes[0]!.convertedPrice = { amount: '75', currency: 'SAR' };
  collector.add(item, now.toISOString());
  expect(collector.finish().total).toBe(1);
});
it('keeps neutral bands in their single observed currency and hides ambiguous mixed-unit bands', () => {
  const neutral = { ...context, displayCurrency: null };
  const single = createCatalogCollector(neutral, {}, null, 24, now);
  single.add(internationalItem('us'), now.toISOString());
  expect(single.finish()).toMatchObject({ priceCurrency: 'USD', total: 1 }); expect(single.finish().filterOptions.bands).toHaveLength(1);
  const mixed = createCatalogCollector(neutral, { price: 'under-100' }, null, 24, now);
  mixed.add(internationalItem('us'), now.toISOString()); mixed.add(internationalItem('sa', 'SAR', '40', 'SA:INCLUDED:SAR'), now.toISOString());
  expect(mixed.finish()).toMatchObject({ priceCurrency: null, items: [], total: 0, nextCursor: null }); expect(mixed.finish().filterOptions.bands).toEqual([]);
});
it('keeps price ordering within compatible tax/currency groups', () => {
  const collector = createCatalogCollector(context, { sort: 'price' }, null, 24, now);
  for (const item of [internationalItem('usd-cheap', 'USD', '1', 'B:USD:EXCLUDED'), internationalItem('sar-high', 'SAR', '100', 'A:SAR:INCLUDED'), internationalItem('sar-low', 'SAR', '10', 'A:SAR:INCLUDED')]) collector.add(item, now.toISOString());
  expect(collector.finish().items.map(i => i.product.id)).toEqual(['sar-low', 'sar-high', 'usd-cheap']);
});
it('scans beyond the bounded retrieval batch and produces every matching page once', async () => {
  const rows = Array.from({ length: 193 }, (_, i) => row(i)); const db = database(rows); const queries = createPublicQueries(db as never);
  const seen: string[] = []; let cursor: string | null = null;
  do {
    const page = await queries.getCatalogPage(context, { sort: 'price' }, cursor, { limit: 48, now });
    expect(page.total).toBe(193); seen.push(...page.items.map(i => i.product.id)); cursor = page.nextCursor;
  } while (cursor);
  expect(seen).toEqual(rows.map(r => r.id));
  for (const [args] of db.product.findMany.mock.calls) expect(args.take).toBeLessThanOrEqual(96);
});
it('keeps metadata-only and disabled-source products out of home items, facets and totals', async () => {
  const unpriced = row(0); unpriced.prices = [];
  const queries = createPublicQueries(database([unpriced]) as never);
  const page = await queries.getCatalogPage(context, {}, null, { now });
  expect(page.items).toEqual([]); expect(page.total).toBe(0); expect(page.filterOptions.brands).toEqual([]);
  const collector = createCatalogCollector(context, {}, null, 24, now);
  const disabled = internationalItem('disabled'); disabled.offers!.quotes[0]!.price = null;
  collector.add(disabled, now.toISOString());
  expect(collector.finish()).toMatchObject({ items: [], total: 0 }); expect(collector.finish().filterOptions.categories).toEqual([]);
});
it('restarts a malformed edited cursor instead of passing non-string sort money into arithmetic', () => {
  const filters = { sort: 'price' };
  const items = [internationalItem('first', 'USD', '10'), internationalItem('second', 'USD', '20')];
  const first = createCatalogCollector(context, filters, null, 1, now);
  for (const item of items) first.add(item, now.toISOString());
  const decoded = JSON.parse(Buffer.from(first.finish().nextCursor!, 'base64url').toString('utf8'));
  const mutations: Array<[string, unknown]> = [['amount', 1], ['discount', 2], ['id', 3], ['group', {}], ['createdAt', []], ['createdAt', 'not-a-date'], ['group', '']];
  for (const [field, value] of mutations) {
    const edited = { ...decoded, position: { ...decoded.position, [field]: value } };
    const collector = createCatalogCollector(context, filters, Buffer.from(JSON.stringify(edited)).toString('base64url'), 1, now);
    expect(() => { for (const item of items) collector.add(item, now.toISOString()); }).not.toThrow();
    expect(collector.finish().items[0]?.product.id).toBe('first');
  }
});
it('keeps legacy SAR for empty prepared offer metadata but suppresses it once inactive historical evidence exists', async () => {
  const product = row(0); const db = database([product]);
  const offer = { id: 'prepared', listingId: 'listing', isActive: false, sellerKey: 'seller', fulfillerKey: 'fulfiller', listing: { id: 'listing', productId: product.id, marketplaceCode: 'SA', product: { publishStatus: 'PUBLISHED', isActive: true }, store: { id: 's', name: 'Amazon', slug: 'amazon', isActive: true, marketplaceCode: 'SA' } }, priceObservations: [] as Array<Record<string, unknown>>, deliveryEvidence: [] };
  db.purchaseOffer.findMany.mockResolvedValue([offer] as never);
  const queries = createPublicQueries(db as never);
  const detail = await queries.getProductOffers(product.id, context, now);
  expect(detail.legacyPrice).toMatchObject({ price: 10, currency: 'SAR' }); expect(detail.product?.legacyOnly).toBe(true); expect(detail.product?.prices).toHaveLength(1);
  const catalog = await queries.getCatalogPage(context, {}, null, { now });
  expect(catalog.total).toBe(1); expect(catalog.items[0]?.legacyPrice?.currency).toBe('SAR');
  offer.priceObservations.push({ id: 'expired-unavailable', offerId: offer.id, scopeKey: 'default', shipTo: null, amount: null, currency: 'SAR', originalAmount: null, audience: 'PUBLIC', availability: 'UNAVAILABLE', taxBasis: 'INCLUDED', sourceId: 'amazon-creators-api-sa', checkedAt: new Date(now.getTime() - 120000), expiresAt: new Date(now.getTime() - 60000) });
  const historicDetail = await queries.getProductOffers(product.id, context, now);
  expect(historicDetail.legacyPrice).toBeNull(); expect(historicDetail.product?.legacyOnly).toBe(false); expect(historicDetail.product?.prices).toEqual([]);
  const historicCatalog = await queries.getCatalogPage(context, {}, null, { now });
  expect(historicCatalog).toMatchObject({ total: 0, items: [] });
});
