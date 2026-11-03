/**
 * Task 4 — transactional writers for marketplace listings, purchase offers and their
 * price/delivery/FX observations.
 *
 * Rules enforced here, on the server only:
 *   * the actor identity and its publishing grant come from a separate argument, never input;
 *   * published product metadata edits need the owner grant, `allowPublishedEdit` and CAS;
 *   * a note writer never bumps `Product.version` and never touches verdict/publication;
 *   * `scopeKey` and `expiresAt` are derived server-side from canonical fields and the
 *     approved source policy — an agent-supplied expiry is never used to extend lifetime;
 *   * an inactive/unapproved source fails closed with INVALID_INPUT and no fallback;
 *   * SA delivery evidence and US delivery evidence are separate rows for separate offers;
 *   * a sender-supplied `verified` flag is not evidence.
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@babiespicks/db';
import { DomainError } from './errors';
import { readLockedStore } from './store-identity';
import { isCurrencyApprovedForMarketplace, isMarketplaceUrl, type MarketplaceCode } from './marketplaces';
import { requireEnabledSourcePolicy, type SourcePolicy } from './source-policy';

// ── Shared pieces ───────────────────────────────────────────────────────────

/**
 * The only Prisma surface this module touches: four reads, so it accepts the existing
 * transaction client without a cast while still behaving like one client for reads and writes.
 */
export interface OfferReadDb {
  readonly product: { findUnique(args: any): Promise<any> };
  readonly store: { findUnique(args: any): Promise<any> };
  readonly marketplaceListing: { findUnique(args: any): Promise<any> };
  readonly purchaseOffer: { findUnique(args: any): Promise<any> };
  readonly offerPriceObservation: { findUnique(args: any): Promise<any> };
  readonly offerDeliveryEvidence: { findUnique(args: any): Promise<any> };
  readonly fxSnapshot: { findUnique(args: any): Promise<any> };
}

/** Writes always run inside the caller's existing transaction. */
export type MutationDb = Prisma.TransactionClient;

/** The `clockSkewSeconds` of the current contract: a future timestamp beyond this is rejected. */
export const CLOCK_SKEW_SECONDS = 60;

const CLOCK_SKEW_MS = CLOCK_SKEW_SECONDS * 1000;

export interface OfferMutationActor {
  readonly id: string;
  readonly canPublish: boolean;
}

export const OFFER_MUTATION_NAMES = [
  'bp_upsert_listing',
  'bp_upsert_offer',
  'bp_record_offer_price',
  'bp_record_delivery_evidence',
  'bp_record_fx_snapshot',
] as const;
export type OfferMutationName = (typeof OFFER_MUTATION_NAMES)[number];

export type OfferWriteName = OfferMutationName;

export interface SavedMutation {
  readonly tool: OfferWriteName;
  readonly record: Record<string, any>;
  /** The rule that produced this operation's stored identity; auditable, not inferred later. */
  readonly idempotency: { readonly key: string; readonly inputHash: string; readonly identityKey: string };
}

export interface OfferMutationOptions {
  /** Wall clock used for the 60 s future-timestamp allowance and policy expiry. */
  readonly now?: () => Date;
}

// ── Canonical helpers ───────────────────────────────────────────────────────

/** Canonical identity separator. Same rule as the Task 3 backfill, so both writers agree. */
export function identityKey(parts: readonly (string | number | null)[]): string {
  return parts.map(part => (part === null ? '' : String(part).normalize('NFKC').trim().toLowerCase())).join('\u241F');
}

/** Stable listing identity: product, store, marketplace, ASIN and normalized variant. */
export function listingIdentity(productId: string, storeId: string, marketplaceCode: string, asin: string, variantKey: string): string {
  return identityKey(['listing', productId, storeId, marketplaceCode, asin.toUpperCase(), canonicalVariantKey(variantKey)]);
}

/** Stable offer identity: one seller/fulfiller/condition/audience combination on one listing. */
export function offerIdentityOf(listingKey: string, sellerKey: string, fulfillerKey: string, condition: string, audience: string, version: number): string {
  return identityKey(['offer', listingKey, canonicalSellerKey(sellerKey), canonicalSellerKey(fulfillerKey), condition, audience, version]);
}

export function canonicalVariantKey(variantKey: string): string {
  return variantKey.normalize('NFKC').trim().toLowerCase();
}

