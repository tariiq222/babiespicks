import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.babiespicks.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = ['ar', 'en'];

  // Static pages
  const staticPages = ['', '/about', '/privacy', '/terms'].flatMap((path) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1.0 : 0.5,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}${path}`])),
      },
    })),
  );

  // Category pages
  const categorySlugs = ['formula', 'diapers', 'carseats', 'bottles', 'toys', 'care'];
  const categoryPages = categorySlugs.flatMap((cat) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}/categories/${cat}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/categories/${cat}`])),
      },
    })),
  );

  // Best-of pages (one per category)
  const bestListPages = categorySlugs.flatMap((cat) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}/best/${cat}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/best/${cat}`])),
      },
    })),
  );

  // Fetch products from API
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const productsRes = await fetch(`${API_URL}/products?locale=ar&limit=1000`, {
      next: { revalidate: 3600 },
    });
    if (productsRes.ok) {
      const { data: products } = await productsRes.json();
      productPages = products
        .filter((p: { isActive: boolean }) => p.isActive)
        .flatMap((p: { slug: string }) =>
          locales.map((locale) => ({
            url: `${BASE_URL}/${locale}/products/${p.slug}`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
            alternates: {
              languages: Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/products/${p.slug}`])),
            },
          })),
        );
    }
  } catch (e) {
    // Fallback: no product pages if API unavailable
    console.error('Failed to fetch products for sitemap:', e);
  }

  return [...staticPages, ...categoryPages, ...bestListPages, ...productPages];
}
