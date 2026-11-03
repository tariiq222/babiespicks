import 'server-only';
import type { Prisma, PrismaClient } from '@babiespicks/db';
import { couponVisibility, resolveCouponScope, selectLatestPrices, wrapAffiliateUrl, selectOffers, getFxSnapshot, getAllSourcePolicies, resolveOfferTarget, type CouponScope, type CouponVisibility, type ShoppingContext, type SelectedOfferSelection } from '@babiespicks/domain';
import { PRICE_BANDS, getFilterOptions } from '../shared/lib/catalog-filters';
// The backfill module owns the canonical legacy source id (Task 3): one definition,
// no second literal that could drift from it.
import { LEGACY_SOURCE_ID } from '../../../../scripts/operations/backfill-international';
import type { Product, ContentPage, CatalogPage, CatalogPageFilters, ProductOffersPage } from '../shared/lib/api';

/** Task 7 pagination contract: fixed page size, bounded maximum, deterministic cursor. */
export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_MAX_LIMIT = 48;

const productInclude = {
  translations: true,
  category: { select: { name: true, nameEn: true, slug: true, order: true } },
  verdict: true,
  reviewSummary: true,
  specs: true,
  prices: { orderBy: { scrapedAt: 'desc' as const }, include: { store: true } },
} satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
const contentInclude = { translations: true, category: true } satisfies Prisma.ContentPageInclude;
type ContentRow = Prisma.ContentPageGetPayload<{ include: typeof contentInclude }>;
const strings = (value: unknown): string[] | null => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null;

function displaySources(value: unknown): NonNullable<Product['sources']> {
  if(!Array.isArray(value)) return [];
  return value.flatMap(source=>{
    if(!source || typeof source!=='object' || typeof source.url!=='string' || typeof source.field!=='string' || typeof source.checkedAt!=='string' || !Number.isFinite(Date.parse(source.checkedAt))) return [];
    try { const url=new URL(source.url); if(url.protocol!=='https:' || url.username || url.password) return []; } catch { return []; }
    return [{url:source.url,field:source.field,checkedAt:source.checkedAt}];
  });
}

function productView(row: ProductRow): Product {
  return {
    id: row.id, name: row.name, slug: row.slug, brand: row.brand, imageUrl: row.imageUrl, isActive: row.isActive, updatedAt: row.updatedAt?.toISOString(),
    imageUrls: row.imageUrls ?? [], ageMinMonths: row.ageMinMonths, ageMaxMonths: row.ageMaxMonths, sources: displaySources(row.sources),
    translations: row.translations.map(({ locale, name, slug, description }) => ({ locale, name, slug, description })),
    category: row.category,
    specs: row.specs.map(({ key, value, locale }) => ({ key, value, locale })),
    verdict: row.verdict?.isPublished ? { ...row.verdict, conditionsAr: strings(row.verdict.conditionsAr), conditionsEn: strings(row.verdict.conditionsEn) } : null,
    reviewSummary: row.reviewSummary ? { ...row.reviewSummary, prosAr: strings(row.reviewSummary.prosAr), prosEn: strings(row.reviewSummary.prosEn), consAr: strings(row.reviewSummary.consAr), consEn: strings(row.reviewSummary.consEn) } : null,
    prices: selectLatestPrices(row.prices).filter((p) => {
      if (p.currency !== 'SAR' || !p.url) return false;
      try { wrapAffiliateUrl(p.url, p.store.slug, process.env, p.store); return true; } catch { return false; }
    }).map((p) => ({ price: Number(p.price), originalPrice: p.originalPrice === null ? null : Number(p.originalPrice), currency: p.currency, storeId: p.storeId, checkedAt: new Date(p.scrapedAt).toISOString(), store: p.store ? { id: p.store.id, name: p.store.name, slug: p.store.slug } : null })),
  };
}
/** Columns the coupon surfaces need after the additive migration. */
const couponSelect = {
  id: true, code: true, description: true, discountPercent: true, discountAmount: true, validUntil: true, verified: true,
  status: true, couponCurrency: true, minimumSpendAmount: true, minimumSpendCurrency: true, eligibleCountries: true,
  audience: true, sourceId: true, checkedAt: true, couponValidUntil: true,
} as const;
/**
 * The row shape these readers need. Structural on purpose: the additive Coupon columns
 * are owned by the migration task, and a reader that only needs these fields must not
 * depend on the generated client having them yet.
 */
