/**
 * Task 3 — additive mechanical backfill of the legacy SAR price model into the
 * international tables (marketplace_listings / purchase_offers / offer_price_observations).
 *
 * What this script deliberately does NOT do:
 *   * no currency change and no conversion: a legacy amount is copied only when the stored
 *     currency is exactly SAR. A USD-labelled legacy row is never added on top of an SAR
 *     observation for the same offer, and is never re-tagged back to SAR;
 *   * no product merging: one product keeps its id; one (product, store) keeps one listing;
 *   * no fabrication: no ship-to scope, no delivery evidence, no fulfiller, no Prime or
 *     free-shipping flag, no marketplace identity from a store name or bare domain;
 *   * no invented source: written observations link back to their legacy price row and are
 *     marked as backfill with legacy taxBasis; they are not attributed to a T1 sourceId.
 *
 * Safety rails:
 *   * dry-run is the default; a write needs --apply AND an explicit screened target;
 *   * ambiguous records stay in the legacy tables untouched and are counted as `legacy`;
 *   * the international feature stays off: rollback is turning the flag off, never a
 *     down migration that drops these tables.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { PrismaClient } from '@babiespicks/db';
import { isMarketplaceUrl, resolveMarketplaceFromDomain } from '@babiespicks/domain/international';

export type MarketplaceCode = 'SA' | 'US';
export type BackfillTaxBasis = 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';

/** Explicit target authorization for a write run. */
export type BackfillTarget =
  | { readonly mode: 'database-url'; readonly url: string }
  | { readonly mode: 'local-test-stack'; readonly port: number; readonly database: string };

export interface BackfillOptions {
  /** Default false. A dry run only reads and reports. */
  readonly apply?: boolean;
  /** Required when apply is true. */
  readonly target?: BackfillTarget | null;
  /** Tax basis carried over from legacy; defaults to UNKNOWN, never guessed as INCLUDED. */
  readonly taxBasis?: BackfillTaxBasis;
  /** Observation lifetime; clamped to the T1 offer-content retention of 3600s. */
  readonly observationMaxAgeSeconds?: number;
}

export interface BackfillLegacyRecord {
  readonly legacyType: 'productPrice';
  readonly legacyId: string;
  readonly reason: string;
}

export interface BackfillReport {
  readonly applied: boolean;
  /** Redacted target: database name plus host, never credentials. */
  readonly target: string | null;
  readonly databaseName: string | null;
  readonly counts: {
    readonly priceRowsSeen: number;
    readonly groups: number;
    /** Legacy rows copied into the international tables by this run. */
    readonly migrated: number;
    /** Rows whose international observation already existed (compare-and-skip). */
    readonly alreadyPresent: number;
    /** Rows left in the legacy tables, listed in legacyRecords when the list is small enough. */
    readonly legacy: number;
    readonly converted: 0;
    readonly merged: 0;
    readonly afterConversion: 0;
    readonly deliveryEvidenceCreated: 0;
    readonly fxSnapshotsCreated: 0;
    readonly observationsWithoutPrice: number;
    /** Legacy rows whose mapping landed on an existing observation or was already mapped. */
    readonly mapped: number;
  };
  readonly legacyRecords: readonly BackfillLegacyRecord[];
  readonly legacyRecordsTruncated: boolean;
  readonly policy: {
    readonly currency: 'SAR-only, copied verbatim';
    readonly conversion: false;
    readonly productMerge: false;
    readonly shipTo: null;
    readonly deliveryEvidence: 'none produced';
    readonly producerSourceId: null;
    readonly provenance: 'sourceId=legacy-sar-backfill; sourceUrl=legacy price row URL';
    readonly taxBasis: BackfillTaxBasis;
    readonly priceMaxAgeSeconds: number;
    readonly observationRetentionSeconds: number;
    readonly deliveryMaxAgeSeconds: null;
  };
}

