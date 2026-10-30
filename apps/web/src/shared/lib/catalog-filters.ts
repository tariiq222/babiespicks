import { getAmazonReviewSource } from './product-details';
import type { Product } from './api';

export const PRICE_BANDS = [
  { id: 'under-100', min: 0, max: 100, ar: 'أقل من 100', en: 'Under 100' },
  { id: '100-300', min: 100, max: 300, ar: '100 إلى 300', en: '100 to 300' },
  { id: '300-1000', min: 300, max: 1000, ar: '300 إلى 1000', en: '300 to 1000' },
  { id: 'over-1000', min: 1000, max: Infinity, ar: 'أكثر من 1000', en: 'Over 1000' },
] as const;

export interface CatalogFilters { category: string; brand: string; price: string; discount: boolean; rated: boolean; worth: boolean; sort: string }

const text = (value: unknown, limit = 200) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export function parseCatalogFilters(input: Record<string, unknown>): CatalogFilters {
  const price = text(input.price); const sort = text(input.sort);
  return { category: text(input.category), brand: text(input.brand), price: PRICE_BANDS.some(band => band.id === price) ? price : '', discount: input.discount === '1', rated: input.rated === '1', worth: input.worth === '1', sort: sort === 'price' || sort === 'discount' ? sort : '' };
}
export function getBestPrice(product: Product) { return [...product.prices].sort((a, b) => a.price - b.price)[0]; }
export function getDiscount(price?: Product['prices'][number]) { return price?.originalPrice && price.originalPrice > price.price ? Math.round((price.originalPrice - price.price) / price.originalPrice * 100) : 0; }
export function getCategoryLabel(category: Product['category'], locale: string) { return (locale === 'ar' ? category?.name : category?.nameEn) || null; }
export function getShopperRating(product: Product) { return getAmazonReviewSource(product.sources) && product.reviewSummary?.totalReviews ? product.reviewSummary : null; }

/** Unknown values never pass a filter: a product without a sourced rating is not "4+". */
export function applyCatalogFilters(products: Product[], filters: CatalogFilters) {
  const band = PRICE_BANDS.find(item => item.id === filters.price);
  const matching = products.filter(product => {
    const price = getBestPrice(product); if (!price) return false;
    return (!filters.category || product.category?.slug === filters.category)
      && (!filters.brand || product.brand?.trim() === filters.brand)
      && (!band || (price.price >= band.min && price.price < band.max))
      && (!filters.discount || getDiscount(price) > 0)
      && (!filters.rated || (getShopperRating(product)?.averageRating ?? 0) >= 4)
      && (!filters.worth || product.verdict?.type === 'WORTH_IT' || product.verdict?.type === 'WORTH_IT_WITH');
  });
  if (filters.sort === 'price') return [...matching].sort((a, b) => getBestPrice(a).price - getBestPrice(b).price);
  if (filters.sort === 'discount') return [...matching].sort((a, b) => getDiscount(getBestPrice(b)) - getDiscount(getBestPrice(a)));
  return matching;
}
export function getFilterOptions(products: Product[], locale: string) {
  const categories = new Map<string, { slug: string; label: string; order: number }>();
  for (const { category } of products) { const label = getCategoryLabel(category, locale); if (category && label) categories.set(category.slug, { slug: category.slug, label, order: category.order ?? 0 }); }
  return {
    categories: [...categories.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, locale)),
    brands: [...new Set(products.flatMap(product => product.brand?.trim() ? [product.brand.trim()] : []))].sort((a, b) => a.localeCompare(b, locale)),
    bands: PRICE_BANDS.filter(band => products.some(product => { const price = getBestPrice(product); return price && price.price >= band.min && price.price < band.max; })),
    hasDiscounts: products.some(product => getDiscount(getBestPrice(product)) > 0),
    hasRatings: products.some(product => (getShopperRating(product)?.averageRating ?? 0) >= 4),
    hasVerdicts: products.some(product => product.verdict?.type === 'WORTH_IT' || product.verdict?.type === 'WORTH_IT_WITH'),
  };
}