interface CouponRow {
  id: string; code: string; /** Not selected: the coupon surfaces never need the store id. */ storeId?: string; description: string | null; discountPercent: number | null;
  discountAmount: { toFixed(digits: number): string } | null; validUntil: Date | null; verified: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'NEEDS_REVIEW' | 'USED_UP' | 'INVALID';
  couponCurrency?: string | null; minimumSpendAmount?: { toFixed(digits: number): string } | null;
  minimumSpendCurrency?: string | null; eligibleCountries?: string[] | null; audience?: string | null;
  sourceId?: string | null; checkedAt?: Date | null; couponValidUntil?: Date | null;
}
type CouponRowWithStore = CouponRow & { store: { name: string; slug: string } };
/** Stored row → shared scope. Decimal columns stay exact strings; the text is prose only. */
export function projectCouponScope(row: CouponRow): CouponScope {
  return resolveCouponScope({
    id: row.id, code: row.code, storeId: row.storeId ?? '', discountPercent: row.discountPercent,
    discountAmount: row.discountAmount === null ? null : row.discountAmount.toFixed(6),
    validUntil: row.validUntil, status: row.status,
    couponCurrency: row.couponCurrency ?? null, minimumSpendAmount: row.minimumSpendAmount ? row.minimumSpendAmount.toFixed(6) : null,
    minimumSpendCurrency: row.minimumSpendCurrency ?? null, eligibleCountries: row.eligibleCountries ?? [],
    audience: row.audience ?? null, sourceId: row.sourceId ?? null, checkedAt: row.checkedAt ?? null, couponValidUntil: row.couponValidUntil ?? null,
    descriptionText: row.description, thirdPartyVerified: row.verified,
  });
}
export interface CouponReadContext {
  /** Resolved shopping preference. Absent means unknown, never "everywhere". */
  audience?: 'PUBLIC' | 'MEMBERS';
  eligibleCountries?: readonly string[];
  now?: Date;
}
/** Public coupon projection: the code and the verified badge are decided by one shared rule. */
export interface ActiveCoupon {
  id: string; code: string | null; description: string | null; discountPercent: number | null;
  /** The stored fixed amount with its own currency; never a relabelled SAR figure. */
  discountAmount: number | null; discountCurrency: string | null;
  minimumSpend: { amount: string; currency: string } | null;
  validUntil: string | null; verified: boolean; visibility: CouponVisibility['state'];
  audience: 'PUBLIC' | 'MEMBERS' | null; eligibleCountries: readonly string[] | null;
  store: { name: string; slug: string };
}
/** One row → the public coupon, or null when it must not appear in the public feed. */
export function publicCouponView(row: CouponRowWithStore, now: Date, context: CouponReadContext = {}): ActiveCoupon | null {
  const scope = projectCouponScope(row);
  const audience = context.audience ?? 'PUBLIC';
  // A members-only coupon never enters the public feed, whatever its code state.
  if (scope.audience === 'MEMBERS' && audience !== 'MEMBERS') return null;
  const visibility = couponVisibility(scope, now, { audience, eligibleCountries: context.eligibleCountries, scope: 'storeWide' });
  const amount = scope.discount?.kind === 'AMOUNT' ? scope.discount.money : null;
  return {
    id: row.id, code: visibility.code, description: row.description,
    discountPercent: scope.percent,
    // A legacy amount without a currency is not published as a number at all.
    discountAmount: amount ? Number(amount.amount) : null,
    discountCurrency: amount?.currency ?? null,
    minimumSpend: scope.minimumSpend?.currency ? { amount: scope.minimumSpend.amount, currency: scope.minimumSpend.currency } : null,
    validUntil: scope.validUntil?.utc ?? null, verified: visibility.verified, visibility: visibility.state,
    audience: scope.audience, eligibleCountries: scope.eligibleCountries, store: row.store,
  };
}
export interface ContentDetail extends ContentPage { content: string; metaTitle: string; excerpt: string; }
function contentView(row: ContentRow, locale: string): ContentDetail | null {
  const translation = row.translations.find((t) => t.locale === locale) ?? row.translations.find((t) => t.locale === 'ar') ?? row.translations[0];
  if (!translation) return null;
  return { id: row.id, type: row.type, slug: row.slug, title: translation.title, description: translation.metaDescription, content: translation.content, metaTitle: translation.metaTitle || translation.title, excerpt: translation.excerpt || '', imageUrl: row.imageUrl ?? null, categorySlug: row.category?.slug ?? null, locale: translation.locale, publishedAt: row.publishedAt?.toISOString() ?? null };
}

