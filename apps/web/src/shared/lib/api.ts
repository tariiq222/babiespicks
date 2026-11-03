// Client-safe display types and helpers. Database queries live in server/queries.ts.

/**
 * Server-projected international offer quote. Field-for-field the Task 6 engine's
 * SelectedOfferQuote, as JSON — including convertedOriginalPrice and discountPercent,
 * which the web never recomputes. discountPercent is null whenever either side is
 * missing or the currencies/tax bases differ; it is never written as 0.
 */
export interface OfferQuoteView {
  offerId: string;
  observationId: string;
  productId: string;
  marketplaceCode: string;
  listingId: string;
  sellerKey: string;
  fulfillerKey: string;
  /** Exact stored amount string; null when the source observed no price. */
  price: { amount: string; currency: string } | null;
  originalPrice: { amount: string; currency: string } | null;
  convertedPrice: { amount: string; currency: string } | null;
  convertedOriginalPrice: { amount: string; currency: string } | null;
  /** Engine-computed exact decimal percentage string, or null (never 0). */
  discountPercent: string | null;
  fxSnapshotId: string | null;
  taxBasis: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
  checkedAt: string;
  expiresAt: string;
  audience: 'PUBLIC' | 'MEMBERS';
  delivery: { state: 'OBSERVED_AVAILABLE' | 'OBSERVED_UNAVAILABLE' | 'UNKNOWN'; country: string | null; precision: string; checkedAt: string | null };
  comparisonGroup: string | null;
}

/** Task 6 engine output projected to JSON: quotes, pendingDelivery and bookkeeping. */
export interface OfferSelectionView {
  quotes: OfferQuoteView[];
  pendingDelivery: OfferQuoteView[];
  bestByGroup: Record<string, string>;
  reason: 'OK' | 'NO_ELIGIBLE_OFFER' | 'NO_COMPARABLE_PRICE';
  contextKey: string;
  fxSnapshotId: string | null;
}

/**
 * A legacy product's untouched SAR price. Carries the original amount only: no
 * comparison ratio, no bestByGroup, no delivery claim of any kind.
 */
export interface LegacyPriceView {
  price: number;
  originalPrice: number | null;
  currency: 'SAR';
  storeId: string;
  checkedAt: string;
  store: { id: string; name: string; slug: string } | null;
}

/** One eligible catalog row: international offers, or the legacy price fallback. */
export interface CatalogPageItem {
  product: Product & { legacyOnly: boolean };
  offers: OfferSelectionView | null;
  legacyPrice: LegacyPriceView | null;
}

export interface CatalogPageFilters {
  category?: string;
  /** Labelling locale for filter options; never a market or currency filter. */
  locale?: string;
}

export interface CatalogPage {
  items: CatalogPageItem[];
  /** Deterministic cursor key; null on the last page. */
  nextCursor: string | null;
  /** Total published eligible products matching the base where-clause. */
  total: number;
  /** Computed over every eligible row of the page, never the trimmed subset. */
  filterOptions: {
    categories: { slug: string; label: string; order: number }[];
    brands: string[];
    bands: Array<{ id: string; min: number; max: number; ar: string; en: string }>;
    hasDiscounts: boolean;
    hasRatings: boolean;
    hasVerdicts: boolean;
  };
}

/** One product's offer page: the T6 engine selection plus the legacy fallback, if any. */
export interface ProductOffersPage {
  /** The product view, when the caller needs it alongside the selection. */
  product: Product & { legacyOnly: boolean } | null;
  offers: OfferSelectionView | null;
  /** Untouched legacy SAR price; null for international products. */
  legacyPrice: LegacyPriceView | null;
  total: number;
  nextCursor: string | null;
  filterOptions: CatalogPage['filterOptions'];
  /** Engine context key so UI can detect context changes without recomputing. */
  contextKey: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  imageUrl: string | null;
  imageUrls?: string[];
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  sources?: {url:string;field:string;checkedAt:string}[];
  isActive: boolean;
  updatedAt?: string;
  translations: { locale: string; name: string; description: string | null; slug: string }[];
  verdict: {
    type: 'WORTH_IT' | 'WORTH_IT_WITH' | 'WAIT' | 'NOT_WORTH_IT';
    overallScore: number;
    safetyScore: number;
    qualityScore: number;
    reviewsScore: number;
    priceScore: number;
    longTermScore: number;
    reasoningAr: string;
    reasoningEn: string;
    conditionsAr: string[] | null;
    conditionsEn: string[] | null;
  } | null;
  prices: { price: number; originalPrice: number | null; currency: string; storeId: string; checkedAt?: string; store: { id: string; name: string; slug: string } | null }[];
  category: { name: string; nameEn?: string | null; slug: string; order?: number } | null;
  specs: { key: string; value: string; locale: string }[];
  reviewSummary: {
    averageRating: number;
    totalReviews: number;
    prosAr: string[] | null;
    prosEn: string[] | null;
    consAr: string[] | null;
    consEn: string[] | null;
  } | null;
}

export function getVerdictVariant(type: string | undefined): 'good' | 'cond' | 'wait' | 'bad' | 'unrated' {
  switch (type) {
    case 'WORTH_IT': return 'good';
    case 'WORTH_IT_WITH': return 'cond';
    case 'WAIT': return 'wait';
    case 'NOT_WORTH_IT': return 'bad';
    default: return 'unrated';
  }
}

export function getProductTranslation(product: Product, locale: string) {
  return product.translations.find((t) => t.locale === locale && t.name.trim())
    ?? product.translations.find((t) => t.locale === 'ar' && t.name.trim())
    ?? product.translations.find((t) => t.name.trim());
}

export function getLocalizedName(product: Product, locale: string): string {
  return getProductTranslation(product, locale)?.name || product.name;
}

export function getLocalizedDesc(product: Product, locale: string): string | null {
  const t = product.translations.find((t) => t.locale === locale);
  return t?.description || null;
}

export interface ContentPage {
  id: string;
  type: 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE' | 'OFFER';
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  categorySlug: string | null;
  locale: string;
  publishedAt: string | null;
}
