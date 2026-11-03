/**
 * Task 4 — offer mutation writer tests.
 *
 * Part A runs offline against an in-memory store that behaves like the Prisma surface the
 * writer touches (unique identity, no NULL escape hatch, transaction rollback). It proves the
 * rules that must never depend on the database: server-only actor identity, published-edit
 * grants, version conflicts, policy-derived expiry, server-derived scope, separate member and
 * destination scopes, fail-closed sources, and idempotent retries after an ambiguous commit.
 *
 * The database half (real OAuth -> MCP SDK -> PostgreSQL) lives in
 * apps/mcp/src/postgres.integration.test.ts and runs only on an isolated `_test` database.
 */

import { describe, expect, it, vi } from 'vitest';

// SA policy as if Task 1 had verified it: only the policy gate changes, never a business rule.
// `enforcement` lets an individual test keep the real fail-closed gate so a guessed source is
// still rejected. The hook is inert for every other test.
const approval = vi.hoisted(() => ({ enforce: false }));
vi.mock('./source-policy', async () => {
  const actual = await vi.importActual<typeof import('./source-policy')>('./source-policy');
  const policy = (sourceId: string, marketplaceCode: string) => Object.freeze({
    sourceId,
    marketplaceCode: marketplaceCode as 'SA' | 'US',
    transport: 'CREATORS_API_OAUTH2',
    priceMaxAgeSeconds: 3600,
    deliveryMaxAgeSeconds: 3600,
    retentionSeconds: 3600,
    enabled: true,
    allowConversion: false,
    allowAssistant: false,
    allowBareLink: false,
    status: 'VERIFIED' as const,
  });
  return {
    ...actual,
    resolveSourcePolicy: (sourceId: string, marketplaceCode: string) => (approval.enforce ? actual.resolveSourcePolicy(sourceId, marketplaceCode) : (actual.resolveSourcePolicy(sourceId, marketplaceCode), policy(sourceId, marketplaceCode))),
    requireEnabledSourcePolicy: (sourceId: string, marketplaceCode: string) => (approval.enforce ? actual.requireEnabledSourcePolicy(sourceId, marketplaceCode) : (actual.resolveSourcePolicy(sourceId, marketplaceCode), policy(sourceId, marketplaceCode))),
  };
});
vi.mock('@babiespicks/db', () => ({ prisma: {} }));

import { DomainError } from './errors';
import {
  CLOCK_SKEW_SECONDS,
  applyOfferMutation,
  identityKey,
  offerMutationInputHash,
  type MutationDb,
  type OfferMutationActor,
} from './offer-mutations';

const NOW = new Date('2026-11-02T12:00:00.000Z');
const NOW_MS = NOW.getTime();
const iso = (date: Date) => date.toISOString();
const minutesAgo = (minutes: number) => new Date(NOW_MS - minutes * 60_000);
const secondsAgo = (seconds: number) => new Date(NOW_MS - seconds * 1000);

const editor: OfferMutationActor = { id: 'editor:static', canPublish: false };
const publisher: OfferMutationActor = { id: 'oauth:owner', canPublish: true };
const SA_URL = 'https://www.amazon.sa/dp/B000000001';
const US_URL = 'https://www.amazon.com/dp/B000000002';

type Row = Record<string, any>;

// ── In-memory database double ───────────────────────────────────────────────

interface Seed {
  products?: Row[];
  stores?: Row[];
  listings?: Row[];
  offers?: Row[];
}

class Conflict extends Error {
  constructor(public readonly field: string) { super(`unique ${field}`); }
}

