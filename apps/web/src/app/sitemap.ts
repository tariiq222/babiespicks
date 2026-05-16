import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';

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

  // TODO: Fetch products from API when deployed
  // const products = await fetch(`${API_URL}/products`).then(r => r.json());

  // Category pages
  const categories = ['formula', 'diapers', 'carseats', 'bottles', 'toys', 'care'];
  const categoryPages = categories.flatMap((cat) =>
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

  return [...staticPages, ...categoryPages];
}