/** T1: Creators API retention for offer content is 3600s; nothing may outlive it. */
export const SOURCE_POLICY_MAX_AGE_SECONDS = 3600;
export const DEFAULT_OBSERVATION_MAX_AGE_SECONDS = 3600;
export const LEGACY_CURRENCY = 'SAR';
export const LEGACY_MARKETPLACE: MarketplaceCode = 'SA';
export const LEGACY_SOURCE_ID = 'legacy-sar-backfill';
export const LEGACY_SCOPE_KEY = 'legacy-sar-in-marketplace';
const MAX_REPORTED_LEGACY = 200;
const FORBIDDEN_DATABASE_NAMES = new Set(['postgres', 'template0', 'template1', 'production', 'prod']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MANAGED_DATABASE_HOST = /(^|\.)(supabase\.co|supabase\.in|neon\.tech|render\.com|herokuapp\.com|rds\.amazonaws\.com)$/;
const TRANSACTION_TIMEOUT_MS = 120_000;

export class BackfillTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackfillTargetError';
  }
}

// ── Target screening ────────────────────────────────────────────────────────

export interface ParsedTarget {
  readonly url: string;
  readonly databaseName: string;
  readonly host: string;
  readonly local: boolean;
}

/** Screen a write target. There is no "unknown" outcome: either it passes or it throws. */
export function parseBackfillTarget(target: BackfillTarget | null | undefined): ParsedTarget {
  if (!target) throw new BackfillTargetError('Apply requires an explicit target: --database-url=<url>, a non-empty DATABASE_URL/TEST_DATABASE_URL, or --local-test-stack.');
  let url: string;
  if (target.mode === 'database-url') {
    if (!target.url || target.url.trim() === '') throw new BackfillTargetError('The explicit --database-url is empty.');
    url = target.url.trim();
  } else {
    if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) throw new BackfillTargetError('--local-test-stack requires a valid --port=<port>.');
    url = `postgresql://postgres:${LOCAL_TEST_STACK.password}@127.0.0.1:${target.port}/${target.database}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BackfillTargetError('The target database URL is not a valid URL.');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') throw new BackfillTargetError('The target must be a postgresql:// URL.');
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName) throw new BackfillTargetError('The target URL has no database name.');
  const host = parsed.hostname.toLowerCase();
  if (FORBIDDEN_DATABASE_NAMES.has(databaseName.toLowerCase()) || /prod/i.test(databaseName)) {
    throw new BackfillTargetError(`Database "${databaseName}" is not allowed as a backfill target.`);
  }
  if (MANAGED_DATABASE_HOST.test(host)) throw new BackfillTargetError('Managed/production database hosts are not allowed as a backfill target.');
  const local = LOCAL_HOSTS.has(host);
  if (target.mode === 'local-test-stack' && (!local || !databaseName.endsWith('_test'))) {
    throw new BackfillTargetError('--local-test-stack only targets localhost with a database name ending in _test.');
  }
  if (!local && !databaseName.endsWith('_test')) {
    throw new BackfillTargetError('A non-localhost target must have a database name ending in _test.');
  }
  return { url, databaseName, host, local };
}

export function redactTargetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `postgresql://${parsed.username ? '***@' : ''}${parsed.host}${parsed.pathname}`;
  } catch {
    return '<invalid url>';
  }
}

// ── Identity helpers ────────────────────────────────────────────────────────