// ── International offer reads (Task 7) ──────────────────────────────────────

/**
 * Source policies come from the frozen T1 registry only. `legacy-sar-backfill` is
 * deliberately unregistered: it never acquires trusted context, and an unknown source
 * never fails a public read. There is no writable policy table — a reader cannot
 * activate a source.
 */
function readSourcePolicies() {
  return getAllSourcePolicies();
}

/** Published product check stays in SQL; this guard covers the include shape only. */
function productPublished(offer: { listing: { product?: { publishStatus?: string; isActive?: boolean } | null } }): boolean {
  const product = offer.listing.product;
  return product?.publishStatus === 'PUBLISHED' && product.isActive !== false;
}

type OfferRow = {
  id: string; listingId: string; sellerKey: string; fulfillerKey: string | null; isActive: boolean;
  listing: { id: string; productId: string; marketplaceCode: string; product?: { publishStatus?: string; isActive?: boolean } | null; store: { id: string; name: string; slug: string; isActive: boolean; marketplaceCode: string | null } };
  priceObservations: Array<{ id: string; offerId: string; scopeKey: string; shipTo: string | null; amount: unknown; currency: string | null; originalAmount: unknown; audience: string; availability: string; taxBasis: string; sourceId: string; checkedAt: Date; expiresAt: Date }>;
  deliveryEvidence: Array<{ id: string; offerId: string; country: string; precision: string; state: string; sourceId: string; checkedAt: Date; expiresAt: Date }>;
};

/** Stored rows → pure engine observations. No store name, no active flag is copied. */
function observationsFromOffers(offers: OfferRow[], productId: string) {
  return offers.flatMap(offer => offer.listing.productId === productId && productPublished(offer) ? offer.priceObservations.map(row => ({
    id: row.id, offerId: offer.id, productId, listingId: offer.listingId,
    marketplaceCode: offer.listing.marketplaceCode, sellerKey: offer.sellerKey,
    fulfillerKey: offer.fulfillerKey, observedSellerKey: offer.sellerKey,
    observedFulfillerKey: offer.fulfillerKey, scopeKey: row.scopeKey, shipTo: row.shipTo as 'SA' | 'US' | null,
    price: row.amount === null || row.amount === undefined || row.currency === null ? null : { amount: String(row.amount), currency: row.currency },
    originalPrice: row.originalAmount === null || row.originalAmount === undefined || row.currency === null ? null : { amount: String(row.originalAmount), currency: row.currency },
    audience: row.audience as 'PUBLIC' | 'MEMBERS',
    availability: row.availability as 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN',
    taxBasis: row.taxBasis as 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN',
    sourceId: row.sourceId, checkedAt: row.checkedAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
    isActive: offer.isActive,
  })) : []);
}

