import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@babiespicks/db';
import { executeTool } from './index';

const url = process.env.TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.endsWith('_test')) throw new Error('Local isolated _test database required');
}

describe.skipIf(!url)('marketplace metadata on real PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://postgres:test@localhost/not_connected_test' } } });
  const owner = { id: `offer-owner-${randomUUID()}`, canPublish: true };
  const run = (name: string, args: unknown) => executeTool(name, args, owner, db) as Promise<any>;
  afterAll(() => db.$disconnect());

  async function fixture() {
    const key = `offer-sql-${randomUUID()}`;
    const product = await run('bp_create_product', { name: 'Isolated offer fixture', slug: key, idempotencyKey: `${key}-product` });
    const store = await run('bp_upsert_store', { name: 'Isolated SA store', slug: key, url: 'https://amazon.sa/?tag=test-sa-21', idempotencyKey: `${key}-store` });
    const listingInput = { productId: product.id, storeId: store.id, marketplaceCode: 'SA', asin: 'B000000001', variantKey: 'default', sourceUrl: 'https://amazon.sa/dp/B000000001' };
    const listing = (await run('bp_upsert_listing', { ...listingInput, idempotencyKey: `${key}-listing` })).record;
    const offerInput = { listingId: listing.id, sellerKey: 'seller', fulfillerKey: 'fulfiller', condition: 'NEW', audience: 'PUBLIC' };
    const offer = (await run('bp_upsert_offer', { ...offerInput, idempotencyKey: `${key}-offer` })).record;
    return { key, product, store, listing, listingInput, offer, offerInput };
  }

  it('serializes competing listing edits and saves one corresponding revision', async () => {
    const f = await fixture();
    const before = await db.product.findUniqueOrThrow({ where: { id: f.product.id } });
    const outcomes = await Promise.allSettled(['a', 'b'].map(value => run('bp_upsert_listing', {
      ...f.listingInput, id: f.listing.id, productVersion: before.version,
      sourceUrl: `https://amazon.sa/dp/B000000001?variant=${value}`, idempotencyKey: `${f.key}-${value}`,
    })));
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(item => item.status === 'rejected').map(item => item.reason.code)).toEqual(['VERSION_CONFLICT']);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).version).toBe(before.version + 1);
    expect(await db.contentRevision.count({ where: { entityType: 'listing', entityId: f.listing.id } })).toBe(2);
  });

  it('rejects stale offer versions even when the requested state now matches', async () => {
    const f = await fixture();
    const changed = { ...f.offerInput, id: f.offer.id, expectedVersion: f.offer.version, isActive: false };
    await run('bp_upsert_offer', { ...changed, idempotencyKey: `${f.key}-disable` });
    await expect(run('bp_upsert_offer', { ...changed, idempotencyKey: `${f.key}-stale` })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await db.contentRevision.count({ where: { entityType: 'offer', entityId: f.offer.id } })).toBe(2);
  });

  it('replays identical overlapping offer retries without duplicate versions or revisions', async () => {
    const f = await fixture();
    const before = await db.product.findUniqueOrThrow({ where: { id: f.product.id } });
    const input = { ...f.offerInput, id: f.offer.id, expectedVersion: f.offer.version, isActive: false, idempotencyKey: `${f.key}-same-retry` };
    const [first, second] = await Promise.all([run('bp_upsert_offer', input), run('bp_upsert_offer', input)]);
    expect(second).toEqual(first);
    expect(first.record.version).toBe(2);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).version).toBe(before.version + 1);
    expect(await db.contentRevision.count({ where: { entityType: 'offer', entityId: f.offer.id } })).toBe(2);
  });

  it('requires explicit permission and current product version for a published listing creation', async () => {
    const f = await fixture();
    const current = await db.product.findUniqueOrThrow({ where: { id: f.product.id } });
    const published = await run('bp_set_status', { entityType: 'product', id: current.id, expectedVersion: current.version, status: 'PUBLISHED', confirm: true, idempotencyKey: `${f.key}-publish` });
    const input = { ...f.listingInput, variantKey: 'second', productVersion: published.version };
    await expect(run('bp_upsert_listing', { ...input, idempotencyKey: `${f.key}-no-confirm` })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    const result = await run('bp_upsert_listing', { ...input, allowPublishedEdit: true, idempotencyKey: `${f.key}-confirmed` });
    expect(result.record.productVersion).toBe(published.version + 1);
  });

  it('does not alter editorial versions or revisions when recording a legacy price', async () => {
    const f = await fixture();
    const before = await db.product.findUniqueOrThrow({ where: { id: f.product.id } });
    const revisions = await db.contentRevision.count();
    await run('bp_record_price', { productId: f.product.id, storeId: f.store.id, amount: 10, currency: 'SAR', sourceUrl: f.listingInput.sourceUrl, checkedAt: new Date().toISOString(), idempotencyKey: `${f.key}-price` });
    expect((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).version).toBe(before.version);
    expect(await db.contentRevision.count()).toBe(revisions);
  });

  it.each(['0.000001', '99999999999999.123456'])('persists coupon amount %s without rounding or overflow', async amount => {
    const f = await fixture();
    const coupon = await run('bp_upsert_coupon', { storeId: f.store.id, code: 'LOCALONLY', discountAmount: amount, couponCurrency: 'SAR', idempotencyKey: `${f.key}-coupon` });
    const saved = await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(saved.discountAmount?.toFixed(6)).toBe(amount);
  });
});
