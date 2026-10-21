import type { MetadataRoute } from 'next';
import { prisma } from '@babiespicks/db';
import { getAllProducts, getPublishedOffers } from '@/server/queries';
export const dynamic = 'force-dynamic';
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, offers, stores] = await Promise.all([getAllProducts(), getPublishedOffers(), prisma.store.findMany({ where: { isActive: true, coupons: { some: { status: 'ACTIVE', AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }] } } }, select: { slug: true } })]);
  const paths = ['', '/about', '/privacy', '/terms', '/disclosure', '/coupons', ...products.filter(p => p.prices.length > 0).map(p => `/products/${p.slug}`), ...offers.map(o => `/offers/${o.slug}`), ...stores.map(s => `/coupons/${s.slug}`)];
  return [...new Set(paths)].flatMap(path => ['ar', 'en'].map(locale => ({ url: `${BASE_URL}/${locale}${path}`, changeFrequency: 'daily' as const, priority: path === '' ? 1 : 0.7 })));
}