/** Stored rows → pure engine delivery evidence; SA and US stay separate rows. */
function deliveryFromOffers(offers: OfferRow[]) {
  return offers.flatMap(offer => productPublished(offer) ? offer.deliveryEvidence.map(row => ({
    id: row.id, offerId: offer.id, marketplaceCode: offer.listing.marketplaceCode,
    sellerKey: offer.sellerKey, fulfillerKey: offer.fulfillerKey, country: row.country as 'SA' | 'US',
    precision: row.precision as 'COUNTRY' | 'POSTAL_SAMPLE' | 'UNKNOWN',
    state: row.state as 'OBSERVED_AVAILABLE' | 'OBSERVED_UNAVAILABLE' | 'UNKNOWN',
    sourceId: row.sourceId, checkedAt: row.checkedAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
  })) : []);
}

/** Legacy SAR fallback view: the original price only, no comparison ratio, no group. */
type LegacyPriceRow = {
  price: number; originalPrice: number | null; currency: string; storeId: string;
  url: string | null; inStock: boolean | undefined; scrapedAt: Date;
  store: { id: string; name: string; slug: string; isActive: boolean; url: string } | null;
};
function legacyPriceFromRow(row: { prices: Array<{ price: unknown; originalPrice: unknown; currency: string; storeId: string; url: string | null; inStock: boolean | null; scrapedAt: Date; store: { id: string; name: string; slug: string; isActive: boolean; url: string } | null }> }, now: Date) {
  const prices: LegacyPriceRow[] = row.prices.map(p => ({ price: Number(p.price), originalPrice: p.originalPrice === null ? null : Number(p.originalPrice), currency: p.currency, storeId: p.storeId, url: p.url, inStock: p.inStock ?? undefined, scrapedAt: p.scrapedAt, store: p.store }));
  const price = selectLatestPrices<LegacyPriceRow>(prices, now).find(p => p.currency === 'SAR' && p.url && p.store);
  if (!price || !price.url || !price.store) return null;
  try { wrapAffiliateUrl(price.url, price.store.slug, process.env, price.store); } catch { return null; }
  return {
    price: price.price, originalPrice: price.originalPrice,
    currency: 'SAR' as const, storeId: price.storeId,
    checkedAt: new Date(price.scrapedAt).toISOString(),
    store: { id: price.store.id, name: price.store.name, slug: price.store.slug },
  };
}

// ── Deterministic cursor (Task 7: fixed size, bounded, stable key) ──────────

function emptyFilterOptions() {
  return { categories: [] as Array<{ slug: string; label: string; order: number }>, brands: [] as string[], bands: [] as Array<(typeof PRICE_BANDS)[number]>, hasDiscounts: false, hasRatings: false, hasVerdicts: false };
}

const CURSOR_PERIOD_SECONDS = 3600;
/** Deterministic key: position id + the request hour bucket, both integrity-checked. */
export function encodeCatalogCursor(id: string, atIso: string): string {
  const bucket = Math.floor(Date.parse(atIso) / (CURSOR_PERIOD_SECONDS * 1000)).toString(36);
  return Buffer.from(`${id}\u241F${bucket}`, 'utf8').toString('base64url');
}
export function decodeCatalogCursor(cursor: string): { id: string } | null {
  try {
    const text = Buffer.from(cursor, 'base64url').toString('utf8');
    const index = text.lastIndexOf('\u241F');
    if (index <= 0) return null;
    const id = text.slice(0, index), bucket = text.slice(index + 1);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !/^[a-z0-9]+$/.test(bucket)) return null;
    return { id };
  } catch { return null; }
}
function parseCatalogCursor(cursor: string | null | undefined): { id: string } | null {
  return cursor ? decodeCatalogCursor(cursor) : null;
}