export function canonicalSellerKey(sellerKey: string): string {
  return sellerKey.normalize('NFKC').trim().toLowerCase();
}

/**
 * Marketplace-default scope. `kind` (price vs delivery) is part of the key so a delivery
 * observation can never be compared as, or overwrite, a marketplace-default price scope.
 */
export function inMarketplaceScopeKey(kind: 'price' | 'delivery', marketplaceCode: string): string {
  return `${kind}:${marketplaceCode}:in-marketplace`;
}

/** Ship-to scope for one destination. SA and US never share a scope key. */
export function shipToScopeKey(kind: 'price' | 'delivery', marketplaceCode: string, country: string): string {
  return `${kind}:${marketplaceCode}:ship-to:${country}`;
}

const MARKETPLACE_FOR_COUNTRY: Readonly<Record<'SA' | 'US', MarketplaceCode>> = Object.freeze({ SA: 'SA', US: 'US' });

/** Server-derived scope. The agent supplies `shipTo` (or null) and never a scope string. */
export function deriveScopeKey(input: { kind: 'price' | 'delivery'; marketplaceCode: MarketplaceCode; shipTo: string | null }): string {
  return input.shipTo === null
    ? inMarketplaceScopeKey(input.kind, input.marketplaceCode)
    : shipToScopeKey(input.kind, input.marketplaceCode, input.shipTo);
}

/** Canonical ISO second precision so equal source timestamps produce equal identities. */
export function canonicalTimestamp(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Reject a source timestamp beyond the 60 s clock allowance or not representable. */
export function assertTimestampUsable(label: string, value: Date, now: Date): void {
  if (!Number.isFinite(value.getTime())) throw new DomainError('INVALID_INPUT', `${label} is not a valid timestamp`);
  if (value.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw new DomainError('INVALID_INPUT', `${label} is in the future beyond the ${CLOCK_SKEW_SECONDS}-second allowance`);
  }
}

/**
 * Expiry is computed from the source timestamp and the approved policy, never from an
 * agent-supplied value. Missing policy lifetime is an unverified lifetime, so it fails closed.
 */
export function computeExpiresAt(policy: SourcePolicy, field: 'priceMaxAgeSeconds' | 'deliveryMaxAgeSeconds' | 'retentionSeconds', checkedAt: Date): Date {
  const seconds = policy[field];
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    throw new DomainError('INVALID_INPUT', `Source has no approved ${field}; the record cannot be stored yet`);
  }
  return new Date(checkedAt.getTime() + seconds * 1000);
}

export function amountString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : String(value);
  return text.trim() === '' ? null : text;
}

function requireActor(actor: OfferMutationActor | undefined): OfferMutationActor {
  if (!actor || typeof actor.id !== 'string' || !actor.id) throw new DomainError('UNAUTHORIZED', 'Actor required');
  return actor;
}

function requirePublish(actor: OfferMutationActor): void {
  if (!actor.canPublish) throw new DomainError('PUBLISH_FORBIDDEN', 'Owner publishing authorization required');
}

/** A public edit is immediately public; it needs the grant, the confirmation flag and a version. */
function editorialPermission(old: { publishStatus: string }, args: { allowPublishedEdit?: boolean }, actor: OfferMutationActor): void {
  if (old.publishStatus !== 'PUBLISHED') return;
  requirePublish(actor);
  if (args.allowPublishedEdit !== true) throw new DomainError('CONFIRMATION_REQUIRED', 'Published edits are immediately public; set allowPublishedEdit:true');
}

/** Lock the owning product through its version and publication state before metadata writes.
 * The state predicate prevents a draft grant from crossing a concurrent publication. */
