/**
 * Source policy for international marketplace data.
 * Reflects T1 findings: no source is VERIFIED yet; all policies default to enabled:false.
 * Pure types and resolver — no Prisma, node:fs, or env dependencies.
 */

import type { MarketplaceCode } from './marketplaces';
import { DomainError } from './errors';

export interface SourcePolicy {
  readonly sourceId: string;
  readonly marketplaceCode: MarketplaceCode;
  readonly transport: string;
  readonly priceMaxAgeSeconds: number | null;
  readonly deliveryMaxAgeSeconds: number | null;
  readonly retentionSeconds: number | null;
  readonly enabled: boolean;
  readonly allowConversion: boolean;
  readonly allowAssistant: boolean;
  readonly allowBareLink: boolean;
  readonly status: 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE';
}

/**
 * Registry of known source policies derived from T1 (docs/operations/market-data-sources.md).
 * All entries are disabled until their respective marketplaces achieve VERIFIED status.
 */
const SOURCE_POLICIES: ReadonlyMap<string, SourcePolicy> = new Map([
  ['amazon-creators-api-sa', {
    sourceId: 'amazon-creators-api-sa',
    marketplaceCode: 'SA',
    transport: 'CREATORS_API_OAUTH2',
    priceMaxAgeSeconds: 3600,
    deliveryMaxAgeSeconds: null, // No delivery evidence available per T1
    retentionSeconds: 3600,
    enabled: false,
    allowConversion: false,
    allowAssistant: false,
    allowBareLink: false,
    status: 'UNVERIFIED',
  }],
  ['amazon-creators-api-us', {
    sourceId: 'amazon-creators-api-us',
    marketplaceCode: 'US',
    transport: 'CREATORS_API_OAUTH2',
    priceMaxAgeSeconds: 3600,
    deliveryMaxAgeSeconds: null,
    retentionSeconds: 3600,
    enabled: false,
    allowConversion: false,
    allowAssistant: false,
    allowBareLink: false,
    status: 'UNVERIFIED',
  }],
  ['amazon-paapi5-sa', {
    sourceId: 'amazon-paapi5-sa',
    marketplaceCode: 'SA',
    transport: 'PAAPI5_DEPRECATED',
    priceMaxAgeSeconds: null,
    deliveryMaxAgeSeconds: null,
    retentionSeconds: null,
    enabled: false,
    allowConversion: false,
    allowAssistant: false,
    allowBareLink: false,
    status: 'UNAVAILABLE',
  }],
  ['amazon-paapi5-us', {
    sourceId: 'amazon-paapi5-us',
    marketplaceCode: 'US',
    transport: 'PAAPI5_DEPRECATED',
    priceMaxAgeSeconds: null,
    deliveryMaxAgeSeconds: null,
    retentionSeconds: null,
    enabled: false,
    allowConversion: false,
    allowAssistant: false,
    allowBareLink: false,
    status: 'UNAVAILABLE',
  }],
]);

// Runtime immutability matters: a reader must not activate the shared registry.
for (const policy of SOURCE_POLICIES.values()) Object.freeze(policy);

/** Resolve a known policy for inspection; unknown/cross-market sources fail closed.
 * A known disabled policy is NOT authorization to collect or publish content.
 */
export function resolveSourcePolicy(
  sourceId: string,
  marketplaceCode: string,
): SourcePolicy {
  const policy = SOURCE_POLICIES.get(sourceId);
  if (!policy || policy.marketplaceCode !== marketplaceCode) {
    throw new DomainError('INVALID_INPUT', 'Unapproved source for marketplace');
  }
  return policy;
}

/** Mutation/updater gate, deliberately separate from policy discovery. */
export function requireEnabledSourcePolicy(sourceId: string, marketplaceCode: string): SourcePolicy {
  const policy = resolveSourcePolicy(sourceId, marketplaceCode);
  if (!policy.enabled || policy.status !== 'VERIFIED') {
    throw new DomainError('INVALID_INPUT', 'Source is not enabled and verified');
  }
  return policy;
}

/** Get all registered source policies (read-only). */
export function getAllSourcePolicies(): readonly SourcePolicy[] {
  return Array.from(SOURCE_POLICIES.values());
}

/**
 * Look up a policy without asserting a marketplace (coupon scope checks).
 * Returns undefined for an unknown source; still not an activation signal.
 */
export function couponSourcePolicy(sourceId: string | null | undefined): SourcePolicy | undefined {
  if (typeof sourceId !== 'string' || !sourceId.trim()) return undefined;
  return SOURCE_POLICIES.get(sourceId.trim());
}