function store(seed: Seed = {}) {
  const state = {
    product: [...(seed.products ?? [])],
    store: [...(seed.stores ?? [])],
    marketplaceListing: [...(seed.listings ?? [])],
    purchaseOffer: [...(seed.offers ?? [])],
    offerPriceObservation: [] as Row[],
    offerDeliveryEvidence: [] as Row[],
    fxSnapshot: [] as Row[],
    operationReceipt: [] as Row[],
    contentRevision: [] as Row[],
    writes: [] as string[],
  };
  type Model = keyof typeof state & 'product' | 'store' | 'marketplaceListing' | 'purchaseOffer' | 'offerPriceObservation' | 'offerDeliveryEvidence' | 'fxSnapshot' | 'operationReceipt' | 'contentRevision';
  let sequence = 0;
  const model = (name: Model) => {
    const rows = state[name] as Row[];
    const findOne = (where: Row): Row | undefined => rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value));
    return {
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        const row = findOne(where);
        if (!row) return null;
        const copy = { ...row };
        if (include?.product && (row.productId || row.listingId)) {
          const listing = state.marketplaceListing.find(item => item.id === (row.listingId ?? row.id));
          if (listing) copy.product = state.product.find(item => item.id === listing.productId) ?? null;
          if (row.productId) copy.product = state.product.find(item => item.id === row.productId) ?? null;
          if (include.product === true || include.listing) {
            copy.listing = { ...listing, product: copy.product };
          }
        }
        if (include?.listing) {
          const listing = state.marketplaceListing.find(item => item.id === row.listingId) ?? null;
          copy.listing = listing ? { ...listing, product: state.product.find(item => item.id === listing.productId) } : null;
        }
        return copy;
      },
      findUniqueOrThrow: async ({ where }: { where: Row }) => {
        const row = findOne(where);
        if (!row) throw new Error(`P2025 ${name}`);
        return { ...row };
      },
      findMany: async ({ where }: { where?: Row } = {}) => rows.filter(row => !where || Object.entries(where).every(([key, value]) => row[key] === value)).map(row => ({ ...row })),
      create: async ({ data }: { data: Row }) => {
        state.writes.push(`create:${name}`);
        if (data.identityKey && rows.some(row => row.identityKey === data.identityKey)) throw new Conflict('identityKey');
        if (name === 'operationReceipt' && rows.some(row => row.key === data.key)) throw new Conflict('key');
        const row = { id: `${name}-${++sequence}`, createdAt: new Date(NOW_MS), ...data };
        rows.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        state.writes.push(`update:${name}`);
        const index = rows.findIndex(row => Object.entries(where).every(([key, value]) => row[key] === value));
        if (index < 0) throw new Error(`P2025 ${name}`);
        const next: Row = { ...rows[index] };
        for (const [key, value] of Object.entries(data)) next[key] = value && typeof value === 'object' && 'increment' in value ? (next[key] ?? 0) + value.increment : value;
        rows[index] = next;
        return { ...next };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (let i = 0; i < rows.length; i++) {
          if (!Object.entries(where).every(([key, value]) => rows[i]![key] === value)) continue;
          const next = { ...rows[i] };
          for (const [key, value] of Object.entries(data)) next[key] = value && typeof value === 'object' && 'increment' in value ? (next[key] ?? 0) + value.increment : value;
          rows[i] = next; count++;
        }
        if (count) state.writes.push(`update:${name}`);
        return { count };
      },
      count: async ({ where }: { where?: Row } = {}) => rows.filter(row => !where || Object.entries(where).every(([key, value]) => row[key] === value)).length,
    };
  };
  const db = {
    product: model('product'),
    store: model('store'),
    marketplaceListing: model('marketplaceListing'),
    purchaseOffer: model('purchaseOffer'),
    offerPriceObservation: model('offerPriceObservation'),
    offerDeliveryEvidence: model('offerDeliveryEvidence'),
    fxSnapshot: model('fxSnapshot'),
    operationReceipt: model('operationReceipt'),
    contentRevision: model('contentRevision'),
    async $queryRaw(..._args:unknown[]){return [];},
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const snapshot = JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'writes')));
      try {
        return await fn(db);
      } catch (error) {
        for (const [name, rows] of Object.entries(JSON.parse(snapshot))) (state[name as Model] as Row[]).splice(0, (state[name as Model] as Row[]).length, ...rows as Row[]);
        throw error;
      }
    },
  };
  return { db, state };
}

