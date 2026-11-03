import { createHash } from 'node:crypto';
import type { ShoppingContext } from '@babiespicks/domain';
import type { CatalogPage, CatalogPageFilters, CatalogPageItem } from '../shared/lib/api';
import { PRICE_BANDS, getCategoryLabel, getShopperRating } from '../shared/lib/catalog-filters';

type Money = { amount: string; currency: string };
type Position = { id: string; createdAt: string; group: string; amount: string | null; discount: string | null };
export const CATALOG_SCAN_SIZE = 96;
const units = (s: string) => { const [a, b = ''] = s.split('.'); return BigInt(a! + b.padEnd(6, '0')); };
const compareAmount = (a: string, b: string) => units(a) < units(b) ? -1 : units(a) > units(b) ? 1 : 0;
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function catalogMoney(item: CatalogPageItem): Array<{ money: Money; group: string; discount: string | null }> {
  if (item.legacyPrice) {
    const p = item.legacyPrice;
    return [{ money: { amount: String(p.price), currency: p.currency }, group: 'LEGACY:SAR', discount: p.originalPrice && p.originalPrice > p.price ? String(Math.round((p.originalPrice - p.price) / p.originalPrice * 100_000_000) / 1_000_000) : null }];
  }
  return [...(item.offers?.quotes ?? []), ...(item.offers?.pendingDelivery ?? [])].flatMap(q => {
    const money = q.convertedPrice ?? q.price;
    // An unknown tax/delivery group is never numerically ranked across offers.
    if (!money) return [];
    const group = q.comparisonGroup ?? `UNCOMPARABLE:${q.offerId}`;
    const values = [{ money, group, discount: q.discountPercent }];
    // An exact budget may use the source unit while display uses an approved FX
    // conversion. Keep both units; neither is relabelled or converted here.
    if (q.price && q.convertedPrice && q.price.currency !== q.convertedPrice.currency) values.push({ money: q.price, group: `${group}:ORIGINAL:${q.price.currency}`, discount: q.discountPercent });
    return values;
  });
}
export function searched(item: CatalogPageItem, q: string, locale: string): boolean {
  const needle = q.trim().slice(0, 200).toLocaleLowerCase(locale);
  return !needle || [item.product.name, item.product.brand, ...item.product.translations.filter(t => t.locale === locale || t.locale === 'ar').map(t => t.name)].some(s => s?.toLocaleLowerCase(locale).includes(needle));
}
function position(item: CatalogPageItem, createdAt: string, currency: string | null): Position {
  const money = catalogMoney(item);
  const representative = money.find(p => p.money.currency === currency) ?? money[0];
  return { id: item.product.id, createdAt, group: representative?.group ?? '~UNPRICED', amount: representative?.money.amount ?? null, discount: representative?.discount ?? null };
}
function compare(a: Position, b: Position, sort?: string): number {
  if (sort === 'price' || sort === 'discount') {
    const group = lexical(a.group, b.group);
    if (group) return group;
    if (sort === 'price' && a.amount !== null && b.amount !== null) {
      const value = compareAmount(a.amount, b.amount); if (value) return value;
    }
    if (sort === 'discount') {
      const value = compareAmount(b.discount ?? '0', a.discount ?? '0'); if (value) return value;
    }
  }
  return lexical(b.createdAt, a.createdAt) || lexical(a.id, b.id);
}
/** O(N) engine decisions, O(batch + page + distinct facets) retained memory. */
export function createCatalogCollector(context: ShoppingContext, filters: CatalogPageFilters, cursor: string | null, limit: number, now: Date, productId?: string) {
  const locale = filters.locale ?? context.locale;
  const currency = context.displayCurrency;
  const signature = createHash('sha256').update(JSON.stringify([context, filters, productId ?? null, Math.floor(now.getTime() / 3_600_000)])).digest('hex').slice(0, 24);
  let after: Position | null = null;
  try {
    if (cursor && cursor.length <= 2048) {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { signature: string; position: Position };
      const p = decoded.position;
      if (decoded.signature === signature && p
        && typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(p.id)
        && typeof p.createdAt === 'string' && Number.isFinite(Date.parse(p.createdAt))
        && typeof p.group === 'string' && p.group.length > 0
        && (p.amount === null || (typeof p.amount === 'string' && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(p.amount)))
        && (p.discount === null || (typeof p.discount === 'string' && /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(p.discount)))) after = p;
    }
  } catch { /* An invalid/changed-state cursor restarts at page one. */ }
  const categories = new Map<string, CatalogPage['filterOptions']['categories'][number]>();
  const brands = new Set<string>(), bands = new Set<string>(), observedCurrencies = new Set<string>();
  let total = 0, hasDiscounts = false, hasRatings = false, hasVerdicts = false;
  const page: Array<{ item: CatalogPageItem; position: Position }> = [];
  const band = PRICE_BANDS.find(b => b.id === filters.price);
  return {
    add(item: CatalogPageItem, createdAt: string) {
      if (!searched(item, filters.q ?? '', locale)) return;
      const money = catalogMoney(item);
      // Home is an available-price catalog. Detail can still show unpriced metadata.
      if (!money.length) return;
      if (context.budget && !money.some(p => p.money.currency === context.budget!.currency && compareAmount(p.money.amount, context.budget!.amount) <= 0)) return;
      for (const p of money) observedCurrencies.add(p.money.currency);
      const product = item.product;
      const rated = (getShopperRating(product)?.averageRating ?? 0) >= 4;
      const worth = product.verdict?.type === 'WORTH_IT' || product.verdict?.type === 'WORTH_IT_WITH';
      const discounted = money.some(p => p.discount !== null && compareAmount(p.discount, '0') > 0);
      const label = getCategoryLabel(product.category, locale);
      if (product.category && label) categories.set(product.category.slug, { slug: product.category.slug, label, order: product.category.order ?? 0 });
      if (product.brand?.trim()) brands.add(product.brand.trim());
      for (const b of PRICE_BANDS) if (money.some(p => (currency === null || p.money.currency === currency) && compareAmount(p.money.amount, String(b.min)) >= 0 && (b.max === Infinity || compareAmount(p.money.amount, String(b.max)) < 0))) bands.add(b.id);
      hasDiscounts ||= discounted; hasRatings ||= rated; hasVerdicts ||= worth;
      if ((filters.category && product.category?.slug !== filters.category) || (filters.brand && product.brand?.trim() !== filters.brand) || (filters.rated && !rated) || (filters.worth && !worth) || (filters.discount && !discounted)) return;
      if (band && !money.some(p => (currency === null || p.money.currency === currency) && compareAmount(p.money.amount, String(band.min)) >= 0 && (band.max === Infinity || compareAmount(p.money.amount, String(band.max)) < 0))) return;
      total++;
      const key = position(item, createdAt, currency);
      if (after && compare(key, after, filters.sort) <= 0) return;
      page.push({ item, position: key });
      page.sort((a, b) => compare(a.position, b.position, filters.sort));
      if (page.length > limit + 1) page.pop();
    },
    finish(): CatalogPage {
      const visible = page.slice(0, limit);
      const priceCurrency = currency ?? (observedCurrencies.size === 1 ? [...observedCurrencies][0]! : null);
      const ambiguousBand = Boolean(band && priceCurrency === null);
      return { items: ambiguousBand ? [] : visible.map(p => p.item), total: ambiguousBand ? 0 : total, priceCurrency, nextCursor: !ambiguousBand && page.length > limit ? Buffer.from(JSON.stringify({ signature, position: visible[visible.length - 1]!.position })).toString('base64url') : null,
        filterOptions: { categories: [...categories.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, locale)), brands: [...brands].sort((a, b) => a.localeCompare(b, locale)), bands: priceCurrency ? PRICE_BANDS.filter(b => bands.has(b.id)) : [], hasDiscounts, hasRatings, hasVerdicts } };
    },
  };
}
