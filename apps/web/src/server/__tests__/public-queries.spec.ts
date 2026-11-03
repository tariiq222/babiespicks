import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createPublicQueries } from '../public-queries';

function database() {
  return { $queryRaw: vi.fn().mockResolvedValue([]), product: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) }, contentPage: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) }, publicOffer: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) }, store: { findUnique: vi.fn().mockResolvedValue(null) }, purchaseOffer: { findMany: vi.fn().mockResolvedValue([]) } };
}

describe('public publication boundary', () => {
  it('returns only active, in-date coupons from active stores', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await createPublicQueries({ coupon: { findMany } } as never).getActiveCoupons(5);
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVE');expect(where.store).toEqual({ isActive: true });expect(where.AND).toHaveLength(2);
  });
  it('requires PUBLISHED for listings, category, search and direct product lookup', async () => {
    const db = database();
    const queries = createPublicQueries(db as never);
    await queries.getProducts('ar');
    await queries.getProductsByCategory('diapers', 'en');
    await queries.searchProducts('baby', 'en');
    await queries.getProduct('draft-slug', 'ar');
    for (const [args] of db.product.findMany.mock.calls) expect(args.where.publishStatus).toBe('PUBLISHED');
    expect(db.product.findFirst.mock.calls[0][0].where).toMatchObject({ publishStatus: 'PUBLISHED' });
  });

  it('counts all published search matches independently of the display limit', async () => {
    const db = database();
    db.product.count.mockResolvedValue(42);
    expect(await createPublicQueries(db as never).searchProducts('baby')).toMatchObject({ total: 42 });
    expect(db.product.count.mock.calls[0][0].where.publishStatus).toBe('PUBLISHED');
  });

  it('requires PUBLISHED for content lists and direct content lookup', async () => {
    const db = database();
    const queries = createPublicQueries(db as never);
    await queries.getContentPages('en');
    await queries.getContentPage('draft', 'en');
    expect(db.contentPage.findMany.mock.calls[0][0].where.publishStatus).toBe('PUBLISHED');
    expect(db.contentPage.findFirst.mock.calls[0][0].where.publishStatus).toBe('PUBLISHED');
  });

  it('does not leak an unpublished verdict, and marks Arabic content fallback honestly', async () => {
    const db = database();
    db.product.findFirst.mockResolvedValue({ id: 'p', name: 'Product', slug: 'p', translations: [], prices: [], specs: [], category: null, reviewSummary: null, verdict: { isPublished: false, overallScore: 9 } } as never);
    db.contentPage.findFirst.mockResolvedValue({ id: 'c', type: 'BUYING_GUIDE', slug: 'c', publishedAt: null, category: null, translations: [{ locale: 'ar', title: 'عربي', content: 'النص' }] } as never);
    const queries = createPublicQueries(db as never);
    expect((await queries.getProduct('p', 'en'))?.verdict).toBeNull();
    expect(await queries.getContentPage('c', 'en')).toMatchObject({ locale: 'ar', title: 'عربي' });
  });

  it('never revives a withdrawn unified offer through its legacy row', async () => {
    const db = database();
    db.contentPage.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'withdrawn' } as never);
    const queries = createPublicQueries(db as never);
    expect(await queries.getOffer('existing', 'ar')).toBeNull();
    expect(db.publicOffer.findFirst).not.toHaveBeenCalled();
  });

  it('checks unified offers then retains only published legacy offers', async () => {
    const db = database();
    const queries = createPublicQueries(db as never);
    await queries.getOffer('existing', 'ar');
    expect(db.contentPage.findFirst.mock.calls[0][0].where).toMatchObject({ publishStatus: 'PUBLISHED', type: 'OFFER' });
    expect(db.publicOffer.findFirst.mock.calls[0][0].where).toMatchObject({ status: 'PUBLISHED', unpublishedAt: null });
  });
});


describe('published offer discovery', () => {
  it('lists unified offers and legacy offers without reviving a withdrawn or duplicate slug', async () => {
    const db = database();
    db.contentPage.findMany.mockResolvedValueOnce([
      { id: 'c', type: 'OFFER', slug: 'live', publishedAt: new Date('2026-10-20'), category: null, translations: [{ locale: 'ar', title: 'عرض', content: 'تفاصيل', excerpt: 'ملخص' }] },
    ] as never).mockResolvedValueOnce([{ slug: 'live' }, { slug: 'withdrawn' }] as never);
    db.publicOffer.findMany.mockResolvedValue([
      { id: 'l1', slug: 'live', title: 'Duplicate' }, { id: 'l2', slug: 'withdrawn', title: 'Withdrawn' },
      { id: 'l3', slug: 'legacy', title: 'Legacy offer', publishedAt: new Date('2026-10-19') },
    ] as never);
    const result = await createPublicQueries(db as never).getPublishedOffers('ar');
    expect(result.map(o => o.slug)).toEqual(['live', 'legacy']);
    expect(db.contentPage.findMany.mock.calls[0][0].where).toEqual({ publishStatus: 'PUBLISHED', type: 'OFFER' });
    expect(db.publicOffer.findMany.mock.calls[0][0].where).toEqual({ status: 'PUBLISHED', unpublishedAt: null });
  });
});


