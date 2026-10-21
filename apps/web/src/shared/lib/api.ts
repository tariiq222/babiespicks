// Client-safe display types and helpers. Database queries live in server/queries.ts.
export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  imageUrl: string | null;
  isActive: boolean;
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
  prices: { price: number; originalPrice: number | null; currency: string; storeId: string; store: { id: string; name: string; slug: string } | null }[];
  category: { name: string; slug: string } | null;
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
