import 'server-only';
import type { Prisma, PrismaClient } from '@babiespicks/db';
import { selectLatestPrices, wrapAffiliateUrl } from '@babiespicks/domain';
import type { Product, ContentPage } from '../shared/lib/api';

const productInclude = {
  translations: true,
  category: { select: { name: true, slug: true } },
  verdict: true,
  reviewSummary: true,
  specs: true,
  prices: { orderBy: { scrapedAt: 'desc' as const }, include: { store: true } },
} satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
const contentInclude = { translations: true, category: true } satisfies Prisma.ContentPageInclude;
type ContentRow = Prisma.ContentPageGetPayload<{ include: typeof contentInclude }>;
const strings = (value: unknown): string[] | null => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null;

function productView(row: ProductRow): Product {
  return {
    id: row.id, name: row.name, slug: row.slug, brand: row.brand, imageUrl: row.imageUrl, isActive: row.isActive,
    translations: row.translations.map(({ locale, name, slug, description }) => ({ locale, name, slug, description })),
    category: row.category,
    specs: row.specs.map(({ key, value, locale }) => ({ key, value, locale })),
    verdict: row.verdict?.isPublished ? { ...row.verdict, conditionsAr: strings(row.verdict.conditionsAr), conditionsEn: strings(row.verdict.conditionsEn) } : null,
    reviewSummary: row.reviewSummary ? { ...row.reviewSummary, prosAr: strings(row.reviewSummary.prosAr), prosEn: strings(row.reviewSummary.prosEn), consAr: strings(row.reviewSummary.consAr), consEn: strings(row.reviewSummary.consEn) } : null,
    prices: selectLatestPrices(row.prices).filter((p) => {
      if (p.currency !== 'SAR' || !p.url) return false;
      try { wrapAffiliateUrl(p.url, p.store.slug, process.env, p.store); return true; } catch { return false; }
    }).map((p) => ({ price: Number(p.price), originalPrice: p.originalPrice === null ? null : Number(p.originalPrice), currency: p.currency, storeId: p.storeId, store: p.store ? { id: p.store.id, name: p.store.name, slug: p.store.slug } : null })),
  };
}
export interface ContentDetail extends ContentPage { content: string; metaTitle: string; excerpt: string; }
function contentView(row: ContentRow, locale: string): ContentDetail | null {
  const translation = row.translations.find((t) => t.locale === locale) ?? row.translations.find((t) => t.locale === 'ar') ?? row.translations[0];
  if (!translation) return null;
  return { id: row.id, type: row.type, slug: row.slug, title: translation.title, description: translation.metaDescription, content: translation.content, metaTitle: translation.metaTitle || translation.title, excerpt: translation.excerpt || '', imageUrl: row.imageUrl ?? null, categorySlug: row.category?.slug ?? null, locale: translation.locale, publishedAt: row.publishedAt?.toISOString() ?? null };
}