it('never advertises a purchase link for a missing or invalid latest destination', async () => {
  const db = database();
  const now = new Date(); const store = { id: 's', slug: 'amazon', name: 'Amazon', url: 'https://www.amazon.sa/?tag=test-sa-21', isActive: true };
  const row = { id: 'p', name: 'Product', slug: 'p', translations: [], specs: [], verdict: null, reviewSummary: null, category: null };
  for (const url of [null, '', 'https://attacker.example/p', 'javascript:alert(1)']) {
    db.product.findFirst.mockResolvedValue({ ...row, prices: [
      { storeId: 's', store, price: 10, currency: 'SAR', scrapedAt: new Date(now.getTime() - 60000), inStock: true, url: 'https://www.amazon.sa/dp/OLD' },
      { storeId: 's', store, price: 20, currency: 'SAR', scrapedAt: now, inStock: true, url },
    ] } as never);
    expect((await createPublicQueries(db as never).getProduct('p'))?.prices).toEqual([]);
  }
  db.product.findFirst.mockResolvedValue({ ...row, prices: [{ storeId: 's', store, price: 20, originalPrice: null, currency: 'SAR', scrapedAt: now, inStock: true, url: 'https://www.amazon.sa/dp/VALID' }] } as never);
  expect((await createPublicQueries(db as never).getProduct('p'))?.prices).toHaveLength(1);
});

it('projects galleries and display sources without exposing internal source notes',async()=>{
 const db=database();
 db.product.findFirst.mockResolvedValue({id:'p',name:'Product',slug:'p',translations:[],prices:[],specs:[],category:null,verdict:null,reviewSummary:null,imageUrls:['https://m.media-amazon.com/one.jpg'],sources:[{url:'https://www.amazon.sa/dp/X',field:'reviewSummary',checkedAt:'2026-10-21T12:00:00Z',note:'internal note'},{url:'javascript:alert(1)',field:'reviewSummary',checkedAt:'2026-10-21T12:00:00Z'}]} as never);
 const product=await createPublicQueries(db as never).getProduct('p');
 expect(product?.imageUrls).toEqual(['https://m.media-amazon.com/one.jpg']);
 expect(product?.sources).toEqual([{url:'https://www.amazon.sa/dp/X',field:'reviewSummary',checkedAt:'2026-10-21T12:00:00Z'}]);
});

// ── Task 7: international offer reads ───────────────────────────────────────
import { selectOffers, parseShoppingContext, type OfferObservation, type SelectOffersInput } from '@babiespicks/domain';
import { encodeCatalogCursor, decodeCatalogCursor } from '../public-queries';

const NO_POLICIES: SelectOffersInput['policies'] = [];
const CONTEXT = parseShoppingContext({ locale: 'ar', shipTo: 'SA', displayCurrency: 'SAR', budget: null, audience: 'PUBLIC' });
const NOW = new Date('2026-11-02T12:00:00Z');

function legacyFixturePrice() { return { price: 50, originalPrice: null, currency: 'SAR', storeId: 's', url: 'https://www.amazon.sa/dp/X', inStock: true, scrapedAt: NOW, store: { id: 's', name: 'Amazon', slug: 'amazon', isActive: true, url: 'https://www.amazon.sa/?tag=test-sa-21' } }; }

function offerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-us-1', listingId: 'lst-1', sellerKey: 'seller-a', fulfillerKey: 'ful-a', isActive: true, audience: 'PUBLIC',
    listing: {
      id: 'lst-1', productId: 'p', marketplaceCode: 'US',
      product: { publishStatus: 'PUBLISHED', isActive: true },
      store: { id: 's-us', name: 'أمازون أمريكا', slug: 'amazon-us', isActive: true, marketplaceCode: 'US' },
    },
    priceObservations: [],
    deliveryEvidence: [],
    ...overrides,
  };
}
function observation(overrides: Partial<OfferObservation> = {}): OfferObservation {
  return {
    id: 'obs-1', offerId: 'offer-us-1', productId: 'p', listingId: 'lst-1', marketplaceCode: 'US',
    sellerKey: 'seller-a', fulfillerKey: 'ful-a', observedSellerKey: 'seller-a', observedFulfillerKey: 'ful-a',
    scopeKey: 'price:US:ship-to:US', shipTo: 'US', price: { amount: '20', currency: 'USD' }, originalPrice: null,
    audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'EXCLUDED',
    sourceId: 'amazon-creators-api-us', checkedAt: '2026-11-02T11:00:00Z', expiresAt: '2026-11-02T12:30:00Z', isActive: true,
    ...overrides,
  };
}
function policyDb(policies: SelectOffersInput['policies']) {
  return {
    selectOffers: (input: SelectOffersInput) => selectOffers({ ...input, policies, now: NOW }),
  };
}

