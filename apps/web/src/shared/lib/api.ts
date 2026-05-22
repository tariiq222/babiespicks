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

export async function getProducts(locale = 'ar', limit = 20): Promise<{ data: Product[]; nextCursor: string | null }> {
  const res = await fetch(`${API_URL}/products?locale=${locale}&limit=${limit}`, {
    next: { revalidate: 3600, tags: ['products'] },
  });
  if (!res.ok) return { data: [], nextCursor: null };
  return res.json();
}

export async function getAllProducts(locale = 'ar'): Promise<Product[]> {
  const LIMIT = 100;
  const MAX_TOTAL = 500;
  let all: Product[] = [];
  let cursor: string | null = null;

  while (all.length < MAX_TOTAL) {
    let url: string;
    if (cursor) {
      url = `${API_URL}/products?locale=${locale}&limit=${LIMIT}&cursor=${cursor}`;
    } else {
      url = `${API_URL}/products?locale=${locale}&limit=${LIMIT}`;
    }
    const res = await fetch(url, { next: { revalidate: 3600, tags: ['products'] } });
    if (!res.ok) break;
    const json: { data: Product[]; nextCursor: string | null } = await res.json();
    all = all.concat(json.data);
    if (!json.nextCursor || json.data.length === 0) break;
    cursor = json.nextCursor;
  }

  return all.slice(0, MAX_TOTAL);
}

export async function getProduct(slug: string, locale = 'ar'): Promise<Product | null> {
  const res = await fetch(`${API_URL}/products/${slug}?locale=${locale}`, {
    next: { revalidate: 3600, tags: ['products', `products:${slug}`] },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getProductsByCategory(categorySlug: string, locale = 'ar'): Promise<Product[]> {
  const res = await fetch(`${API_URL}/products/category/${categorySlug}?locale=${locale}`, {
    next: { revalidate: 3600, tags: ['products', `products:category:${categorySlug}`] },
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

export async function searchProducts(query: string, locale = 'ar'): Promise<{ data: Product[]; query: string; total: number }> {
  if (!query || query.length < 2) return { data: [], query, total: 0 };
  const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}&locale=${locale}&limit=20`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) return { data: [], query, total: 0 };
  return res.json();
}

export interface ContentPage {
  id: string;
  type: 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE';
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  categorySlug: string | null;
  locale: string;
  publishedAt: string | null;
}

export async function getContentPages(locale = 'ar'): Promise<ContentPage[]> {
  const res = await fetch(`${API_URL}/content-pages?locale=${locale}`, {
    next: { revalidate: 3600, tags: ['content-pages'] },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getRelatedContentForProduct(productSlug: string, categorySlug: string | null, locale = 'ar'): Promise<{ bestLists: ContentPage[]; guides: ContentPage[] }> {
  const [allPages] = await Promise.all([getContentPages(locale)]);
  const pages = allPages.filter((p) => p.locale === locale || p.locale === 'ar');
  const bestLists = pages.filter((p) => p.type === 'BEST_LIST' && p.categorySlug === categorySlug);
  const guides = pages.filter((p) => p.type === 'BUYING_GUIDE' && p.categorySlug === categorySlug);
  return { bestLists, guides };
}

export async function getRelatedContentForCategory(categorySlug: string, locale = 'ar'): Promise<ContentPage[]> {
  const pages = await getContentPages(locale);
  return pages.filter((p) => p.type === 'BEST_LIST' && p.categorySlug === categorySlug);
}