/** All public entry points constrain publication in the database, before projection. */
export function createPublicQueries(db: PrismaClient) {
  const queries = {
    async getProducts(locale = 'ar', limit = 20): Promise<{ data: Product[]; nextCursor: string | null }> {
      const rows = await db.product.findMany({ where: { publishStatus: 'PUBLISHED', isActive: true }, include: productInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: Math.min(Math.max(limit, 1), 1000) });
      return { data: rows.map(productView), nextCursor: null };
    },
    async getActiveCoupons(limit = 5, context: CouponReadContext = {}): Promise<ActiveCoupon[]> {
      const now = context.now ?? new Date();
      const rows = await db.coupon.findMany({ where: { status: 'ACTIVE', store: { isActive: true }, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: now } }] }] }, select: { ...couponSelect, store: { select: { name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 20) });
      return rows.flatMap((row) => { const view = publicCouponView(row, now, context); return view ? [view] : []; });
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
    // ── International offer reads (Task 7) ──────────────────────────────────
    /**
     * Every international read follows one order: publication is constrained in SQL,
     * rows map to the pure engine input (never store names or active flags), expiry and
     * eligibility and identity are the engine's decision, and the JSON projection leaves
     * the server exactly as the engine produced it.
     */
    offerRows(now: Date, extraWhere: Record<string, unknown> = {}) {
      return db.purchaseOffer.findMany({
        where: {
          listing: { product: { publishStatus: 'PUBLISHED' as const, isActive: true }, ...extraWhere },
          priceObservations: { some: { expiresAt: { gt: now } } },
        },
        select: {
          id: true, listingId: true, sellerKey: true, fulfillerKey: true, isActive: true, audience: true,
          listing: {
            select: {
              id: true, productId: true, marketplaceCode: true,
              product: { select: { publishStatus: true, isActive: true } },
              store: { select: { id: true, name: true, slug: true, isActive: true, marketplaceCode: true } },
            },
          },
          priceObservations: {
            select: { id: true, offerId: true, scopeKey: true, shipTo: true, amount: true, currency: true, originalAmount: true, audience: true, availability: true, taxBasis: true, sourceId: true, checkedAt: true, expiresAt: true },
            orderBy: [{ checkedAt: 'desc' as const }, { id: 'desc' as const }],
          },
          deliveryEvidence: {
            select: { id: true, offerId: true, country: true, precision: true, state: true, sourceId: true, checkedAt: true, expiresAt: true },
            orderBy: [{ checkedAt: 'desc' as const }, { id: 'desc' as const }],
          },
        },
      });
    },
    async getOfferSelection(productId: string, context: ShoppingContext, now: Date = new Date()): Promise<SelectedOfferSelection> {
      const [policies, fx] = await Promise.all([readSourcePolicies(), getFxSnapshot(db, ['SAR', 'USD'], now)]);
      const offers = await queries.offerRows(now, { productId });
      return selectOffers({
        productId,
        observations: observationsFromOffers(offers, productId),
        delivery: deliveryFromOffers(offers),
        context, fx, policies, now,
      });
    },
    /**
     * One product's public offer selection in the requested context (T6 engine output).
     * The engine reads legacy-sar-backfill rows itself (untrusted, no comparison claims).
     * The legacy SAR price view applies only to products with no international rows at
     * all — the pre-activation fallback — and carries no comparison or delivery claim.
     */
    async getProductOffers(productId: string, context: ShoppingContext, now: Date = new Date()): Promise<ProductOffersPage> {
      const [total, offers, legacy] = await Promise.all([
        db.product.count({ where: { id: productId, publishStatus: 'PUBLISHED', isActive: true } }),
        queries.offerRows(now, { productId }),
        queries.legacyPriceFor(productId, now),
      ]);
      const selection = selectOffers({
        productId,
        observations: observationsFromOffers(offers, productId),
        delivery: deliveryFromOffers(offers),
        context, fx: await getFxSnapshot(db, ['SAR', 'USD'], now), policies: readSourcePolicies(), now,
      });
      const hasInternationalRows = offers.some(offer => offer.priceObservations.length > 0 || offer.deliveryEvidence.length > 0);
      return {
        product: null, offers: selection, legacyPrice: hasInternationalRows ? null : legacy, total,
        nextCursor: null, filterOptions: emptyFilterOptions(),
        contextKey: selection.contextKey,
      };
    },
    /** The legacy SAR fallback price for one product, without any comparison claim. */
    async legacyPriceFor(productId: string, now: Date = new Date()) {
      const row = await db.product.findFirst({ where: { id: productId, publishStatus: 'PUBLISHED', isActive: true }, include: productInclude });
      return row ? legacyPriceFromRow(row, now) : null;
    },
    /**
     * International catalog page. One deterministic SQL page (cursor key, bounded size),
     * the T6 engine per product, and the legacy SAR fallback only when the product has no
     * live international observation at all. filterOptions always come from every eligible
     * row of the page, never from the trimmed view or the current filters.
     */
    async getCatalogPage(context: ShoppingContext, filters: CatalogPageFilters = {}, cursor: string | null = null, options: { limit?: number; productId?: string; now?: Date } = {}): Promise<CatalogPage> {
      const now = options.now ?? new Date();
      const limit = Math.min(Math.max(options.limit ?? CATALOG_PAGE_SIZE, 1), CATALOG_MAX_LIMIT);
      const parsed = parseCatalogCursor(cursor);
      const where: Record<string, unknown> = { publishStatus: 'PUBLISHED', isActive: true };
      if (options.productId) where.id = options.productId;
      else if (filters.category) where.category = { slug: filters.category };
      const [total, rows] = await Promise.all([
        db.product.count({ where }),
        db.product.findMany({
          where, include: productInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...(parsed ? { skip: 1, cursor: { id: parsed.id } } : {}),
          take: limit,
        }),
      ]);
      const ids = rows.map(row => row.id);
      const [policies, fx] = await Promise.all([readSourcePolicies(), getFxSnapshot(db, ['SAR', 'USD'], now)]);
      const selections = new Map<string, SelectedOfferSelection>();
      const legacyIds = new Set<string>();
      if (ids.length) {
        const offers = await queries.offerRows(now, { productId: { in: ids } });
        const byProduct = new Map<string, typeof offers>();
        for (const offer of offers) {
          const list = byProduct.get(offer.listing.productId);
          if (list) list.push(offer); else byProduct.set(offer.listing.productId, [offer]);
        }
        for (const id of ids) {
          const productOffers = byProduct.get(id) ?? [];
          const hasInternationalRows = productOffers.some(offer => offer.priceObservations.length > 0 || offer.deliveryEvidence.length > 0);
          if (hasInternationalRows) {
            selections.set(id, selectOffers({
              productId: id,
              observations: observationsFromOffers(productOffers, id),
              delivery: deliveryFromOffers(productOffers),
              context, fx, policies, now,
            }));
          } else {
            legacyIds.add(id);
          }
        }
      }
      const items: CatalogPage['items'] = [];
      const eligibleViews: Array<Product & { legacyOnly: boolean }> = [];
      for (const row of rows) {
        const legacy = legacyIds.has(row.id);
        if (!legacy && !selections.has(row.id)) continue;
        const view = Object.assign(productView(row), { legacyOnly: legacy });
        eligibleViews.push(view);
        items.push({
          product: view,
          offers: selections.get(row.id) ?? null,
          legacyPrice: legacy ? legacyPriceFromRow(row, now) : null,
        });
      }
      // filterOptions are computed on every eligible row of the page, not the trimmed
      // or filtered subset, so opening a filter never narrows the other filter choices.
      const filterOptions = getFilterOptions(eligibleViews, filters.locale ?? context.locale);
      const nextCursor = rows.length === limit ? encodeCatalogCursor(rows[rows.length - 1]!.id, now.toISOString()) : null;
      return { items, nextCursor, total, filterOptions };
    },
    /** One offer purchase target, resolved against the exact observation and destination. */
    async resolveOfferTarget(input: { offerId: string; observationId: string; shipTo: 'SA' | 'US' | null }, now: Date = new Date()) {
      return resolveOfferTarget(db, input, now);
    },
  };
  return queries;
}