/** The same receipt/key discipline as `executeTool`, over the double. */
async function driver(db: ReturnType<typeof store>['db'], name: string, args: Row, actor: OfferMutationActor, now = NOW) {
  const key = JSON.stringify({ actor: actor.id, name, key: args.idempotencyKey });
  const inputHash = offerMutationInputHash(name, args as Record<string, unknown>);
  const existing = await db.operationReceipt.findUnique({ where: { key } });
  if (existing) {
    if (existing.inputHash !== inputHash) throw new DomainError('IDEMPOTENCY_CONFLICT', 'Operation key reused with different input');
    return existing.result;
  }
  return db.$transaction(async tx => {
    const result = await applyOfferMutation(tx as unknown as MutationDb, name as any, args, actor, { now: () => now });
    const serialized = JSON.parse(JSON.stringify(result));
    await db.operationReceipt.create({ data: { key, inputHash, result: serialized } });
    return serialized;
  });
}

function seedState(overrides: { publishStatus?: string; productVersion?: number } = {}) {
  const { db, state } = store({
    products: [{ id: 'prod-1', slug: 'stroller', publishStatus: overrides.publishStatus ?? 'DRAFT', version: overrides.productVersion ?? 3 }],
    stores: [
      { id: 'store-sa', slug: 'amazon-sa', name: 'Amazon SA', marketplaceCode: 'SA' },
      { id: 'store-us', slug: 'amazon-us', name: 'Amazon US', marketplaceCode: 'US' },
    ],
  });
  return { db, state };
}

const listingArgs = (extra: Row = {}) => ({ productId: 'prod-1', storeId: 'store-sa', marketplaceCode: 'SA', asin: 'B000000001', variantKey: 'default', sourceUrl: SA_URL, idempotencyKey: 'listing-1', ...extra });
const offerArgs = (extra: Row = {}) => ({ listingId: 'listing', sellerKey: 'seller-a', fulfillerKey: 'amazon-sa', condition: 'NEW', audience: 'PUBLIC', idempotencyKey: 'offer-1', ...extra });
const priceArgs = (extra: Row = {}) => ({
  offerId: 'offer', marketplaceCode: 'SA', sourceId: 'amazon-creators-api-sa', sourceUrl: `${SA_URL}?tag=${'x'}`, checkedAt: iso(minutesAgo(5)),
  sellerKey: 'seller-a', fulfillerKey: 'amazon-sa', shipTo: null, audience: 'PUBLIC', taxBasis: 'UNKNOWN',
  availability: 'AVAILABLE', price: { amount: '149.50', currency: 'SAR' }, originalPrice: null, idempotencyKey: 'price-1', ...extra,
});

const deliveryArgs = (extra: Row = {}) => ({
  offerId: 'offer', marketplaceCode: 'SA', sourceId: 'amazon-creators-api-sa', sourceUrl: `${SA_URL}?tag=${'x'}`, checkedAt: iso(minutesAgo(5)),
  sellerKey: 'seller-a', fulfillerKey: 'amazon-sa', country: 'SA', precision: 'COUNTRY', state: 'OBSERVED_AVAILABLE', idempotencyKey: 'delivery-1', ...extra,
});
const fxArgs = (extra: Row = {}) => ({ base: 'USD', rates: { SAR: '3.7501', USD: '1' }, sourceId: 'amazon-creators-api-sa', asOf: iso(minutesAgo(5)), idempotencyKey: 'fx-1', ...extra });

/** Seed the listing/offer rows directly so no receipt is consumed by the setup. */
async function seededOffer(options: { publishStatus?: string; productVersion?: number } = {}) {
  const world = seedState(options);
  const listing: Row = await world.db.marketplaceListing.create({
    data: {
      productId: 'prod-1', storeId: 'store-sa', marketplaceCode: 'SA', asin: 'B000000001', variantKey: 'default',
      sourceUrl: SA_URL, identityKey: identityKey(['listing', 'prod-1', 'store-sa', 'SA', 'B000000001', 'default']),
    },
  });
  const offer: Row = await world.db.purchaseOffer.create({
    data: {
      listingId: listing.id, sellerKey: 'seller-a', fulfillerKey: 'amazon-sa', condition: 'NEW', audience: 'PUBLIC', version: 1, isActive: true,
      identityKey: identityKey(['offer', listing.identityKey, 'seller-a', 'amazon-sa', 'NEW', 'PUBLIC', 1]),
    },
  });
  world.state.writes.length = 0;
  return { ...world, listing, offer };
}