async function advanceProductVersion(tx: MutationDb, product: { id: string; version: number; publishStatus: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED' }, expectedVersion?: number): Promise<number> {
  if (expectedVersion !== undefined && expectedVersion !== product.version) throw new DomainError('VERSION_CONFLICT', 'Read the current product before retrying');
  const changed = await tx.product.updateMany({
    where: { id: product.id, version: product.version, publishStatus: product.publishStatus },
    data: { version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new DomainError('VERSION_CONFLICT', 'Read the current product before retrying');
  return product.version + 1;
}

async function metadataRevision(tx: MutationDb, entityType: 'listing' | 'offer', record: Record<string, any>, version: number, action: 'create' | 'update', actor: OfferMutationActor): Promise<void> {
  await tx.contentRevision.create({ data: {
    entityType, entityId: record.id, version, action, actorId: actor.id,
    snapshot: JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue,
  } });
}

function creationPermission(product: { publishStatus: string }, args: { allowPublishedEdit?: boolean; productVersion?: number }, actor: OfferMutationActor): void {
  editorialPermission(product, args, actor);
  if (product.publishStatus === 'PUBLISHED' && typeof args.productVersion !== 'number') throw new DomainError('INVALID_INPUT', 'Creating published metadata requires productVersion');
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getOffer(read: OfferReadDb, id: string, actor: OfferMutationActor | undefined): Promise<Record<string, any>> {
  requireActor(actor);
  const offer = await read.purchaseOffer.findUnique({
    where: { id },
    include: {
      listing: { include: { store: true, product: { select: { id: true, slug: true, publishStatus: true, version: true } } } },
      priceObservations: { orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }], take: 50 },
      deliveryEvidence: { orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }], take: 50 },
      legacyPriceMapping: { select: { productPriceId: true } },
    },
  });
  if (!offer) throw new DomainError('NOT_FOUND', 'Offer not found');
  return offer as Record<string, any>;
}

// ── Writes ──────────────────────────────────────────────────────────────────

async function upsertListing(read: OfferReadDb, tx: MutationDb, a: any, actor: OfferMutationActor): Promise<Record<string, any>> {
  requireActor(actor);
  const { idempotencyKey: _omit, ...args } = a;
  const product = await read.product.findUnique({ where: { id: args.productId } });
  if (!product) throw new DomainError('NOT_FOUND', 'Product not found');
  const store = await readLockedStore(tx, args.storeId);
  if (!store) throw new DomainError('NOT_FOUND', 'Store not found');
  if (!isMarketplaceUrl(args.sourceUrl, args.marketplaceCode)) throw new DomainError('INVALID_INPUT', 'URL must match the exact marketplace');
  // A store that declares another marketplace cannot host this listing: no silent re-store.
  if (store.marketplaceCode !== null && store.marketplaceCode !== args.marketplaceCode) {
    throw new DomainError('INVALID_INPUT', 'Store belongs to a different marketplace');
  }

  const identity = listingIdentity(args.productId, args.storeId, args.marketplaceCode, args.asin, args.variantKey);
  const existing = args.id
    ? await read.marketplaceListing.findUnique({ where: { id: args.id } })
    : await read.marketplaceListing.findUnique({ where: { identityKey: identity } });
  if (args.id && !existing) throw new DomainError('NOT_FOUND', 'Listing not found');

  if (!existing) {
    // The listing carries catalog structure for a product, so it is an editorial write.
    creationPermission(product, args, actor);
    const productVersion = await advanceProductVersion(tx, product, args.productVersion);
    const created = await tx.marketplaceListing.create({
      data: {
        productId: args.productId,
        storeId: args.storeId,
        marketplaceCode: args.marketplaceCode,
        asin: args.asin.toUpperCase(),
        variantKey: canonicalVariantKey(args.variantKey),
        sourceUrl: args.sourceUrl,
        identityKey: identity,
      },
    });
    await metadataRevision(tx, 'listing', created, productVersion, 'create', actor);
    return { ...created, created: true, productVersion };
  }

  if (existing.identityKey !== identity) {
    // Moving a row onto another product/ASIN/store would silently re-attribute its offers.
    throw new DomainError('INVALID_INPUT', 'Listing identity is immutable; create the missing listing instead');
  }
  if (args.productVersion !== undefined && args.productVersion !== product.version) throw new DomainError('VERSION_CONFLICT', 'Read the current product before retrying');
  const data: Record<string, unknown> = {};
  if (existing.sourceUrl !== args.sourceUrl) data.sourceUrl = args.sourceUrl;
  if (!Object.keys(data).length) return { ...existing, created: false, productVersion: product.version };

  // The listing source URL is public product metadata: a published product follows the
  // published-edit rule and the version-conflict rule, in the caller's transaction.
  editorialPermission(product, args, actor);
  if (typeof args.productVersion !== 'number') throw new DomainError('INVALID_INPUT', 'Updating listing metadata requires productVersion');
  const productVersion = await advanceProductVersion(tx, product, args.productVersion);
  const updated = await tx.marketplaceListing.update({ where: { id: existing.id }, data });
  await metadataRevision(tx, 'listing', updated, productVersion, 'update', actor);
  return { ...updated, created: false, productVersion };
}

async function upsertOffer(read: OfferReadDb, tx: MutationDb, a: any, actor: OfferMutationActor): Promise<Record<string, any>> {
  const { idempotencyKey: _omit, ...args } = a;
  const listing = await read.marketplaceListing.findUnique({ where: { id: args.listingId }, include: { product: true } });
  if (!listing) throw new DomainError('NOT_FOUND', 'Listing not found');

  const sellerKey = canonicalSellerKey(args.sellerKey);
  const fulfillerKey = canonicalSellerKey(args.fulfillerKey);
  const condition = args.condition;
  const audience = args.audience;
  const identity = offerIdentityOf(listing.identityKey, sellerKey, fulfillerKey, condition, audience, 1);
  const existing = args.id
    ? await read.purchaseOffer.findUnique({ where: { id: args.id } })
    : await read.purchaseOffer.findUnique({ where: { identityKey: identity } });
  if (args.id && !existing) throw new DomainError('NOT_FOUND', 'Offer not found');

  if (!existing) {
    creationPermission(listing.product, args, actor);
    const productVersion = await advanceProductVersion(tx, listing.product, args.productVersion);
    const created = await tx.purchaseOffer.create({
      data: {
        listingId: listing.id,
        sellerKey,
        fulfillerKey,
        condition,
        audience,
        version: 1,
        isActive: args.isActive !== false,
        identityKey: identity,
      },
    });
    await metadataRevision(tx, 'offer', created, created.version, 'create', actor);
    return { ...created, created: true, productVersion };
  }

  if (existing.listingId !== listing.id) throw new DomainError('INVALID_INPUT', 'Offer belongs to a different listing');
  if (args.expectedVersion !== undefined && args.expectedVersion !== existing.version) throw new DomainError('VERSION_CONFLICT', 'Read the current offer before retrying');
  if (args.productVersion !== undefined && args.productVersion !== listing.product.version) throw new DomainError('VERSION_CONFLICT', 'Read the current product before retrying');
  const editable = ['isActive'] as const;
  const touchesMetadata = editable.some(field => args[field] !== undefined && args[field] !== existing[field]);
  if (!touchesMetadata) return { ...existing, created: false, productVersion: listing.product.version };

  editorialPermission(listing.product, args, actor);
  // enforce() rejects the edit before this point; the check is repeated so a direct caller cannot skip it.
  if (typeof args.expectedVersion !== 'number') throw new DomainError('INVALID_INPUT', 'Updating offer metadata requires expectedVersion');
  const data: Record<string, unknown> = {};
  if (args.isActive !== undefined) data.isActive = args.isActive;
  const productVersion = await advanceProductVersion(tx, listing.product);
  const changed = await tx.purchaseOffer.updateMany({ where: { id: existing.id, version: args.expectedVersion }, data: { ...data, version: { increment: 1 } } });
  if (changed.count !== 1) throw new DomainError('VERSION_CONFLICT', 'Read the current offer before retrying');
  const updated = await tx.purchaseOffer.findUniqueOrThrow({ where: { id: existing.id } });
  await metadataRevision(tx, 'offer', updated, updated.version, 'update', actor);
  return { ...updated, created: false, productVersion };
}

interface OfferContext {
  offer: any;
  listing: any;
  product: any;
  policy: SourcePolicy;
}

async function loadOfferForSource(read: OfferReadDb, offerId: string, sellerKey: string, fulfillerKey: string, marketplaceCode: string, sourceId: string): Promise<OfferContext> {
  const offer = await read.purchaseOffer.findUnique({ where: { id: offerId }, include: { listing: { include: { product: true } } } });
  if (!offer) throw new DomainError('NOT_FOUND', 'Offer not found');
  const listing = offer.listing;
  if (listing.marketplaceCode !== marketplaceCode) {
    throw new DomainError('INVALID_INPUT', 'Marketplace does not match the offer listing');
  }
  // Evidence identity returns to the offer's own seller and fulfiller, never a client claim.
  if (offer.sellerKey !== canonicalSellerKey(sellerKey) || !offer.fulfillerKey || offer.fulfillerKey !== canonicalSellerKey(fulfillerKey)) {
    throw new DomainError('INVALID_INPUT', 'Observation must identify the offer seller and fulfiller');
  }
  // Fails closed for unknown/cross-market/unverified sources: no fallback source is tried.
  const policy = requireEnabledSourcePolicy(sourceId, marketplaceCode);
  return { offer, listing, product: listing.product, policy };
}

async function recordOfferPrice(read: OfferReadDb, tx: MutationDb, a: any, actor: OfferMutationActor, now: Date): Promise<Record<string, any>> {
  const { idempotencyKey: _omit, ...args } = a;
  const context = await loadOfferForSource(read, args.offerId, args.sellerKey, args.fulfillerKey, args.marketplaceCode, args.sourceId);
  const { offer, listing, product, policy } = context;
  // A price observation is not editorial content: it never needs a publishing grant by
  // itself. It maps to the published product and is gated by its pinned, enabled source.
  if (!isMarketplaceUrl(args.sourceUrl, listing.marketplaceCode)) throw new DomainError('INVALID_INPUT', 'URL must match the exact marketplace');
  const checkedAt = new Date(args.checkedAt);
  // One rule for future source timestamps: the contract's 60-second clock skew.
  assertTimestampUsable('checkedAt', checkedAt, now);
  const expiresAt = computeExpiresAt(policy, 'priceMaxAgeSeconds', checkedAt);

  // Member price is its own observation; it is never folded into the public one.
  const scopeKey = deriveScopeKey({ kind: 'price', marketplaceCode: listing.marketplaceCode, shipTo: args.shipTo ?? null });
  const price = args.price ?? null;
  const originalPrice = args.originalPrice ?? null;
  if (price && !isCurrencyApprovedForMarketplace(price.currency, listing.marketplaceCode)) {
    throw new DomainError('INVALID_INPUT', 'Price currency is not approved for this marketplace');
  }
  if (originalPrice && (!price || originalPrice.currency !== price.currency)) {
    throw new DomainError('INVALID_INPUT', 'originalPrice must share the price currency');
  }
  const identity = identityKey([
    'observation', offer.id, scopeKey, args.shipTo ?? null, args.audience, args.taxBasis, args.availability,
    price ? price.amount : null, price ? price.currency : null,
    originalPrice ? originalPrice.amount : null, policy.sourceId, canonicalTimestamp(checkedAt),
  ]);
  const stored = await read.offerPriceObservation.findUnique({ where: { identityKey: identity } });
  if (stored) return { ...stored, created: false, storedScope: scopeKey, productVersion: product.version };
  const row = await tx.offerPriceObservation.create({
    data: {
      offerId: offer.id,
      scopeKey,
      shipTo: args.shipTo ?? null,
      amount: price ? price.amount : null,
      currency: price ? price.currency : null,
      originalAmount: originalPrice ? originalPrice.amount : null,
      audience: args.audience,
      availability: args.availability,
      taxBasis: args.taxBasis,
      sourceId: policy.sourceId,
      sourceUrl: args.sourceUrl,
      checkedAt,
      expiresAt,
      identityKey: identity,
    },
  });
  return { ...row, created: true, storedScope: scopeKey, productVersion: product.version };
}

async function recordDeliveryEvidence(read: OfferReadDb, tx: MutationDb, a: any, actor: OfferMutationActor, now: Date): Promise<Record<string, any>> {
  const { idempotencyKey: _omit, ...args } = a;
  const context = await loadOfferForSource(read, args.offerId, args.sellerKey, args.fulfillerKey, args.marketplaceCode, args.sourceId);
  const { offer, listing, product, policy } = context;
  if (!isMarketplaceUrl(args.sourceUrl, listing.marketplaceCode)) throw new DomainError('INVALID_INPUT', 'URL must match the exact marketplace');
  const checkedAt = new Date(args.checkedAt);
  assertTimestampUsable('checkedAt', checkedAt, now);
  // T1 found no delivery field: an approved-integer lifetime is required before storage.
  const expiresAt = computeExpiresAt(policy, 'deliveryMaxAgeSeconds', checkedAt);
  // The destination is required and explicit; SA evidence never stands in for US.
  if (args.country !== 'SA' && args.country !== 'US') throw new DomainError('INVALID_INPUT', 'Country must be SA or US');
  // The offer's marketplace must trade with that destination; a US offer is not SA delivery evidence.
  const destinationMarketplace = MARKETPLACE_FOR_COUNTRY[args.country as 'SA' | 'US'];
  if (listing.marketplaceCode !== destinationMarketplace) {
    throw new DomainError('INVALID_INPUT', 'Delivery evidence country must match the offer marketplace');
  }
  const scopeKey = shipToScopeKey('delivery', listing.marketplaceCode, args.country);
  const identity = identityKey(['delivery', offer.id, args.country, args.precision, args.state, policy.sourceId, canonicalTimestamp(checkedAt)]);
  const stored = await read.offerDeliveryEvidence.findUnique({ where: { identityKey: identity } });
  if (stored) return { ...stored, created: false, storedScope: scopeKey, productVersion: product.version };
  const row = await tx.offerDeliveryEvidence.create({
    data: {
      offerId: offer.id,
      country: args.country,
      precision: args.precision,
      state: args.state,
      sourceId: policy.sourceId,
      sourceUrl: args.sourceUrl,
      checkedAt,
      expiresAt,
      identityKey: identity,
    },
  });
  return { ...row, created: true, storedScope: scopeKey, productVersion: product.version };
}

async function recordFxSnapshot(read: OfferReadDb, tx: MutationDb, a: any, actor: OfferMutationActor, now: Date): Promise<Record<string, any>> {
  requireActor(actor);
  const { idempotencyKey: _omit, ...args } = a;
  // No FX source is approved (Task 1/Task 5). This fails closed with no guessed source.
  const policy = requireEnabledSourcePolicy(args.sourceId, 'SA');
  const asOf = new Date(args.asOf);
  assertTimestampUsable('asOf', asOf, now);
  const expiresAt = computeExpiresAt(policy, 'retentionSeconds', asOf);
  const rates: Record<string, string> = Object.fromEntries(Object.entries(args.rates as Record<string, string>).sort(([left], [right]) => left.localeCompare(right)));
  const identity = identityKey(['fx', args.base, policy.sourceId, canonicalTimestamp(asOf)]);
  const stored = await read.fxSnapshot.findUnique({ where: { identityKey: identity } });
  if (stored) return { ...stored, created: false };
  const row = await tx.fxSnapshot.create({ data: { base: args.base, rates, sourceId: policy.sourceId, asOf, expiresAt, identityKey: identity } });
  return { ...row, created: true };
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * A saved-result marker is derived from the request identity alone, never from a fresh
 * timestamp: replaying the same operation must reuse the stored result after an ambiguous
 * network failure, including after a commit whose reply was lost.
 */
function stableInputFor(input: Record<string, unknown>): Record<string, unknown> {
  // A fresh-clock call replays the same identity when the timestamp is unchanged.
  return input;
}

export function offerMutationInputHash(key: string, input: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify({ name: key, input: stableInputFor(input) })).digest('hex');
}

/**
 * Apply one offer mutation inside the caller's existing transaction client. The driver keeps
 * the `OperationReceipt` key/hash discipline; this function is pure application logic plus
 * the write itself, and returns the canonical saved record.
 */
export async function applyOfferMutation(
  tx: MutationDb,
  name: OfferWriteName,
  args: Record<string, unknown>,
  actor: OfferMutationActor,
  options: OfferMutationOptions = {},
): Promise<SavedMutation> {
  const safeActor = requireActor(actor);
  if (!(OFFER_MUTATION_NAMES as readonly string[]).includes(name)) throw new DomainError('NOT_FOUND', 'Unknown offer mutation');
  const idempotencyKey = args.idempotencyKey;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) throw new DomainError('INVALID_INPUT', 'idempotencyKey is required');
  const clock = options.now ?? (() => new Date());
    let record: Record<string, any>;
  switch (name) {
    case 'bp_upsert_listing': record = await upsertListing(tx, tx, args, safeActor); break;
    case 'bp_upsert_offer': record = await upsertOffer(tx, tx, args, safeActor); break;
    case 'bp_record_offer_price': record = await recordOfferPrice(tx, tx, args, safeActor, clock()); break;
    case 'bp_record_delivery_evidence': record = await recordDeliveryEvidence(tx, tx, args, safeActor, clock()); break;
    case 'bp_record_fx_snapshot': record = await recordFxSnapshot(tx, tx, args, safeActor, clock()); break;
    default: throw new DomainError('NOT_FOUND', 'Unknown offer mutation');
  }
  return {
    tool: name,
    record,
    idempotency: { key: idempotencyKey, inputHash: offerMutationInputHash(name, args), identityKey: String(record.identityKey ?? record.id ?? '') },
  };
}