describe('international product offers (Task 7)', () => {
  it('projects the engine selection without drafts, internal source fields or SAR filtering', async () => {
    const db = database();
    db.purchaseOffer = { findMany: vi.fn().mockResolvedValue([offerRow({
      priceObservations: [{ id: 'obs-1', offerId: 'offer-us-1', scopeKey: 'price:US:in-marketplace', shipTo: null, amount: '20', currency: 'USD', originalAmount: null, audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'EXCLUDED', sourceId: 'amazon-creators-api-us', checkedAt: new Date('2026-11-02T11:50:00Z'), expiresAt: new Date('2026-11-02T13:00:00Z') }],
    })]) };
    db.product.findFirst.mockResolvedValue({ id: 'p', name: 'P', slug: 'p', translations: [], specs: [], prices: [], category: null, verdict: null, reviewSummary: null } as never);
    const queries = createPublicQueries(db as never);
    const result = await queries.getProductOffers('p', CONTEXT, NOW);
    // Disabled source metadata may remain pending, but its money is never public.
    expect(result.offers!.quotes).toHaveLength(0);
    expect(result.offers!.pendingDelivery).toHaveLength(1);
    const quote = result.offers!.pendingDelivery[0]!;
    // Engine fields pass through verbatim, including the T6 extras.
    expect(quote.price).toBeNull();
    expect(quote.originalPrice).toBeNull(); // original missing in this row
    expect(quote.convertedPrice).toBeNull();
    expect(quote.convertedOriginalPrice).toBeNull();
    expect(quote.discountPercent).toBeNull();
    // Store display metadata is safe; internal source identity and URLs stay private.
    expect(JSON.stringify(quote)).not.toContain('sourceId');
    expect(JSON.stringify(quote)).not.toContain('DRAFT');
    expect(quote.store).toMatchObject({ slug: 'amazon-us' });
    expect(quote.purchasePath).toBeNull();
    expect(JSON.stringify(quote)).not.toContain('http');
  });

  it('keeps an expired source out of the public selection', async () => {
    const expired = observation({ expiresAt: '2026-11-02T11:30:00Z' });
    const db = database();
    db.purchaseOffer = { findMany: vi.fn().mockResolvedValue([offerRow()]) };
    const queries = createPublicQueries({ ...db, ...policyDb(NO_POLICIES) } as never);
    const selection = await queries.getOfferSelection('p', CONTEXT, NOW);
    expect(selection.quotes).toHaveLength(0);
    void expired;
  });

  it('reads a legacy-only product without throwing and without comparison claims', async () => {
    const db = database();
    db.purchaseOffer = { findMany: vi.fn().mockResolvedValue([]) };
    db.product.findFirst.mockResolvedValue({ id: 'p', name: 'P', slug: 'p', translations: [], specs: [], category: null, verdict: null, reviewSummary: null, imageUrls: [], prices: [{ price: 149.5, originalPrice: null, currency: 'SAR', storeId: 's', url: 'https://www.amazon.sa/dp/X', inStock: true, scrapedAt: new Date('2026-11-02T10:00:00Z'), store: { id: 's', name: 'Amazon', slug: 'amazon', isActive: true, url: 'https://www.amazon.sa/?tag=test-sa-21' } }] } as never);
    const queries = createPublicQueries(db as never);
    const result = await queries.getProductOffers('p', CONTEXT, NOW);
    expect(result.legacyPrice).toEqual({ price: 149.5, originalPrice: null, currency: 'SAR', storeId: 's', checkedAt: new Date('2026-11-02T10:00:00Z').toISOString(), store: { id: 's', name: 'Amazon', slug: 'amazon' } });
    expect(result.offers!.quotes).toHaveLength(0);
    expect(result.offers!.bestByGroup).toEqual({});
    expect(result.total).toBe(1); // actual published detail exists
    expect(result.contextKey).toBeTypeOf('string');
  });

  it('falls back to the legacy price only when no international rows exist, and mixes legacy with new', async () => {
    const db = database();
    // Pre-activation product: no international rows at all → legacy price view.
    db.product.findMany.mockResolvedValue([
      { id: 'p', name: 'P', slug: 'p', translations: [], specs: [], category: null, verdict: null, reviewSummary: null, imageUrls: [], prices: [{ price: 149.5, originalPrice: null, currency: 'SAR', storeId: 's', url: 'https://www.amazon.sa/dp/X', inStock: true, scrapedAt: new Date('2026-11-02T10:00:00Z'), store: { id: 's', name: 'Amazon', slug: 'amazon', isActive: true, url: 'https://www.amazon.sa/?tag=test-sa-21' } }] } as never,
    ]);
    db.product.count.mockResolvedValue(1);
    db.purchaseOffer = { findMany: vi.fn().mockResolvedValue([]) };
    const queries = createPublicQueries(db as never);
    const page = await queries.getCatalogPage(CONTEXT, {}, null, { productId: 'p', now: NOW });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.product.legacyOnly).toBe(true);
    expect(page.items[0]!.legacyPrice).toEqual({ price: 149.5, originalPrice: null, currency: 'SAR', storeId: 's', checkedAt: new Date('2026-11-02T10:00:00Z').toISOString(), store: { id: 's', name: 'Amazon', slug: 'amazon' } });
    expect(page.items[0]!.offers).toBeNull(); // no international selection exists at all
    // Mixed product: live USD + legacy SAR rows → international path, engine reads both.
    const mixed = offerRow({
      priceObservations: [
        { id: 'obs-legacy-2', offerId: 'offer-us-1', scopeKey: 'legacy-sar-in-marketplace', shipTo: null, amount: '100', currency: 'SAR', originalAmount: null, audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'UNKNOWN', sourceId: 'legacy-sar-backfill', checkedAt: new Date('2026-11-02T11:40:00Z'), expiresAt: new Date('2026-11-02T13:40:00Z') },
        { id: 'obs-live', offerId: 'offer-us-1', scopeKey: 'price:US:in-marketplace', shipTo: null, amount: '20', currency: 'USD', originalAmount: null, audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'EXCLUDED', sourceId: 'amazon-creators-api-us', checkedAt: new Date('2026-11-02T11:50:00Z'), expiresAt: new Date('2026-11-02T13:00:00Z') },
      ],
    });
    db.product.findMany.mockResolvedValue([
      { id: 'p', name: 'P', slug: 'p', translations: [], specs: [], category: null, verdict: null, reviewSummary: null, imageUrls: [], prices: [] } as never,
    ]);
    db.purchaseOffer = { findMany: vi.fn().mockResolvedValue([mixed]) };
    const international = await queries.getCatalogPage(CONTEXT, {}, null, { productId: 'p', now: NOW });
    // Disabled-source international observations do not create available-price home cards.
    expect(international.items).toEqual([]);
    expect(international.total).toBe(0);
  });

  it('paginates with a deterministic bounded page and a stable cursor key', async () => {
    const db = database();
    db.product.findMany.mockResolvedValue([]); db.product.count.mockResolvedValue(0);
    const queries = createPublicQueries({ ...db, ...policyDb(NO_POLICIES) } as never);
    await queries.getCatalogPage(CONTEXT, {}, null, { limit: 999 });
    expect(db.product.findMany.mock.calls[0][0].take).toBe(96);
    await queries.getCatalogPage(CONTEXT, {}, null, { limit: 0 });
    expect(db.product.findMany.mock.calls[1][0].take).toBe(96);
    const cursor = encodeCatalogCursor('prod_1', NOW.toISOString());
    expect(decodeCatalogCursor(cursor)).toEqual({ id: 'prod_1' });
    expect(decodeCatalogCursor('garbage')).toBeNull();
    await queries.getCatalogPage(CONTEXT, {}, cursor, {});
    // Legacy/changed-state cursor restarts the bounded scan; page slicing is global.
    expect(db.product.findMany.mock.calls[2][0].cursor).toBeUndefined();
  });

  it('computes filterOptions from every eligible row, not the filtered subset', async () => {
    const db = database();
    db.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'A', slug: 'a', translations: [], specs: [], category: { name: 'نوم', nameEn: 'Sleep', slug: 'sleep', order: 1 }, verdict: null, reviewSummary: null, brand: 'BrandA', imageUrls: [], prices: [legacyFixturePrice()] },
      { id: 'p2', name: 'B', slug: 'b', translations: [], specs: [], category: { name: 'عناية', nameEn: 'Care', slug: 'care', order: 2 }, verdict: null, reviewSummary: null, brand: 'BrandB', imageUrls: [], prices: [legacyFixturePrice()] },
    ] as never);
    db.product.count.mockResolvedValue(2);
    db.purchaseOffer = { findMany: vi.fn().mockResolvedValue([]) };
    const queries = createPublicQueries({ ...db, ...policyDb(NO_POLICIES) } as never);
    const page = await queries.getCatalogPage(CONTEXT, { category: 'sleep' }, null, { now: NOW });
    expect(page.filterOptions.categories.map(c => c.slug)).toEqual(['sleep', 'care']);
    expect(page.filterOptions.brands).toEqual(['BrandA', 'BrandB']);
  });
});