// ── Part A ──────────────────────────────────────────────────────────────────

describe('offer mutation identity and grants come from the server actor', () => {
  it('lists a product listing once per canonical identity and reports the owning product version', async () => {
    const { db } = seedState();
    const created = await driver(db, 'bp_upsert_listing', listingArgs(), editor);
    expect(created.record).toMatchObject({ marketplaceCode: 'SA', asin: 'B000000001', variantKey: 'default', productVersion: 4 });
    expect(created.record.identityKey).toContain('b000000001');
    const again = await driver(db, 'bp_upsert_listing', listingArgs({ idempotencyKey: 'listing-2', variantKey: 'DEFAULT' }), editor);
    expect(again.record.id).toBe(created.record.id);
    expect(again.record.created).toBe(false);
  });

  it('refuses a listing for a store registered to another marketplace', async () => {
    const { db } = seedState();
    await expect(driver(db, 'bp_upsert_listing', listingArgs({ storeId: 'store-us' }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('never infers the actor from the request payload', async () => {
    const { db } = seedState();
    await expect(driver(db, 'bp_upsert_offer', offerArgs({ listingId: 'missing', actor: { canPublish: true } }), editor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { db: fresh } = seedState();
    await expect(driver(fresh, 'bp_upsert_listing', { ...listingArgs(), canPublish: true }, editor)).resolves.toBeDefined();
  });

  it('requires the owner grant to list or offer a published product', async () => {
    const { db } = seedState({ publishStatus: 'PUBLISHED' });
    await expect(driver(db, 'bp_upsert_listing', listingArgs(), editor)).rejects.toMatchObject({ code: 'PUBLISH_FORBIDDEN' });
    const published = await driver(db, 'bp_upsert_listing', listingArgs({ allowPublishedEdit: true, productVersion: 3 }), publisher);
    await expect(driver(db, 'bp_upsert_offer', offerArgs({ listingId: published.record.id }), editor)).rejects.toMatchObject({ code: 'PUBLISH_FORBIDDEN' });
    await expect(driver(db, 'bp_upsert_offer', offerArgs({ listingId: published.record.id, allowPublishedEdit: true, productVersion: published.record.productVersion }), publisher)).resolves.toBeDefined();
  });

  it('edits published offer metadata only with grant, confirmation and the current version', async () => {
    const { db, offer } = await seededOffer({ publishStatus: 'PUBLISHED' });
    await expect(driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: false }), editor, NOW)).rejects.toMatchObject({ code: 'PUBLISH_FORBIDDEN' });
    await expect(driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: false, expectedVersion: 1 }), publisher)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    await expect(driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: false, expectedVersion: 7, allowPublishedEdit: true }), publisher)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const updated = await driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: false, expectedVersion: 1, allowPublishedEdit: true }), publisher);
    expect(updated.record).toMatchObject({ isActive: false, version: 2 });
    expect(updated.record.productVersion).toBe(4);
  });

  it('treats an identical retry as saved and a different edit on a stale version as a conflict', async () => {
    const { db, offer } = await seededOffer();
    const first = await driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: false, expectedVersion: 1 }), editor);
    expect(first.record.version).toBe(2);
    // Same key and payload: the saved result is returned, nothing is written again.
    const retry = await driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: false, expectedVersion: 1 }), editor);
    expect(retry).toEqual(first);
    expect((await db.purchaseOffer.findMany())[0]!.version).toBe(2);
    // A different edit must match the newer version; a stale one is rejected like the product writer.
    await expect(driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: true, expectedVersion: 1, idempotencyKey: 'offer-2' }), editor)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const second = await driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: true, expectedVersion: 2, idempotencyKey: 'offer-3' }), editor);
    expect(second.record).toMatchObject({ isActive: true, version: 3 });
  });

  it('rejects a retry that reuses the key with a different payload', async () => {
    const { db } = seedState();
    await driver(db, 'bp_upsert_listing', listingArgs(), editor);
    await expect(driver(db, 'bp_upsert_listing', listingArgs({ asin: 'B000000009' }), editor)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});

describe('release metadata concurrency and audit', () => {
  it('advances the listing owner version and rejects the next stale URL edit', async () => {
    const { db, state, listing } = await seededOffer();
    const first = await driver(db, 'bp_upsert_listing', listingArgs({ id: listing.id, productVersion: 3, sourceUrl: `${SA_URL}?v=first`, idempotencyKey: 'url-first' }), editor);
    expect(first.record.productVersion).toBe(4);
    expect(state.product[0]!.version).toBe(4);
    expect(state.contentRevision).toMatchObject([{ entityType: 'listing', entityId: listing.id, version: 4, actorId: editor.id, snapshot: { sourceUrl: `${SA_URL}?v=first` } }]);
    await expect(driver(db, 'bp_upsert_listing', listingArgs({ id: listing.id, productVersion: 3, sourceUrl: `${SA_URL}?v=stale`, idempotencyKey: 'url-stale' }), editor)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('accepts only one simultaneous offer edit at an expected version', async () => {
    const { db, state, offer } = await seededOffer();
    const results = await Promise.allSettled(['a', 'b'].map(key => applyOfferMutation(db as unknown as MutationDb, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: false, expectedVersion: 1, idempotencyKey: key }), editor)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toMatchObject([{ reason: { code: 'VERSION_CONFLICT' } }]);
    expect(state.purchaseOffer[0]).toMatchObject({ version: 2, isActive: false });
    expect(state.contentRevision).toMatchObject([{ entityType: 'offer', entityId: offer.id, version: 2, actorId: editor.id }]);
  });

  it('requires confirmation and the owner version for published creations', async () => {
    const { db, state } = seedState({ publishStatus: 'PUBLISHED' });
    await expect(driver(db, 'bp_upsert_listing', listingArgs(), publisher)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    await expect(driver(db, 'bp_upsert_listing', listingArgs({ allowPublishedEdit: true }), publisher)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(driver(db, 'bp_upsert_listing', listingArgs({ allowPublishedEdit: true, productVersion: 2 }), publisher)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const listing = await driver(db, 'bp_upsert_listing', listingArgs({ allowPublishedEdit: true, productVersion: 3 }), publisher);
    expect(listing.record.productVersion).toBe(4);
    const args = offerArgs({ listingId: listing.record.id });
    await expect(driver(db, 'bp_upsert_offer', args, publisher)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    await expect(driver(db, 'bp_upsert_offer', { ...args, allowPublishedEdit: true }, publisher)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const offer = await driver(db, 'bp_upsert_offer', { ...args, allowPublishedEdit: true, productVersion: 4 }, publisher);
    expect(offer.record.productVersion).toBe(5);
    expect(state.contentRevision.map(revision => revision.entityType)).toEqual(['listing', 'offer']);
  });

  it('does not attach draft metadata across a concurrent publication boundary', async () => {
    const { db, state } = seedState();
    const originalRead = db.store.findUnique;
    db.store.findUnique = async input => {
      const result = await originalRead(input);
      state.product[0] = { ...state.product[0], publishStatus: 'PUBLISHED' };
      return result;
    };
    await expect(applyOfferMutation(db as unknown as MutationDb, 'bp_upsert_listing', listingArgs(), editor)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(state.marketplaceListing).toHaveLength(0);
    expect(state.contentRevision).toHaveLength(0);
  });

  it('rejects a supplied stale version even when the listing URL already matches', async () => {
    const { db, listing } = await seededOffer();
    const sourceUrl = `${SA_URL}?v=new`;
    await driver(db, 'bp_upsert_listing', listingArgs({ id: listing.id, productVersion: 3, sourceUrl, idempotencyKey: 'url-original' }), editor);
    await expect(driver(db, 'bp_upsert_listing', listingArgs({ id: listing.id, productVersion: 3, sourceUrl, idempotencyKey: 'url-different-intent' }), editor)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('rejects a supplied stale version even when the offer activation already matches', async () => {
    const { db, offer } = await seededOffer();
    const args = offerArgs({ id: offer.id, listingId: offer.listingId, expectedVersion: 1, isActive: false });
    await driver(db, 'bp_upsert_offer', args, editor);
    await expect(driver(db, 'bp_upsert_offer', { ...args, idempotencyKey: 'offer-different-intent' }, editor)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('rolls back metadata, owner version and receipt when saving its revision fails', async () => {
    const { db, state, offer } = await seededOffer();
    db.contentRevision.create = async () => { throw new Error('revision unavailable'); };
    await expect(driver(db, 'bp_upsert_offer', offerArgs({ id: offer.id, listingId: offer.listingId, isActive: false, expectedVersion: 1 }), editor)).rejects.toThrow('revision unavailable');
    expect(state.product[0]).toMatchObject({ version: 3 });
    expect(state.purchaseOffer[0]).toMatchObject({ version: 1, isActive: true });
    expect(state.operationReceipt).toHaveLength(0);
    expect(state.contentRevision).toHaveLength(0);
  });

  it('allows creation confirmations through the public strict schemas without changing offer expectedVersion meaning', async () => {
    const { schemas } = await import('./contracts');
    expect(schemas.bp_upsert_listing.safeParse(listingArgs({ allowPublishedEdit: true, productVersion: 3 })).success).toBe(true);
    expect(schemas.bp_upsert_offer.safeParse(offerArgs({ allowPublishedEdit: true, productVersion: 3 })).success).toBe(true);
  });
});

describe('source, time and scope rules', () => {
  it('fails closed on an unverified source and never retries a guessed fallback', async () => {
    const { db, state, offer } = await seededOffer();
    approval.enforce = true;
    try {
      // The real registry is all enabled:false, so every write to an offer is refused.
      await expect(driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      // A deprecated or unknown source is not substituted.
      await expect(driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, sourceId: 'amazon-paapi5-sa' }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await expect(driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, sourceId: 'scraper' }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await expect(driver(db, 'bp_record_delivery_evidence', deliveryArgs({ offerId: offer.id }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await expect(driver(db, 'bp_record_fx_snapshot', fxArgs(), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    } finally {
      approval.enforce = false;
    }
    expect(state.offerPriceObservation).toHaveLength(0);
    expect(state.offerDeliveryEvidence).toHaveLength(0);
    expect(state.fxSnapshot).toHaveLength(0);
  });

  it(`rejects a timestamp beyond the ${CLOCK_SKEW_SECONDS}-second allowance and accepts one inside it`, async () => {
    const { db, state, offer } = await seededOffer();
    const beyond = new Date(NOW_MS + CLOCK_SKEW_SECONDS * 1000 + 1000);
    await expect(driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, checkedAt: iso(beyond) }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const inside = new Date(NOW_MS + CLOCK_SKEW_SECONDS * 1000 - 1000);
    const accepted = await driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, checkedAt: iso(inside) }), editor);
    expect(new Date(accepted.record.checkedAt).toISOString()).toBe(inside.toISOString());
    expect(state.offerPriceObservation).toHaveLength(1);
  });

  it('derives expiry from the source timestamp and the approved policy, ignoring an agent-supplied expiry', async () => {
    const { db, offer } = await seededOffer({});
    // The agent also sends a 30-day expiry; it must be ignored, not merged.
    const args = { ...priceArgs({ offerId: offer.id }), expiresAt: iso(new Date(NOW_MS + 30 * 86_400_000)) };
    const result = await applyOfferMutation(db as unknown as MutationDb, 'bp_record_offer_price', args as any, editor, { now: () => NOW });
    const checkedAt = new Date(args.checkedAt);
    expect(result.record.expiresAt).toEqual(new Date(checkedAt.getTime() + 3600 * 1000));
  });

  it('derives the scope key on the server and keeps member and destination scopes apart', async () => {
    const { deriveScopeKey } = await import('./offer-mutations');
    expect(deriveScopeKey({ kind: 'price', marketplaceCode: 'SA', shipTo: null })).toBe('price:SA:in-marketplace');
    expect(deriveScopeKey({ kind: 'price', marketplaceCode: 'SA', shipTo: 'SA' })).not.toBe(deriveScopeKey({ kind: 'price', marketplaceCode: 'SA', shipTo: null }));
    expect(deriveScopeKey({ kind: 'price', marketplaceCode: 'US', shipTo: 'US' })).not.toBe(deriveScopeKey({ kind: 'price', marketplaceCode: 'SA', shipTo: 'SA' }));
    expect(deriveScopeKey({ kind: 'delivery', marketplaceCode: 'SA', shipTo: 'SA' })).not.toBe(deriveScopeKey({ kind: 'price', marketplaceCode: 'SA', shipTo: 'SA' }));
  });

  it('rejects an observation that names a different seller or fulfiller than the offer', async () => {
    const { db, offer } = await seededOffer();
    await expect(driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, sellerKey: 'other-seller' }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, fulfillerKey: 'other-fulfiller' }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects a marketplace mismatch between the observation and its offer', async () => {
    const { db, offer } = await seededOffer();
    await expect(driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, marketplaceCode: 'US', sourceId: 'amazon-creators-api-us', sourceUrl: US_URL }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects a currency that the marketplace does not trade', async () => {
    const { db, offer } = await seededOffer();
    await expect(applyOfferMutation(db as unknown as MutationDb, 'bp_record_offer_price', priceArgs({ offerId: offer.id, price: { amount: '10', currency: 'USD' } }) as any, editor, { now: () => NOW })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('member prices, destinations and FX stay separate', () => {
  it('keeps a member price as its own observation, never merged into the public one', async () => {
    const { db, state, offer } = await seededOffer();
    const publicRow = await driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id }), editor);
    const memberRow = await driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, audience: 'MEMBERS', price: { amount: '129.00', currency: 'SAR' }, idempotencyKey: 'price-member' }), editor);
    expect(memberRow.record.storedScope).toBe(publicRow.record.storedScope);
    expect(memberRow.record.id).not.toBe(publicRow.record.id);
    expect(memberRow.record).toMatchObject({ audience: 'MEMBERS', currency: 'SAR' });
    expect(state.offerPriceObservation.map(row => [row.audience, row.amount])).toEqual([['PUBLIC', '149.50'], ['MEMBERS', '129.00']]);
  });

  it('gives a ship-to price its own scope and keeps the unknown price as a note with no amount', async () => {
    const { db, state, offer } = await seededOffer();
    const row = await driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, shipTo: 'SA' }), editor);
    expect(row.record.storedScope).toBe('price:SA:ship-to:SA');
    const unknown = await driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id, availability: 'UNAVAILABLE', price: null, idempotencyKey: 'price-2' }), editor);
    expect(unknown.record).toMatchObject({ amount: null, currency: null, availability: 'UNAVAILABLE' });
    expect(state.offerPriceObservation).toHaveLength(2);
  });

  it('keeps SA delivery evidence independent from US evidence for the same offer', async () => {
    const { db, state, offer } = await seededOffer();
    const sa = await driver(db, 'bp_record_delivery_evidence', deliveryArgs({ offerId: offer.id }), editor);
    expect(sa.record).toMatchObject({ country: 'SA', storedScope: 'delivery:SA:ship-to:SA' });
    // The US listing needs its own offer; the SA offer is never reused as US evidence.
    await expect(driver(db, 'bp_record_delivery_evidence', deliveryArgs({ offerId: offer.id, country: 'US', idempotencyKey: 'delivery-us' }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const usListing = await driver(db, 'bp_upsert_listing', listingArgs({ storeId: 'store-us', marketplaceCode: 'US', asin: 'B000000002', sourceUrl: US_URL, idempotencyKey: 'listing-us' }), editor);
    const usOffer = await driver(db, 'bp_upsert_offer', offerArgs({ listingId: usListing.record.id, fulfillerKey: 'amazon-us', idempotencyKey: 'offer-us' }), editor);
    const us = await driver(db, 'bp_record_delivery_evidence', deliveryArgs({ offerId: usOffer.record.id, marketplaceCode: 'US', sourceId: 'amazon-creators-api-us', sourceUrl: US_URL, fulfillerKey: 'amazon-us', country: 'US', idempotencyKey: 'delivery-us' }), editor);
    expect(us.record).toMatchObject({ country: 'US', offerId: usOffer.record.id, storedScope: 'delivery:US:ship-to:US' });
    expect(state.offerDeliveryEvidence.map(row => [row.offerId, row.country])).toEqual([[offer.id, 'SA'], [usOffer.record.id, 'US']]);
  });

  it('refuses to reach a US destination through a SA offer even when the seller matches', async () => {
    const { db, offer } = await seededOffer();
    await expect(driver(db, 'bp_record_delivery_evidence', deliveryArgs({ offerId: offer.id, country: 'US' }), editor)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('records an FX snapshot under the approved source only, with decimal strings preserved', async () => {
    const { db, state } = await seededOffer();
    const row = await driver(db, 'bp_record_fx_snapshot', fxArgs(), editor);
    expect(row.record).toMatchObject({ base: 'USD', sourceId: 'amazon-creators-api-sa' });
    expect(row.record.rates).toEqual({ SAR: '3.7501', USD: '1' });
    expect(new Date(row.record.expiresAt).toISOString()).toBe(new Date(minutesAgo(5).getTime() + 3600_000).toISOString());
    expect(state.fxSnapshot).toHaveLength(1);
  });

  it('treats a caller-supplied verification flag as invalid input before the schema', async () => {
    // The strict contract rejects it; the writer also never reads it.
    const { schemas } = await import('./contracts');
    expect(schemas.bp_record_delivery_evidence.safeParse({ ...deliveryArgs(), verified: true }).success).toBe(false);
  });
});

describe('notes never touch editorial state', () => {
  it('records the same price twice with one identity and one row', async () => {
    const { db, state, offer } = await seededOffer();
    const first = await applyOfferMutation(db as unknown as MutationDb, 'bp_record_offer_price', priceArgs({ offerId: offer.id }) as any, editor, { now: () => NOW });
    const second = await applyOfferMutation(db as unknown as MutationDb, 'bp_record_offer_price', priceArgs({ offerId: offer.id, idempotencyKey: 'price-2' }) as any, editor, { now: () => NOW });
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.created).toBe(false);
    expect(state.offerPriceObservation).toHaveLength(1);
    // The product row is untouched: same version, same publication, no write at all.
    expect(state.product[0]).toMatchObject({ version: 3, publishStatus: 'DRAFT' });
    expect(state.writes.filter(write => write.endsWith(':product'))).toEqual([]);
    expect(state.contentRevision).toHaveLength(0);
    expect(first.record.productVersion).toBe(3);
  });
});

describe('ambiguous network failure after commit', () => {
  it('replays one stored result for the same key and creates no second row', async () => {
    const { db, state, offer } = await seededOffer();
    // The first attempt commits, then its response is lost on the wire.
    const committed = await driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id }), editor);
    expect(state.offerPriceObservation).toHaveLength(1);
    const original = state.writes.length;
    // The agent retries the same key with the same payload.
    const replayed = await driver(db, 'bp_record_offer_price', priceArgs({ offerId: offer.id }), editor);
    expect(replayed).toEqual(committed);
    expect(state.writes.length).toBe(original);
    expect(state.offerPriceObservation).toHaveLength(1);
    expect(state.operationReceipt).toHaveLength(1);
  });
});
