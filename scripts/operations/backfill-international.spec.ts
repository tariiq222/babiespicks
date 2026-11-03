/**
 * Task 3 — focused tests for the international backfill.
 *
 * Part A runs offline with synthetic fixtures (no database at all):
 *   * a legacy SAR row keeps its number, currency, ids and slugs;
 *   * no destination, seller, fulfiller or Prime/free-shipping claim is invented;
 *   * USD rows are never converted or relabelled; ambiguous records stay legacy and are counted;
 *   * dry-run is the default and every write target is screened.
 *
 * Part B runs only when TEST_DATABASE_URL points at an isolated database whose name ends with
 * `_test`. It proves the generated client still reads legacy data after the additive
 * migration, that a dry run opens no writes, that --apply needs an explicit target, and that
 * reruns are idempotent. It never touches DATABASE_URL or any non-_test database.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@babiespicks/db';
import {
  DEFAULT_OBSERVATION_MAX_AGE_SECONDS,
  LEGACY_SCOPE_KEY,
  SOURCE_POLICY_MAX_AGE_SECONDS,
  asinFromUrl,
  offerIdentity,
  parseBackfillArgs,
  parseBackfillTarget,
  planInternationalBackfill,
  runInternationalBackfill,
  type BackfillDatabase,
  type LegacyPriceRow,
} from './backfill-international';

const NOW = new Date('2026-11-02T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

interface Fixture {
  rows: LegacyPriceRow[];
  identity: { productIds: Set<string>; stores: Map<string, { slug: string; url: string }> };
}

function legacyFixture(): Fixture {
  return {
    identity: {
      productIds: new Set(['prod-1', 'prod-2']),
      stores: new Map([
        ['store-sa', { slug: 'amazon-sa', url: 'https://www.amazon.sa' }],
        ['store-us', { slug: 'amazon-us', url: 'https://www.amazon.com' }],
      ]),
    },
    rows: [
      // Older SAR row for the same product/store: copied as history, never "upgraded".
      { id: 'pp-old', productId: 'prod-1', storeId: 'store-sa', price: '149.50', originalPrice: '199.00', currency: 'SAR', url: 'https://www.amazon.sa/dp/B000000001?tag=legacy-21', inStock: true, scrapedAt: minutesAgo(120) },
      { id: 'pp-new', productId: 'prod-1', storeId: 'store-sa', price: '139.99', originalPrice: null, currency: 'SAR', url: 'https://www.amazon.sa/dp/B000000001', inStock: true, scrapedAt: minutesAgo(10) },
      // A USD row is not SAR and must never be converted or relabelled.
      { id: 'pp-usd', productId: 'prod-1', storeId: 'store-us', price: '40.00', originalPrice: null, currency: 'USD', url: 'https://www.amazon.com/dp/B000000002', inStock: true, scrapedAt: minutesAgo(5) },
      // No URL and no canonical ASIN: stays legacy instead of guessing a marketplace.
      { id: 'pp-nourl', productId: 'prod-2', storeId: 'store-sa', price: '59.00', originalPrice: null, currency: 'SAR', url: null, inStock: true, scrapedAt: minutesAgo(30) },
      { id: 'pp-search', productId: 'prod-2', storeId: 'store-sa', price: '61.00', originalPrice: null, currency: 'SAR', url: 'https://www.amazon.sa/s?k=stroller', inStock: false, scrapedAt: minutesAgo(20) },
      // Product that no longer resolves to a row.
      { id: 'pp-orphan', productId: 'prod-gone', storeId: 'store-sa', price: '10.00', originalPrice: null, currency: 'SAR', url: 'https://www.amazon.sa/dp/B000000009', inStock: true, scrapedAt: minutesAgo(60) },
    ],
  };
}

describe('international backfill — legacy SAR fixture (offline)', () => {
  it('keeps the legacy number, currency and URL without creating destination, seller or Prime claims', () => {
    const plan = planInternationalBackfill(legacyFixture());
    expect(plan.listings).toHaveLength(1);
    const [listing] = plan.listings;
    expect(listing).toMatchObject({ productId: 'prod-1', storeId: 'store-sa', marketplaceCode: 'SA', asin: 'B000000001', variantKey: '' });
    // Two SAR observations are preserved verbatim, newest first.
    expect(listing!.observations.map(observation => observation.amount)).toEqual(['139.99', '149.50']);
    expect(listing!.observations.every(observation => observation.currency === 'SAR')).toBe(true);
    expect(listing!.observations[1]!.originalAmount).toBe('199.00');
    // Provenance points at the legacy row's own URL, never a synthesised one.
    expect(listing!.observations[1]!.sourceUrl).toBe('https://www.amazon.sa/dp/B000000001?tag=legacy-21');
    // No ship-to scope, no delivery evidence, no Prime flag, no tax guess.
    expect(listing!.observations.every(observation => observation.identityKey.includes(LEGACY_SCOPE_KEY))).toBe(true);
    // Nothing beyond the storage fields exists on a planned listing: no shipTo/precision/prime field.
    expect(Object.keys(listing!).sort()).toEqual(['asin', 'identityKey', 'listingId', 'marketplaceCode', 'observations', 'offerId', 'offerIdentityKey', 'productId', 'sourceUrl', 'storeId', 'variantKey']);
    expect(JSON.stringify(listing)).not.toMatch(/shipTo|prime|freeShipping|delivery/i);
    const offer = offerIdentity('x', 'legacy-unverified-seller', null, 'UNKNOWN', 'PUBLIC', 1);
    expect(offer).toContain('legacy-unverified-seller');
    expect(offer.includes('undefined')).toBe(false);
    expect(plan.listings[0]!.observations[0]!.availability).toBe('AVAILABLE');
  });

  it('records USD and ambiguous rows as legacy and counts them instead of converting or merging', () => {
    const plan = planInternationalBackfill(legacyFixture());
    const reasons = Object.fromEntries(plan.legacyRecords.map(record => [record.legacyId, record.reason]));
    expect(reasons['pp-usd']).toMatch(/not SAR/);
    expect(reasons['pp-nourl']).toMatch(/no source URL/);
    expect(reasons['pp-search']).toMatch(/no canonical ASIN/);
    expect(reasons['pp-orphan']).toMatch(/product is missing/);
    expect(plan.legacyRecords).toHaveLength(4);
    expect(plan.rowCount).toBe(6);
    // Nothing was merged: prod-1 and prod-2 never share a listing.
    expect(new Set(plan.listings.map(listing => listing.productId))).toEqual(new Set(['prod-1']));
  });

  it('keeps a whole store legacy when rows disagree on marketplace or lack an ASIN', () => {
    const fixture = legacyFixture();
    fixture.rows.push({ id: 'pp-com', productId: 'prod-2', storeId: 'store-us', price: '20.00', originalPrice: null, currency: 'SAR', url: 'https://www.amazon.com/dp/B000000003', inStock: true, scrapedAt: minutesAgo(2) });
    fixture.rows.push({ id: 'pp-com-bad', productId: 'prod-2', storeId: 'store-us', price: '19.00', originalPrice: null, currency: 'SAR', url: 'https://www.amazon.com/gp/help/customer/display.html', inStock: true, scrapedAt: minutesAgo(1) });
    const plan = planInternationalBackfill(fixture);
    expect(plan.listings).toHaveLength(1);
    const ids = plan.legacyRecords.map(record => record.legacyId);
    expect(ids).toContain('pp-com');
    expect(ids).toContain('pp-com-bad');
  });

  it('uses deterministic ids so a rerun produces the same identity keys', () => {
    const first = planInternationalBackfill(legacyFixture());
    const second = planInternationalBackfill(legacyFixture());
    expect(second).toEqual(first);
    expect(first.listings[0]!.listingId).toMatch(/^lst-[0-9a-f]{24}$/);
    expect(first.listings[0]!.offerId).toMatch(/^off-[0-9a-f]{24}$/);
  });

  it('reads only canonical ASIN paths', () => {
    expect(asinFromUrl('https://www.amazon.sa/dp/B000000001/ref=x')).toBe('B000000001');
    expect(asinFromUrl('https://www.amazon.sa/gp/product/b000000001')).toBe('B000000001');
    expect(asinFromUrl('https://amazon.sa.evil.test/dp/B000000001')).toBe('B000000001'); // path-only parser; domain gate rejects it separately
    expect(asinFromUrl('https://www.amazon.sa/search?q=B000000001')).toBeNull();
    const plan = planInternationalBackfill({ identity: { productIds: new Set(['p']), stores: new Map([['s', { slug: 's', url: 'https://www.amazon.sa' }]]) }, rows: [{ id: 'r', productId: 'p', storeId: 's', price: '1', originalPrice: null, currency: 'SAR', url: 'https://amazon.sa.evil.test/dp/B000000001', inStock: true, scrapedAt: NOW }] });
    expect(plan.listings).toHaveLength(0);
  });

  it('treats a missing price as an observation without amount, never as zero', () => {
    const plan = planInternationalBackfill({ identity: { productIds: new Set(['p']), stores: new Map([['s', { slug: 's', url: 'https://www.amazon.sa' }]]) }, rows: [{ id: 'r', productId: 'p', storeId: 's', price: null, originalPrice: null, currency: 'SAR', url: 'https://www.amazon.sa/dp/B000000001', inStock: false, scrapedAt: NOW }] });
    expect(plan.listings[0]!.observations[0]).toMatchObject({ amount: null, currency: null, availability: 'UNKNOWN', originalAmount: null });
  });
});

describe('international backfill — dry-run default and target screening', () => {
  function fakeDb(rows: LegacyPriceRow[], calls: { writes: number }): BackfillDatabase {
    const products = [...new Set(rows.map(row => row.productId))].map(id => ({ id }));
    const stores = [...new Set(rows.map(row => row.storeId))].map(id => ({ id, slug: id, url: 'https://www.amazon.sa' }));
    return {
      productPrice: { findMany: async () => rows },
      product: { findMany: async () => products },
      store: { findMany: async () => stores },
      legacyPriceMapping: { findMany: async () => [] },
      $transaction: async <R>(fn: (tx: never) => Promise<R>): Promise<R> => {
        calls.writes++;
        return fn({} as never);
      },
    } as unknown as BackfillDatabase;
  }

  it('does not write without --apply and reports what would migrate', async () => {
    const calls = { writes: 0 };
    const rows = legacyFixture().rows.filter(row => row.currency === 'SAR' && row.url?.includes('/dp/'));
    const { report } = await runInternationalBackfill(fakeDb(rows, calls), {}, { now: () => NOW });
    expect(calls.writes).toBe(0);
    expect(report.applied).toBe(false);
    expect(report.target).toBeNull();
    expect(report.counts.converted).toBe(0);
    expect(report.counts.merged).toBe(0);
    expect(report.counts.deliveryEvidenceCreated).toBe(0);
    expect(report.counts.fxSnapshotsCreated).toBe(0);
    // Dry run reports what a write run would do, so `migrated` counts planned rows here.
    expect(report.counts.priceRowsSeen).toBe(rows.length);
    expect(report.policy.observationRetentionSeconds).toBe(DEFAULT_OBSERVATION_MAX_AGE_SECONDS);
    expect(report.policy.observationRetentionSeconds).toBeLessThanOrEqual(SOURCE_POLICY_MAX_AGE_SECONDS);
    expect(report.policy.deliveryMaxAgeSeconds).toBeNull();
  });

  it('refuses to write without an explicit, screened target', async () => {
    const calls = { writes: 0 };
    const db = fakeDb(legacyFixture().rows, calls);
    await expect(runInternationalBackfill(db, { apply: true }, { now: () => NOW })).rejects.toThrow(/explicit target/);
    await expect(runInternationalBackfill(db, { apply: true, target: { mode: 'database-url', url: 'postgresql://u:p@db.babiespicks.com/babiespicks' } }, { now: () => NOW })).rejects.toThrow(/_test/);
    await expect(runInternationalBackfill(db, { apply: true, target: { mode: 'database-url', url: 'postgresql://u:p@127.0.0.1:1/babiespicks_production_test' } }, { now: () => NOW })).rejects.toThrow(/not allowed/);
    expect(calls.writes).toBe(0);
  });

  it('accepts a local _test database and a local test stack, and redacts the target', () => {
    expect(parseBackfillTarget({ mode: 'database-url', url: 'postgresql://user:secret@127.0.0.1:55439/x_test' })).toMatchObject({ databaseName: 'x_test', local: true });
    expect(parseBackfillTarget({ mode: 'local-test-stack', port: 55439, database: 'bp_backfill_test' }).url).toBe('postgresql://postgres:local-test-only-not-a-secret@127.0.0.1:55439/bp_backfill_test');
    expect(() => parseBackfillTarget({ mode: 'local-test-stack', port: 55439, database: 'bp_backfill' })).toThrow(/_test/);
    expect(() => parseBackfillTarget({ mode: 'database-url', url: 'postgresql://u:p@db.babiespicks.com:5432/babiespicks_test' })).not.toThrow();
    expect(() => parseBackfillTarget({ mode: 'database-url', url: 'mysql://u:p@127.0.0.1/x_test' })).toThrow(/postgresql/);
    expect(() => parseBackfillTarget(null)).toThrow(/explicit target/);
  });

  it('parses CLI flags without granting a target by accident', () => {
    expect(parseBackfillArgs([], {}).apply).toBe(false);
    expect(parseBackfillArgs([], {}).target).toBeNull();
    expect(() => parseBackfillArgs(['--apply'], {})).toThrow(/No target/);
    expect(parseBackfillArgs(['--apply', '--local-test-stack', '--port=55440'], {}).target).toMatchObject({ mode: 'local-test-stack', port: 55440 });
    expect(parseBackfillArgs(['--apply', '--database-url=postgresql://u:p@127.0.0.1:5/x_test'], {}).target).toMatchObject({ mode: 'database-url' });
    expect(() => parseBackfillArgs(['--apply', '--yes'], {})).toThrow(/Unknown argument/);
    expect(parseBackfillArgs(['--max-age-seconds=99999'], {}).observationMaxAgeSeconds).toBe(99999);
  });
});

// ── Part B: isolated database integration ───────────────────────────────────

const rawTestUrl = process.env.TEST_DATABASE_URL;
const parsedTestUrl = rawTestUrl ? new URL(rawTestUrl) : null;
if (parsedTestUrl && (!parsedTestUrl.pathname.endsWith('_test') || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedTestUrl.hostname))) {
  throw new Error('TEST_DATABASE_URL must be a local isolated database whose name ends with _test');
}
const testUrl = rawTestUrl && parsedTestUrl ? rawTestUrl : undefined;
const databaseDescribe = testUrl ? describe : describe.skip;
databaseDescribe('international backfill — isolated _test database', () => {
  const url = testUrl ?? 'postgresql://localhost/not_used_test';
  const db = new PrismaClient({ datasources: { db: { url } } });
  const stamp = `t3-${Date.now()}`;
  const productSlug = `${stamp}-stroller`;
  const storeSlug = `${stamp}-store`;
  const usStoreSlug = `${storeSlug}-us`;
  const asin = `B${String(Date.now()).slice(-9)}`;
  /** Every write this suite makes is tagged, so cleanup removes exactly these rows. */
  const tag = `https://www.amazon.sa/dp/${asin}?stamp=${stamp}`;

  async function cleanup() {
    await db.legacyPriceMapping.deleteMany({ where: { offer: { listing: { product: { slug: productSlug } } } } });
    await db.offerPriceObservation.deleteMany({ where: { offer: { listing: { product: { slug: productSlug } } } } });
    await db.purchaseOffer.deleteMany({ where: { listing: { product: { slug: productSlug } } } });
    await db.marketplaceListing.deleteMany({ where: { product: { slug: productSlug } } });
    await db.productPrice.deleteMany({ where: { product: { slug: productSlug } } });
    await db.product.deleteMany({ where: { slug: productSlug } });
    await db.store.deleteMany({ where: { slug: { in: [storeSlug, usStoreSlug] } } });
  }

  async function seed() {
    const store = await db.store.create({ data: { name: 'Legacy Amazon store', slug: storeSlug, url: 'https://www.amazon.sa' } });
    const product = await db.product.create({ data: { name: 'Legacy stroller', slug: productSlug } });
    const usStore = await db.store.create({ data: { name: 'Legacy US store', slug: usStoreSlug, url: 'https://www.amazon.com' } });
    const older = await db.productPrice.create({ data: { id: `${stamp}-price-old`, productId: product.id, storeId: store.id, price: '159.25', originalPrice: null, currency: 'SAR', url: tag, inStock: true, scrapedAt: new Date(NOW.getTime() - 120 * 60_000) } });
    // A distinct legitimate price change (different amount => different observation identity).
    const newer = await db.productPrice.create({ data: { id: `${stamp}-price-new`, productId: product.id, storeId: store.id, price: '149.50', originalPrice: '199.00', currency: 'SAR', url: tag, inStock: true, scrapedAt: new Date(NOW.getTime() - 10 * 60_000) } });
    const usd = await db.productPrice.create({ data: { id: `${stamp}-price-usd`, productId: product.id, storeId: usStore.id, price: '40.00', originalPrice: null, currency: 'USD', url: `https://www.amazon.com/dp/B000000002?stamp=${stamp}`, inStock: true, scrapedAt: NOW } });
    return { product, store, usStore, older, newer, usd };
  }

  const scopedRun = (options: Parameters<typeof runInternationalBackfill>[1] = {}) =>
    runInternationalBackfill(db as unknown as BackfillDatabase, options, { now: () => NOW });
  const target = { mode: 'database-url', url } as const;

  beforeEach(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await db.$disconnect(); });

  it('legacy readers keep the same product id, slug, amount and currency; new columns stay null', async () => {
    const seeded = await seed();
    const price = await db.productPrice.findUniqueOrThrow({ where: { id: seeded.newer.id }, include: { product: true, store: true } });
    expect(String(price.price)).toBe('149.5');
    expect(price.currency).toBe('SAR');
    expect(price.product.slug).toBe(productSlug);
    expect(price.productId).toBe(seeded.product.id);
    expect(price.store.slug).toBe(storeSlug);
    // Legacy context is visibly unknown, never inferred from the store name or domain.
    expect(price.store.marketplaceCode).toBeNull();
    expect(price.store.trackingId).toBeNull();
    expect(price.store.nameAr).toBeNull();
    // And the legacy relation API used by existing readers still works unchanged.
    const products = await db.product.findMany({ where: { prices: { some: { storeId: seeded.store.id } } }, include: { prices: true } });
    expect(products.map(product => product.id)).toEqual([seeded.product.id]);
  });

  it('dry run writes nothing and --apply refuses to run without a screened target', async () => {
    const seeded = await seed();
    const dry = await scopedRun();
    expect(dry.report.applied).toBe(false);
    expect(dry.report.target).toBeNull();
    expect(dry.report.counts.priceRowsSeen).toBeGreaterThan(0);
    expect(await db.marketplaceListing.count({ where: { productId: seeded.product.id } })).toBe(0);

    await expect(scopedRun({ apply: true })).rejects.toThrow(/explicit target/);
    await expect(scopedRun({ apply: true, target: { mode: 'database-url', url: 'postgresql://u:p@db.babiespicks.com/babiespicks' } })).rejects.toThrow();
    await expect(scopedRun({ apply: true, target: { mode: 'database-url', url: 'postgresql://u:p@127.0.0.1:5432/babiespicks_production_test' } })).rejects.toThrow(/not allowed/);
    expect(await db.marketplaceListing.count({ where: { productId: seeded.product.id } })).toBe(0);
    expect(await db.offerPriceObservation.count({ where: { sourceId: 'legacy-sar-backfill' } })).toBe(0);
  });

  it('apply copies SAR amounts verbatim, leaves USD and context unknown, and does not invent delivery or FX', async () => {
    const seeded = await seed();
    const first = await scopedRun({ apply: true, target });
    expect(first.report.applied).toBe(true);
    expect(first.report.databaseName).toBe(new URL(url).pathname.slice(1));
    expect(first.report.target).toMatch(/\*\*\*@|postgresql:\/\/[a-z]+@/);
    expect(first.report.target).not.toContain('probeonly');

    const listing = await db.marketplaceListing.findFirstOrThrow({ where: { productId: seeded.product.id }, include: { offers: { include: { priceObservations: true } } } });
    expect(listing).toMatchObject({ storeId: seeded.store.id, marketplaceCode: 'SA', asin, variantKey: '' });
    expect(listing.productId).toBe(seeded.product.id);
    const offer = listing.offers[0]!;
    expect(offer).toMatchObject({ sellerKey: 'legacy-unverified-seller', fulfillerKey: null, condition: 'UNKNOWN', audience: 'PUBLIC', version: 1 });
    // The two legacy rows are distinct observations; the newer one keeps its discount basis.
    expect(offer.priceObservations.map(observation => String(observation.amount)).sort()).toEqual(['149.5', '159.25']);
    for (const observation of offer.priceObservations) {
      expect(observation).toMatchObject({ scopeKey: LEGACY_SCOPE_KEY, shipTo: null, currency: 'SAR', availability: 'AVAILABLE', taxBasis: 'UNKNOWN', sourceId: 'legacy-sar-backfill' });
      expect(observation.expiresAt.getTime() - observation.checkedAt.getTime()).toBe(DEFAULT_OBSERVATION_MAX_AGE_SECONDS * 1000);
      expect(observation.expiresAt.getTime() - observation.checkedAt.getTime()).toBeLessThanOrEqual(SOURCE_POLICY_MAX_AGE_SECONDS * 1000);
    }
    const newest = offer.priceObservations.find(observation => String(observation.amount) === '149.5')!;
    expect(String(newest.originalAmount)).toBe('199');
    expect(await db.offerDeliveryEvidence.count({ where: { offerId: offer.id } })).toBe(0);
    expect(await db.fxSnapshot.count()).toBe(0);
    expect(first.report.counts).toMatchObject({ converted: 0, merged: 0, deliveryEvidenceCreated: 0, fxSnapshotsCreated: 0 });
    expect(first.report.legacyRecords.map(record => record.legacyId)).toContain(seeded.usd.id);
    expect(await db.legacyPriceMapping.count({ where: { offerId: offer.id } })).toBe(2);

    // Legacy rows are untouched: same ids, amounts and currencies (USD is still USD).
    const legacy = await db.productPrice.findMany({ where: { productId: seeded.product.id }, orderBy: { scrapedAt: 'asc' } });
    expect(legacy.map(row => [row.id, row.currency, String(row.price)])).toEqual([
      [`${stamp}-price-old`, 'SAR', '159.25'],
      [`${stamp}-price-new`, 'SAR', '149.5'],
      [`${stamp}-price-usd`, 'USD', '40'],
    ]);
  });

  it('a rerun maps instead of copying again', async () => {
    const seeded = await seed();
    await scopedRun({ apply: true, target });
    const second = await scopedRun({ apply: true, target });
    expect(second.report.counts.migrated).toBe(0);
    expect(second.report.counts.mapped).toBe(2);
    expect(await db.marketplaceListing.count({ where: { productId: seeded.product.id } })).toBe(1);
    expect(await db.offerPriceObservation.count({ where: { offer: { listing: { productId: seeded.product.id } } } })).toBe(2);
  });

  it('recreates the legacy series next to a newer writer observation without duplicating either', async () => {
    const seeded = await seed();
    await scopedRun({ apply: true, target });
    // A newer writer observation already covers the newer legacy row.
    const listing = await db.marketplaceListing.findFirstOrThrow({ where: { productId: seeded.product.id } });
    const offer = await db.purchaseOffer.findFirstOrThrow({ where: { listingId: listing.id } });
    await db.offerPriceObservation.deleteMany({ where: { offerId: offer.id } });
    await db.legacyPriceMapping.deleteMany({ where: { offerId: offer.id } });
    await db.offerPriceObservation.create({ data: { offerId: offer.id, scopeKey: 'public-in-marketplace', shipTo: null, amount: '140.00', currency: 'SAR', availability: 'AVAILABLE', taxBasis: 'UNKNOWN', sourceId: 'amazon-creators-api-sa', sourceUrl: 'https://www.amazon.sa/dp/current', checkedAt: new Date(NOW.getTime() - 60_000), expiresAt: new Date(NOW.getTime() + 3_500_000), identityKey: `${stamp}-newer-writer` } });
    const outcome = await scopedRun({ apply: true, target });
    const stored = await db.offerPriceObservation.findMany({ where: { offerId: offer.id } });
    // The writer's row is untouched; both distinct legacy rows are added verbatim.
    expect(stored.map(row => [String(row.amount), row.sourceId])).toContainEqual(['140', 'amazon-creators-api-sa']);
    expect(stored.filter(row => row.sourceId === 'legacy-sar-backfill').map(row => String(row.amount)).sort()).toEqual(['149.5', '159.25']);
    expect(outcome.report.counts.migrated).toBe(2);
  });

  it('the identityKey unique index has no NULL escape hatch', async () => {
    const seeded = await seed();
    const identity = `${stamp}-identity`;
    await db.marketplaceListing.create({ data: { productId: seeded.product.id, storeId: seeded.store.id, marketplaceCode: 'SA', asin, sourceUrl: 'https://www.amazon.sa/dp/x', identityKey: identity } });
    await expect(db.marketplaceListing.create({ data: { productId: seeded.product.id, storeId: seeded.store.id, marketplaceCode: 'SA', asin, sourceUrl: 'https://www.amazon.sa/dp/y', identityKey: identity } })).rejects.toThrow();
    await expect(db.marketplaceListing.create({ data: { productId: seeded.product.id, storeId: seeded.store.id, marketplaceCode: 'SA', asin, sourceUrl: 'https://www.amazon.sa/dp/z', identityKey: null as unknown as string } })).rejects.toThrow();
  });
});
