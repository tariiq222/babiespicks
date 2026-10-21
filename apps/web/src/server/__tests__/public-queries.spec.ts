import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createPublicQueries } from '../public-queries';

function database() {
  return { product: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) }, contentPage: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) }, publicOffer: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) }, store: { findUnique: vi.fn().mockResolvedValue(null) } };
}

describe('public publication boundary', () => {
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
  const now = new Date(); const store = { id: 's', slug: 'amazon', name: 'Amazon', url: 'https://www.amazon.sa', isActive: true };
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