/** All public entry points constrain publication in the database, before projection. */
export function createPublicQueries(db: PrismaClient) {
  const queries = {
    async getProducts(locale = 'ar', limit = 20): Promise<{ data: Product[]; nextCursor: string | null }> {
      const rows = await db.product.findMany({ where: { publishStatus: 'PUBLISHED', isActive: true }, include: productInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: Math.min(Math.max(limit, 1), 1000) });
      return { data: rows.map(productView), nextCursor: null };
    },
    async getAllProducts(locale = 'ar'): Promise<Product[]> {
      const rows = await db.product.findMany({ where: { publishStatus: 'PUBLISHED', isActive: true }, include: productInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
      return rows.map(productView);
    },
    async getProduct(slug: string, locale = 'ar'): Promise<Product | null> {
      const row = await db.product.findFirst({ where: { publishStatus: 'PUBLISHED', isActive: true, OR: [{ slug }, { translations: { some: { slug, locale } } }] }, include: productInclude });
      return row ? productView(row) : null;
    },
    async getProductsByCategory(categorySlug: string, locale = 'ar'): Promise<Product[]> {
      const rows = await db.product.findMany({ where: { publishStatus: 'PUBLISHED', isActive: true, category: { slug: categorySlug } }, include: productInclude, orderBy: { createdAt: 'desc' } });
      return rows.map(productView);
    },
    async searchProducts(query: string, locale = 'ar'): Promise<{ data: Product[]; query: string; total: number }> {
      query = query.trim().slice(0, 200);
      if (query.length < 2) return { data: [], query, total: 0 };
      const where: Prisma.ProductWhereInput = { publishStatus: 'PUBLISHED', isActive: true, OR: [{ name: { contains: query, mode: 'insensitive' } }, { brand: { contains: query, mode: 'insensitive' } }, { translations: { some: { locale: { in: [locale, 'ar'] }, name: { contains: query, mode: 'insensitive' } } } }] };
      const [rows, total] = await Promise.all([
        db.product.findMany({ where, include: productInclude, take: 20, orderBy: { createdAt: 'desc' } }),
        db.product.count({ where }),
      ]);
      return { data: rows.map(productView), query, total };
    },
    async getContentPages(locale = 'ar'): Promise<ContentPage[]> {
      const rows = await db.contentPage.findMany({ where: { publishStatus: 'PUBLISHED' }, include: contentInclude, orderBy: { publishedAt: 'desc' } });
      return rows.map((r) => contentView(r, locale)).filter((r): r is ContentDetail => r !== null);
    },
    async getContentPage(slug: string, locale = 'ar', type?: ContentPage['type']): Promise<ContentDetail | null> {
      const row = await db.contentPage.findFirst({ where: { slug, publishStatus: 'PUBLISHED', ...(type ? { type } : {}) }, include: contentInclude });
      return row ? contentView(row, locale) : null;
    },
    async getRelatedContentForProduct(_productSlug: string, categorySlug: string | null, locale = 'ar') {
      const pages = await queries.getContentPages(locale);
      return { bestLists: pages.filter((p) => p.type === 'BEST_LIST' && p.categorySlug === categorySlug), guides: pages.filter((p) => p.type === 'BUYING_GUIDE' && p.categorySlug === categorySlug) };
    },
    async getRelatedContentForCategory(categorySlug: string, locale = 'ar') {
      return (await queries.getContentPages(locale)).filter((p) => p.type === 'BEST_LIST' && p.categorySlug === categorySlug);
    },
    async getStoreBySlug(slug: string) { return db.store.findUnique({ where: { slug, isActive: true }, select: { id: true, name: true, slug: true, logoUrl: true } }); },
    async getPublishedOffers(locale = 'ar'): Promise<ContentPage[]> {
      const [rows, unified, legacy] = await Promise.all([
        db.contentPage.findMany({ where: { publishStatus: 'PUBLISHED', type: 'OFFER' }, include: contentInclude, orderBy: { publishedAt: 'desc' } }),
        db.contentPage.findMany({ where: { type: 'OFFER' }, select: { slug: true } }),
        db.publicOffer.findMany({ where: { status: 'PUBLISHED', unpublishedAt: null }, orderBy: { publishedAt: 'desc' } }),
      ]);
      const slugs = new Set(unified.map(row => row.slug));
      const published = rows.map(row => contentView(row, locale)).filter((row): row is ContentDetail => row !== null);
      const fallbacks: ContentPage[] = legacy.filter(row => !slugs.has(row.slug)).map(row => ({ id: row.id, type: 'OFFER', slug: row.slug, title: row.title, description: row.seoDescription, imageUrl: null, categorySlug: null, locale: 'ar', publishedAt: row.publishedAt?.toISOString() ?? null }));
      return [...published, ...fallbacks].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.slug.localeCompare(b.slug));
    },
    async getOffer(slug: string, locale = 'ar') {
      const unified = await queries.getContentPage(slug, locale, 'OFFER');
      if (unified) return { ...unified, body: unified.content, seoTitle: unified.metaTitle, seoDescription: unified.description };
      const exists = await db.contentPage.findFirst({ where: { slug, type: 'OFFER' }, select: { id: true } });
      if (exists) return null;
      const legacy = await db.publicOffer.findFirst({ where: { slug, status: 'PUBLISHED', unpublishedAt: null } });
      return legacy ? { id: legacy.id, slug: legacy.slug, title: legacy.title, body: legacy.body, seoTitle: legacy.seoTitle, seoDescription: legacy.seoDescription, publishedAt: legacy.publishedAt?.toISOString() ?? null, locale: 'ar' } : null;
    },
  };
  return queries;
}