/** Deterministic short id so a re-run rewrites nothing and ids stay stable per identity. */
function stableId(prefix: string, identity: string): string {
  return `${prefix}-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

/** Canonical identity separator. Values are normalized, so no user text can forge a slot. */
export function identityKey(parts: readonly (string | number | null)[]): string {
  return parts.map(part => (part === null ? '' : String(part).normalize('NFKC').trim().toLowerCase())).join('\u241F');
}

export function listingIdentity(productId: string, storeId: string, marketplaceCode: string, asin: string, variantKey: string): string {
  return identityKey(['listing', productId, storeId, marketplaceCode, asin, variantKey]);
}

export function offerIdentity(listingKey: string, sellerKey: string, fulfillerKey: string | null, condition: string, audience: string, version: number): string {
  return identityKey(['offer', listingKey, sellerKey, fulfillerKey, condition, audience, version]);
}

const LEGACY_SELLER_KEY = 'legacy-unverified-seller';

export function observationIdentity(offerKey: string, scopeKey: string, shipTo: string | null, taxBasis: string, amount: string | null, currency: string | null): string {
  return identityKey(['observation', offerKey, scopeKey, shipTo, taxBasis, amount, currency]);
}

export function deliveryEvidenceIdentity(offerKey: string, country: string, precision: string, state: string, sourceId: string, checkedAtIso: string): string {
  return identityKey(['delivery', offerKey, country, precision, state, sourceId, checkedAtIso]);
}

export function fxSnapshotIdentity(base: string, sourceId: string, asOfIso: string): string {
  return identityKey(['fx', base, sourceId, asOfIso]);
}

/** ASIN only from a canonical path; query strings and short hosts never yield one. */
export function asinFromUrl(sourceUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  const match = parsed.pathname.match(/^\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i);
  return match?.[1] ? match[1].toUpperCase() : null;
}

function approvedMarketplace(sourceUrl: string): MarketplaceCode | null {
  try {
    const code = resolveMarketplaceFromDomain(new URL(sourceUrl).hostname);
    if (!code || code !== LEGACY_MARKETPLACE) return null;
    return isMarketplaceUrl(sourceUrl, code) ? code : null;
  } catch {
    return null;
  }
}

function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_OBSERVATION_MAX_AGE_SECONDS;
  return Math.max(0, Math.min(Math.floor(seconds), SOURCE_POLICY_MAX_AGE_SECONDS));
}

// ── Pure planning ───────────────────────────────────────────────────────────

export interface LegacyPriceRow {
  readonly id: string;
  readonly productId: string;
  readonly storeId: string;
  readonly price: unknown;
  readonly originalPrice: unknown;
  readonly currency: string;
  readonly url: string | null;
  readonly inStock: boolean;
  readonly scrapedAt: Date;
}

export interface LegacyIdentity {
  readonly productIds: ReadonlySet<string>;
  readonly stores: ReadonlyMap<string, { readonly slug: string; readonly url: string }>;
}

export interface PlannedObservation {
  readonly legacyId: string;
  readonly observationId: string;
  readonly identityKey: string;
  readonly amount: string | null;
  readonly originalAmount: string | null;
  readonly currency: string | null;
  readonly availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  readonly sourceUrl: string;
  readonly checkedAt: Date;
}

export interface PlannedListing {
  readonly productId: string;
  readonly storeId: string;
  readonly marketplaceCode: MarketplaceCode;
  readonly asin: string;
  readonly variantKey: string;
  readonly sourceUrl: string;
  readonly identityKey: string;
  readonly listingId: string;
  readonly offerIdentityKey: string;
  readonly offerId: string;
  readonly observations: readonly PlannedObservation[];
}

export interface BackfillPlan {
  readonly listings: readonly PlannedListing[];
  readonly legacyRecords: readonly BackfillLegacyRecord[];
  readonly groupCount: number;
  readonly rowCount: number;
}

/**
 * Decide, per legacy price row, whether it is exactly migratable. Pure: no database, no clock.
 * Rows that cannot be migrated without guessing end up in legacyRecords.
 */
export function planInternationalBackfill(input: { readonly rows: readonly LegacyPriceRow[]; readonly identity: LegacyIdentity }, options: { readonly taxBasis?: BackfillTaxBasis } = {}): BackfillPlan {
  const taxBasis = options.taxBasis ?? 'UNKNOWN';
  const legacyRecords: BackfillLegacyRecord[] = [];
  const keepLegacy = (row: LegacyPriceRow, reason: string) => legacyRecords.push({ legacyType: 'productPrice', legacyId: row.id, reason });

  const groups = new Map<string, { readonly productId: string; readonly storeId: string; readonly rows: LegacyPriceRow[] }>();
  for (const row of input.rows) {
    const key = identityKey([row.productId, row.storeId]);
    const group = groups.get(key) ?? { productId: row.productId, storeId: row.storeId, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const listings: PlannedListing[] = [];
  for (const group of groups.values()) {
    if (!input.identity.productIds.has(group.productId)) {
      for (const row of group.rows) keepLegacy(row, 'product is missing; a listing is never attached to an invented product');
      continue;
    }
    if (!input.identity.stores.has(group.storeId)) {
      for (const row of group.rows) keepLegacy(row, 'store is missing; marketplace identity unknown');
      continue;
    }
    // Newest first per (product, store), matching legacy "latest observation wins".
    const rows = [...group.rows].sort((a, b) => b.scrapedAt.getTime() - a.scrapedAt.getTime());
    const sar = rows.filter(row => row.currency === LEGACY_CURRENCY);
    for (const row of rows) {
      if (row.currency !== LEGACY_CURRENCY) keepLegacy(row, `currency "${row.currency}" is not SAR; never converted and never relabelled`);
    }
    if (sar.length === 0) continue;
    const head = sar[0]!;

    // One listing per (product, store): a store that also sells another marketplace product
    // cannot be split into two marketplaces without guessing, so the whole group stays legacy.
    for (const row of sar) {
      if (!row.url) keepLegacy(row, 'no source URL; the store name is not a marketplace identity');
      else if (!approvedMarketplace(row.url)) keepLegacy(row, 'source URL is not an approved marketplace deep link');
      else if (!asinFromUrl(row.url)) keepLegacy(row, 'source URL has no canonical ASIN; listing identity would be guessed');
      else {
        const code = approvedMarketplace(row.url);
        if (code !== approvedMarketplace(head.url ?? '')) keepLegacy(row, 'rows for one store disagree on marketplace; the group is ambiguous');
      }
    }
    const stillAmbiguous = sar.some(row => legacyRecords.some(record => record.legacyId === row.id));
    if (stillAmbiguous) continue;
    const marketplaceCode = approvedMarketplace(head.url!)!;
    const asin = asinFromUrl(head.url!)!;
    const listingKey = listingIdentity(group.productId, group.storeId, marketplaceCode, asin, '');
    const offerKey = offerIdentity(listingKey, LEGACY_SELLER_KEY, null, 'UNKNOWN', 'PUBLIC', 1);
    const observations: PlannedObservation[] = sar.map(row => {
      const hasAmount = row.price !== null && row.price !== undefined;
      const amount = hasAmount ? String(row.price) : null;
      const currency = hasAmount ? row.currency : null;
      const identity = observationIdentity(offerKey, LEGACY_SCOPE_KEY, null, taxBasis, amount, currency);
      return {
        legacyId: row.id,
        observationId: stableId('obs', identity),
        identityKey: identity,
        amount,
        originalAmount: hasAmount && row.originalPrice !== null && row.originalPrice !== undefined ? String(row.originalPrice) : null,
        currency,
        availability: hasAmount ? (row.inStock ? 'AVAILABLE' : 'UNAVAILABLE') : 'UNKNOWN',
        sourceUrl: row.url ?? head.url!,
        checkedAt: row.scrapedAt,
      };
    });
    listings.push({
      productId: group.productId,
      storeId: group.storeId,
      marketplaceCode,
      asin,
      variantKey: '',
      sourceUrl: head.url!,
      identityKey: listingKey,
      listingId: stableId('lst', listingKey),
      offerIdentityKey: offerKey,
      offerId: stableId('off', offerKey),
      observations,
    });
  }

  return { listings, legacyRecords, groupCount: groups.size, rowCount: input.rows.length };
}

// ── Execution ───────────────────────────────────────────────────────────────

/** The interactive transaction client handed to the callback. */
export type PrismaTransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export interface BackfillDatabase {
  readonly productPrice: Pick<PrismaClient['productPrice'], 'findMany'>;
  readonly product: Pick<PrismaClient['product'], 'findMany'>;
  readonly store: Pick<PrismaClient['store'], 'findMany'>;
  readonly legacyPriceMapping: Pick<PrismaClient['legacyPriceMapping'], 'findMany'>;
  /** Interactive transaction over the same client (the real Prisma client satisfies this). */
  $transaction<R>(fn: (tx: PrismaTransactionClient) => Promise<R>, options?: { maxWait?: number; timeout?: number }): Promise<R>;
}

export interface BackfillRunResult {
  readonly report: BackfillReport;
}

async function loadLegacy(db: BackfillDatabase): Promise<{ rows: LegacyPriceRow[]; identity: LegacyIdentity }> {
  const [prices, products, stores] = await Promise.all([
    db.productPrice.findMany({ orderBy: { scrapedAt: 'desc' } }),
    db.product.findMany({ select: { id: true } }),
    db.store.findMany({ select: { id: true, slug: true, url: true } }),
  ]);
  return {
    rows: prices.map(row => ({
      id: row.id,
      productId: row.productId,
      storeId: row.storeId,
      price: row.price,
      originalPrice: row.originalPrice,
      currency: row.currency,
      url: row.url,
      inStock: row.inStock,
      scrapedAt: row.scrapedAt,
    })),
    identity: {
      productIds: new Set(products.map(product => product.id)),
      stores: new Map(stores.map(store => [store.id, { slug: store.slug, url: store.url }])),
    },
  };
}

/**
 * Run the backfill. Without `apply` it only reads and reports. A write run requires a
 * screened explicit target and is idempotent: existing listings/offers are never updated and
 * an existing observation at the same instant is compared, not overwritten.
 */
export async function runInternationalBackfill(
  db: BackfillDatabase,
  options: BackfillOptions = {},
  deps: { readonly now?: () => Date } = {},
): Promise<BackfillRunResult> {
  const now = deps.now ?? (() => new Date());
  const observedAt = now();
  const apply = options.apply === true;
  const target = apply ? parseBackfillTarget(options.target) : null;
  const taxBasis = options.taxBasis ?? 'UNKNOWN';
  const maxAgeSeconds = clampSeconds(options.observationMaxAgeSeconds ?? DEFAULT_OBSERVATION_MAX_AGE_SECONDS);
  // Observation expiry is computed from the legacy checkedAt plus the approved window, so a
  // stale legacy price is stored already expired rather than silently refreshed.
  const expiresAtFor = (checkedAt: Date) => new Date(checkedAt.getTime() + maxAgeSeconds * 1000);

  const legacy = await loadLegacy(db);
  const plan = planInternationalBackfill(legacy, { taxBasis });

  let migrated = 0;
  let alreadyPresent = 0;
  let withoutPrice = 0;

  if (apply) {
    await db.$transaction(async tx => {
      for (const listing of plan.listings) {
        await tx.marketplaceListing.upsert({
          where: { identityKey: listing.identityKey },
          create: {
            id: listing.listingId,
            productId: listing.productId,
            storeId: listing.storeId,
            marketplaceCode: listing.marketplaceCode,
            asin: listing.asin,
            variantKey: listing.variantKey,
            sourceUrl: listing.sourceUrl,
            identityKey: listing.identityKey,
          },
          update: {},
        });
        await tx.purchaseOffer.upsert({
          where: { identityKey: listing.offerIdentityKey },
          create: {
            id: listing.offerId,
            listingId: listing.listingId,
            sellerKey: LEGACY_SELLER_KEY,
            fulfillerKey: null,
            condition: 'UNKNOWN',
            audience: 'PUBLIC',
            version: 1,
            isActive: true,
            identityKey: listing.offerIdentityKey,
          },
          update: {},
        });
        const mapped = new Set(
          (await tx.legacyPriceMapping.findMany({ where: { productPriceId: { in: listing.observations.map(observation => observation.legacyId) } }, select: { productPriceId: true } }))
            .map(record => record.productPriceId),
        );
        for (const observation of listing.observations) {
          if (observation.amount === null) withoutPrice++;
          // A legacy row already mapped to an offer is not copied twice (and never onto
          // a different product after an editorial split).
          if (mapped.has(observation.legacyId)) {
            alreadyPresent++;
            continue;
          }
          const existing = await tx.offerPriceObservation.findUnique({ where: { identityKey: observation.identityKey } });
          if (existing) {
            const sameAmount = String(existing.amount ?? '') === String(observation.amount ?? '');
            if (!sameAmount || existing.currency !== observation.currency) {
              // A later writer changed the value: theirs is authoritative, the legacy row stays legacy.
              alreadyPresent++;
              continue;
            }
            await tx.legacyPriceMapping.create({ data: { productPriceId: observation.legacyId, offerId: listing.offerId, priceObservationId: existing.id } });
            alreadyPresent++;
            continue;
          }
          // The backfill recreates the legacy series as it stands. Unlike the readers, which
          // collapse an older row next to a newer one, it stores each distinct legacy row so no
          // history is lost. Rows that would duplicate an existing observation are handled above.
          const created = await tx.offerPriceObservation.create({
            data: {
              id: observation.observationId,
              offerId: listing.offerId,
              scopeKey: LEGACY_SCOPE_KEY,
              shipTo: null,
              amount: observation.amount,
              currency: observation.currency,
              originalAmount: observation.originalAmount,
              audience: 'PUBLIC',
              availability: observation.availability,
              taxBasis,
              sourceId: LEGACY_SOURCE_ID,
              sourceUrl: observation.sourceUrl,
              checkedAt: observation.checkedAt,
              expiresAt: expiresAtFor(observation.checkedAt),
              identityKey: observation.identityKey,
            },
          });
          await tx.legacyPriceMapping.create({ data: { productPriceId: observation.legacyId, offerId: listing.offerId, priceObservationId: created.id } });
          migrated++;
        }
      }
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  const legacyRecords: readonly BackfillLegacyRecord[] = plan.legacyRecords;
  const report: BackfillReport = {
    applied: apply,
    target: target ? `${target.databaseName} @ ${redactTargetUrl(target.url)}` : null,
    databaseName: target?.databaseName ?? null,
    counts: {
      priceRowsSeen: plan.rowCount,
      groups: plan.groupCount,
      migrated,
      alreadyPresent,
      mapped: alreadyPresent,
      legacy: legacyRecords.length,
      converted: 0,
      merged: 0,
      afterConversion: 0,
      deliveryEvidenceCreated: 0,
      fxSnapshotsCreated: 0,
      observationsWithoutPrice: withoutPrice,
    },
    legacyRecords: legacyRecords.slice(0, MAX_REPORTED_LEGACY),
    legacyRecordsTruncated: legacyRecords.length > MAX_REPORTED_LEGACY,
    policy: {
      currency: 'SAR-only, copied verbatim',
      conversion: false,
      productMerge: false,
      shipTo: null,
      deliveryEvidence: 'none produced',
      producerSourceId: null,
      provenance: `sourceId=${LEGACY_SOURCE_ID}; sourceUrl=legacy price row URL`,
      taxBasis,
      priceMaxAgeSeconds: maxAgeSeconds,
      observationRetentionSeconds: maxAgeSeconds,
      deliveryMaxAgeSeconds: null,
    },
  };
  return { report };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export interface CliArgs {
  readonly apply: boolean;
  readonly target: BackfillTarget | null;
  readonly taxBasis: BackfillTaxBasis;
  readonly observationMaxAgeSeconds: number;
}

export const LOCAL_TEST_STACK = Object.freeze({
  containerName: 'babiespicks-international-test',
  image: 'postgres:16-alpine',
  user: 'postgres',
  password: 'local-test-only-not-a-secret',
});

export function parseBackfillArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): CliArgs {
  let apply = false;
  let explicitUrl: string | undefined;
  let stack = false;
  let port: number | undefined;
  let database = 'babiespicks_international_backfill_test';
  let taxBasis: BackfillTaxBasis = 'UNKNOWN';
  let maxAge = DEFAULT_OBSERVATION_MAX_AGE_SECONDS;
  for (const arg of argv) {
    if (arg === '--apply') apply = true;
    else if (arg === '--local-test-stack') stack = true;
    else if (arg.startsWith('--database-url=')) explicitUrl = arg.slice('--database-url='.length);
    else if (arg.startsWith('--port=')) port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--database=')) database = arg.slice('--database='.length);
    else if (arg.startsWith('--max-age-seconds=')) maxAge = Number(arg.slice('--max-age-seconds='.length));
    else if (arg.startsWith('--tax-basis=')) {
      const value = arg.slice('--tax-basis='.length);
      if (value !== 'INCLUDED' && value !== 'EXCLUDED' && value !== 'UNKNOWN') throw new BackfillTargetError('--tax-basis must be INCLUDED, EXCLUDED or UNKNOWN.');
      taxBasis = value;
    } else if (arg === '--help' || arg === '-h') throw new BackfillTargetError(usage());
    else throw new BackfillTargetError(`Unknown argument: ${arg}\n${usage()}`);
  }
  let target: BackfillTarget | null = null;
  if (apply) {
    if (stack) {
      if (port === undefined) throw new BackfillTargetError('--local-test-stack requires --port=<local container port>.');
      target = { mode: 'local-test-stack', port, database };
    } else {
      const url = explicitUrl ?? env.DATABASE_URL ?? env.TEST_DATABASE_URL;
      if (!url) throw new BackfillTargetError('No target given: pass --database-url=<url>, --local-test-stack, or set DATABASE_URL/TEST_DATABASE_URL.');
      target = { mode: 'database-url', url };
    }
  }
  if (!Number.isFinite(maxAge) || maxAge < 0) throw new BackfillTargetError('--max-age-seconds must be a non-negative number.');
  return { apply, target, taxBasis, observationMaxAgeSeconds: maxAge };
}

function usage(): string {
  return [
    'Usage: tsx scripts/operations/backfill-international.ts [flags]',
    '  (no flags)                     dry run: read and report only',
    '  --apply --database-url=<url>   write to an explicit, screened database',
    '  --apply --local-test-stack --port=<p> [--database=<name>]',
    '                                 start our own postgres:16-alpine container, migrate it,',
    '                                 write there, then stop the container (data discarded)',
    '  --tax-basis=UNKNOWN|INCLUDED|EXCLUDED   tax basis copied from legacy (default UNKNOWN)',
    `  --max-age-seconds=<n>          observation lifetime, clamped to ${SOURCE_POLICY_MAX_AGE_SECONDS}`,
  ].join('\n');
}

/** Local stack: the container is created, used and destroyed by this run only. */
export function localTestStackDevCommand(mode: 'up' | 'down', args: { readonly port?: number; readonly database?: string } = {}): string[] {
  if (mode === 'down') return ['rm', '-f', LOCAL_TEST_STACK.containerName];
  return [
    'run', '--rm', '--detach', '--name', LOCAL_TEST_STACK.containerName,
    '--label', 'babiespicks.local-test-stack=international-backfill',
    '-e', `POSTGRES_USER=${LOCAL_TEST_STACK.user}`,
    '-e', `POSTGRES_PASSWORD=${LOCAL_TEST_STACK.password}`,
    '-e', `POSTGRES_DB=${args.database ?? 'babiespicks_international_backfill_test'}`,
    '-p', `127.0.0.1:${args.port}:5432`,
    LOCAL_TEST_STACK.image,
  ];
}

function docker(args: string[]): { ok: boolean; out: string } {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

async function main(): Promise<void> {
  const args = parseBackfillArgs(process.argv.slice(2));
  const { PrismaClient } = await import('@babiespicks/db');
  let url: string | undefined;
  let stackRunning = false;
  if (args.apply) {
    const parsed = parseBackfillTarget(args.target);
    url = parsed.url;
    if (args.target?.mode === 'local-test-stack') {
      docker(localTestStackDevCommand('down', {}));
      const up = docker(localTestStackDevCommand('up', { port: args.target.port, database: args.target.database }));
      if (!up.ok) throw new BackfillTargetError(`Could not start the local test container: ${up.out.trim()}`);
      stackRunning = true;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (docker(['exec', LOCAL_TEST_STACK.containerName, 'pg_isready', '-U', LOCAL_TEST_STACK.user, '-d', args.target.database]).ok) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      // The local stack must carry the international migration before any write.
      const migrate = spawnSync('pnpm', ['--filter', '@babiespicks/db', 'exec', 'prisma', 'migrate', 'deploy'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } });
      if (migrate.status !== 0) throw new BackfillTargetError(`prisma migrate deploy failed on the local stack: ${migrate.stderr ?? migrate.stdout}`);
    }
  } else {
    const candidate = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
    if (!candidate) throw new BackfillTargetError('A dry run needs a readable database: pass --database-url=<url> or set DATABASE_URL/TEST_DATABASE_URL.');
    if (process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL && !parseBackfillTarget({ mode: 'database-url', url: candidate }).local) {
      throw new BackfillTargetError('The dry run would read a non-local DATABASE_URL; pass --database-url=<local url> explicitly.');
    }
    url = candidate;
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const { report } = await runInternationalBackfill(db, args);
    console.log(JSON.stringify(report, null, 2));
    if (stackRunning) console.log(`Local stack container "${LOCAL_TEST_STACK.containerName}" was temporary; stop it with: docker ${localTestStackDevCommand('down').join(' ')}`);
  } finally {
    await db.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Backfill failed');
    process.exitCode = 1;
  });
}
