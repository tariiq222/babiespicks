import type { FxSnapshot } from './international-contracts';
import { isUsableFxSnapshot } from './money';

export interface FxSourcePolicy {
  readonly sourceId: string;
  readonly enabled: boolean;
  readonly status: 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE';
  readonly maxAgeSeconds: number;
  /** Explicit dated provider closure; never an inferred weekend or indefinite TTL. */
  readonly holidayWindows: readonly { startsAt: string; endsAt: string; maxAgeSeconds: number; evidenceUrl: string }[];
}
/** Task 1 verified no FX provider. No ECB fallback, URL or credentials to guess. */
export const APPROVED_FX_SOURCE_POLICIES: readonly FxSourcePolicy[] = Object.freeze([]);
export interface FxSnapshotRow {
  id: string; base: string; rates: unknown; sourceId: string;
  asOf: Date | string; expiresAt: Date | string;
}
export interface FxSnapshotRepository {
  fxSnapshot: { findFirst(args: { where: { sourceId: { in: string[] } }; orderBy: ({ asOf: 'desc' } | { id: 'asc' })[] }): Promise<FxSnapshotRow | null> };
  /** Trusted server composition seam for isolated fixtures/future approved policy.
   * Never derive this from query parameters, env or stored snapshot content. */
  fxPolicies?: readonly FxSourcePolicy[];
}
export function fxPolicyAllows(snapshot: FxSnapshot, policy: FxSourcePolicy, now: Date): boolean {
  if (!policy.enabled || policy.status !== 'VERIFIED' || policy.sourceId !== snapshot.sourceId || !Number.isSafeInteger(policy.maxAgeSeconds) || policy.maxAgeSeconds <= 0 || !isUsableFxSnapshot(snapshot, now)) return false;
  let maxAge = policy.maxAgeSeconds;
  for (const holiday of policy.holidayWindows) {
    const start = Date.parse(holiday.startsAt), end = Date.parse(holiday.endsAt);
    let evidence = false;
    try { const url = new URL(holiday.evidenceUrl); evidence = url.protocol === 'https:' && !url.username && !url.password; } catch { /* no evidence, no extension */ }
    if (evidence && Number.isSafeInteger(holiday.maxAgeSeconds) && holiday.maxAgeSeconds > 0 && start <= now.getTime() && now.getTime() < end && end > start) maxAge = Math.max(maxAge, holiday.maxAgeSeconds);
  }
  return now.getTime() - Date.parse(snapshot.asOf) < maxAge * 1000;
}

/** One read for the WHOLE request. Newest trusted snapshot first, then validation;
 * never mix pairs across snapshots or hide an invalid newest row with an older one.
 * On outage/expiry return null: consumers keep original Money untouched. */
export async function getFxSnapshot(db: FxSnapshotRepository, currencies: string[], now: Date): Promise<FxSnapshot | null> {
  const policies = (db.fxPolicies ?? APPROVED_FX_SOURCE_POLICIES).filter(p => p.enabled && p.status === 'VERIFIED');
  if (!policies.length || !currencies.length || currencies.some(c => !/^[A-Z]{3}$/.test(c)) || !Number.isFinite(now.getTime())) return null;
  try {
    const row = await db.fxSnapshot.findFirst({ where: { sourceId: { in: policies.map(p => p.sourceId) } }, orderBy: [{ asOf: 'desc' }, { id: 'asc' }] });
    if (!row || typeof row.rates !== 'object' || row.rates === null || Array.isArray(row.rates)) return null;
    const snapshot: FxSnapshot = { id: row.id, base: row.base, rates: { ...row.rates } as Record<string, string>, sourceId: row.sourceId, asOf: new Date(row.asOf).toISOString(), expiresAt: new Date(row.expiresAt).toISOString() };
    const policy = policies.find(p => p.sourceId === row.sourceId);
    if (!policy || !fxPolicyAllows(snapshot, policy, now) || currencies.some(c => c !== snapshot.base && !Object.hasOwn(snapshot.rates, c))) return null;
    return snapshot;
  } catch { return null; }
}
