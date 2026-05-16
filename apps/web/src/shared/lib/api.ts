const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.babiespicks.com';

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
  prices: { price: number; originalPrice: number | null; currency: string; store: { name: string; slug: string } | null }[];
  category: { name: string; slug: string } | null;
}

export async function getProducts(locale = 'ar', limit = 20): Promise<{ data: Product[]; nextCursor: string | null }> {
  const res = await fetch(`${API_URL}/products?locale=${locale}&limit=${limit}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { data: [], nextCursor: null };
  return res.json();
}

export async function getProduct(slug: string, locale = 'ar'): Promise<Product | null> {
  const res = await fetch(`${API_URL}/products/${slug}?locale=${locale}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getProductsByCategory(categorySlug: string, locale = 'ar'): Promise<Product[]> {
  const res = await fetch(`${API_URL}/products/category/${categorySlug}?locale=${locale}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  return res.json();
}

export function getVerdictVariant(type: string | undefined): 'good' | 'cond' | 'wait' | 'bad' {
  switch (type) {
    case 'WORTH_IT': return 'good';
    case 'WORTH_IT_WITH': return 'cond';
    case 'WAIT': return 'wait';
    case 'NOT_WORTH_IT': return 'bad';
    default: return 'good';
  }
}

export function getLocalizedName(product: Product, locale: string): string {
  const t = product.translations.find((t) => t.locale === locale);
  return t?.name || product.name;
}

export function getLocalizedDesc(product: Product, locale: string): string | null {
  const t = product.translations.find((t) => t.locale === locale);
  return t?.description || null;
}
