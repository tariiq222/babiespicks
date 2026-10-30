import { describe, expect, it } from 'vitest';
import { applyCatalogFilters, getFilterOptions, parseCatalogFilters } from '../../shared/lib/catalog-filters';
const review = { url: 'https://www.amazon.sa/dp/X', field: 'reviewSummary', checkedAt: '2026-10-21T12:00:00Z' };
const product = (id: string, price: number, extra: object = {}) => ({ id, brand: 'A', prices: [{ price, originalPrice: null, currency: 'SAR', storeId: 's', store: null }], category: null, verdict: null, reviewSummary: null, sources: [], ...extra }) as never;
const cheap = product('cheap', 50, { brand: 'B', category: { name: 'نوم', nameEn: 'Sleep', slug: 'sleep', order: 2 } });
const sale = product('sale', 200, { prices: [{ price: 200, originalPrice: 400, currency: 'SAR', storeId: 's', store: null }], category: { name: 'عناية', nameEn: null, slug: 'care', order: 1 } });
const rated = product('rated', 500, { sources: [review], reviewSummary: { averageRating: 4.5, totalReviews: 10 }, verdict: { type: 'WAIT' } });
const unsourced = product('unsourced', 1500, { reviewSummary: { averageRating: 5, totalReviews: 10 }, verdict: { type: 'WORTH_IT_WITH' } });
const all = [cheap, sale, rated, unsourced];
const ids = (input: Record<string, unknown>) => (applyCatalogFilters(all, parseCatalogFilters(input)) as { id: string }[]).map(p => p.id);
describe('catalog filters', () => {
  it('filters on real values and never counts unknown values as a match', () => {
    expect(ids({ category: 'sleep' })).toEqual(['cheap']);
    expect(ids({ brand: 'B' })).toEqual(['cheap']);
    expect(ids({ price: '100-300' })).toEqual(['sale']);
    expect(ids({ discount: '1' })).toEqual(['sale']);
    expect(ids({ rated: '1' })).toEqual(['rated']);
    expect(ids({ worth: '1' })).toEqual(['unsourced']);
    expect(ids({ category: 'sleep', discount: '1' })).toEqual([]);
  });
  it('sorts and ignores unsupported values', () => {
    expect(ids({ sort: 'price' })).toEqual(['cheap', 'sale', 'rated', 'unsourced']);
    expect(ids({ sort: 'discount' })[0]).toBe('sale');
    expect(parseCatalogFilters({ price: 'x', sort: 'y', discount: 'true', category: ['a'] })).toMatchObject({ price: '', sort: '', discount: false, category: '' });
  });
  it('offers only categories labelled for the locale, in owner order', () => {
    expect(getFilterOptions(all, 'ar').categories.map(c => c.slug)).toEqual(['care', 'sleep']);
    expect(getFilterOptions(all, 'en').categories.map(c => c.slug)).toEqual(['sleep']);
  });
});
