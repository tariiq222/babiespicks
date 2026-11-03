/** Library entry point only: no CLI, scheduler, database client or network adapter.
 * Task 1 approved no live source. A future adapter requires separate evidence and
 * approval; injecting a client alone cannot enable a source. Existing authorized
 * writer may call this after Task 11, never alongside a second scheduled writer.
 */
import { createHash } from 'node:crypto';
import { schemas } from '../../packages/domain/src/contracts';
import { resolveSourcePolicy } from '../../packages/domain/src/source-policy';
import { APPROVED_FX_SOURCE_POLICIES, fxPolicyAllows, type FxSourcePolicy } from '../../packages/domain/src/fx';
import type { Audience, DeliveryCountry, FxSnapshot } from '../../packages/domain/src/international-contracts';

export interface PriceRefreshJob {
  offerId: string; sourceId: string; marketplaceCode: 'SA' | 'US';
  sellerKey: string; fulfillerKey: string; audience: Audience; shipTo: DeliveryCountry | null;
}
export interface RefreshHistory { lastSuccessAt: string | null; lastFailureAt: string | null }
export interface RefreshChannelReport extends RefreshHistory {
  status: 'OK' | 'FAILED' | 'DISABLED' | 'IDLE'; saved: number; deferred: number;
  /** Fixed codes only; never log provider payloads, prices, tokens or exception text. */
  reasons: string[];
}
export interface RefreshReport { startedAt: string; price: RefreshChannelReport; fx: RefreshChannelReport }
export interface RefreshConfig {
  priceJobs: readonly PriceRefreshJob[]; fxSourceId?: string;
  batchSize?: number; timeoutMs?: number;
  previous?: { price: RefreshHistory; fx: RefreshHistory };
}
export interface RefreshClients {
  mcp: {
    listTools(options?: { signal: AbortSignal }): Promise<unknown>;
    callTool(input: { name: string; arguments: Record<string, unknown> }, options?: { signal: AbortSignal }): Promise<unknown>;
  };
  /** Normalized responses, not HTML/model text. Still validated via MCP schema. */
  priceSources?: Readonly<Record<string, { fetchPrice(job: PriceRefreshJob, options: { signal: AbortSignal }): Promise<unknown> }>>;
  fxSources?: Readonly<Record<string, { fetchSnapshot(options: { signal: AbortSignal }): Promise<unknown> }>>;
  /** Trusted server-only policy fixture seam. Empty by default, NOT env enabled. */
  fxPolicies?: readonly FxSourcePolicy[];
  now?: () => Date;
}
export class TransientMarketDataError extends Error {
  constructor() { super('Transient market data failure'); this.name = 'TransientMarketDataError'; }
}
class RefreshFailure extends Error {
  constructor(readonly code: string) { super(code); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RefreshFailure('INVALID_RESPONSE');
  return value as Record<string, unknown>;
}
/** SDK structuredContent or direct test transport. Never extract facts from text. */
function toolResult(value: unknown): Record<string, unknown> {
  const response = record(value);
  if (response.isError === true) throw new RefreshFailure('MCP_REJECTED');
  const result = response.structuredContent ? record(response.structuredContent) : response;
  if (result.ok === false || result.error) throw new RefreshFailure('MCP_REJECTED');
  return result;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function operationKey(tool: string, payload: Record<string, unknown>): string {
  // Same source observation => same key, across batches/retries and clock changes.
  return `market-data:${createHash('sha256').update(JSON.stringify(canonical({ tool, payload }))).digest('hex')}`;
}
async function bounded<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  // Timeout is NOT retried: an adapter may ignore cancellation; avoid starting an
  // overlapping request after an ambiguous write. Next run uses the stable key.
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new RefreshFailure('TIMEOUT')); }, timeoutMs);
      })]);
    } catch (error) {
      if (!(error instanceof TransientMarketDataError) || attempt >= 1) throw error;
    } finally { if (timer) clearTimeout(timer); }
  }
}
function fail(channel: RefreshChannelReport, error: unknown, time: string) {
  channel.status = 'FAILED'; channel.lastFailureAt = time;
  channel.reasons.push(error instanceof RefreshFailure ? error.code : 'SOURCE_UNAVAILABLE');
}
function channel(history?: RefreshHistory): RefreshChannelReport {
  return { status: 'IDLE', saved: 0, deferred: 0, lastSuccessAt: history?.lastSuccessAt ?? null, lastFailureAt: history?.lastFailureAt ?? null, reasons: [] };
}
function defer(result: RefreshChannelReport, reason: string) {
  result.deferred++; result.reasons.push(reason);
  if (result.status === 'IDLE') result.status = 'DISABLED';
}
export async function refreshMarketData(config: RefreshConfig, clients: RefreshClients): Promise<RefreshReport> {
  const batchSize = config.batchSize ?? 10, timeoutMs = config.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new RefreshFailure('INVALID_LIMITS');
  const now = (clients.now ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime())) throw new RefreshFailure('INVALID_CLOCK');
  const time = now.toISOString();
  const report: RefreshReport = { startedAt: time, price: channel(config.previous?.price), fx: channel(config.previous?.fx) };
  let capabilities: Record<string, unknown>, tools: Set<string>;
  try {
    // Inspect actual contracts/capabilities before fetching data or writing anything.
    const list = record(await bounded(signal => clients.mcp.listTools({ signal }), timeoutMs));
    tools = new Set(Array.isArray(list.tools) ? list.tools.map(item => record(item).name).filter((name): name is string => typeof name === 'string') : []);
    capabilities = record(toolResult(await bounded(signal => clients.mcp.callTool({ name: 'bp_get_capabilities', arguments: {} }, { signal }), timeoutMs)).internationalOffers);
  } catch (error) {
    if (config.priceJobs.length) fail(report.price, error, time);
    if (config.fxSourceId) fail(report.fx, error, time);
    return report;
  }
  const available = capabilities.contractVersion === 2 && capabilities.enabled === true;
  for (const job of config.priceJobs.slice(0, batchSize)) {
    try {
      const policy = resolveSourcePolicy(job.sourceId, job.marketplaceCode);
      const remotePolicy = Array.isArray(capabilities.sourcePolicies) && capabilities.sourcePolicies.some(item => {
        const p = record(item); return p.sourceId === job.sourceId && p.marketplaceCode === job.marketplaceCode && p.enabled === true && p.status === 'VERIFIED';
      });
      if (!available || !tools.has('bp_record_offer_price') || !policy.enabled || policy.status !== 'VERIFIED' || !remotePolicy || !policy.priceMaxAgeSeconds || !policy.retentionSeconds) { defer(report.price, 'SOURCE_DISABLED'); continue; }
      const adapter = clients.priceSources?.[job.sourceId];
      if (!adapter) { defer(report.price, 'NO_APPROVED_ADAPTER'); continue; }
      const raw = record(await bounded(signal => adapter.fetchPrice(job, { signal }), timeoutMs));
      const key = operationKey('bp_record_offer_price', raw);
      const input = schemas.bp_record_offer_price.parse({ ...raw, idempotencyKey: key });
      for (const field of ['offerId', 'sourceId', 'marketplaceCode', 'sellerKey', 'fulfillerKey', 'audience', 'shipTo'] as const) if (input[field] !== job[field]) throw new RefreshFailure('IDENTITY_MISMATCH');
      const checkedAt = Date.parse(input.checkedAt);
      if (checkedAt > now.getTime() + 60000 || checkedAt + Math.min(policy.priceMaxAgeSeconds, policy.retentionSeconds) * 1000 <= now.getTime()) throw new RefreshFailure('STALE_OBSERVATION');
      toolResult(await bounded(signal => clients.mcp.callTool({ name: 'bp_record_offer_price', arguments: input }, { signal }), timeoutMs));
      report.price.saved++;
    } catch (error) { fail(report.price, error, time); }
  }
  report.price.deferred += Math.max(0, config.priceJobs.length - batchSize);
  if (report.price.saved && report.price.status !== 'FAILED') { report.price.status = 'OK'; report.price.lastSuccessAt = time; }
  if (config.fxSourceId) {
    try {
      const policy = (clients.fxPolicies ?? APPROVED_FX_SOURCE_POLICIES).find(p => p.sourceId === config.fxSourceId && p.enabled && p.status === 'VERIFIED');
      const adapter = clients.fxSources?.[config.fxSourceId];
      if (!available || !tools.has('bp_record_fx_snapshot') || !policy || !adapter) defer(report.fx, 'NO_APPROVED_FX_SOURCE');
      else {
        const raw = record(await bounded(signal => adapter.fetchSnapshot({ signal }), timeoutMs));
        const input = schemas.bp_record_fx_snapshot.parse({ ...raw, idempotencyKey: operationKey('bp_record_fx_snapshot', raw) });
        if (input.sourceId !== config.fxSourceId) throw new RefreshFailure('IDENTITY_MISMATCH');
        // Expiry remains server-derived; this temporary view validates age only.
        const snapshot: FxSnapshot = { ...input, id: input.idempotencyKey, expiresAt: new Date(Date.parse(input.asOf) + policy.maxAgeSeconds * 1000).toISOString() };
        if (!fxPolicyAllows(snapshot, policy, now)) throw new RefreshFailure('STALE_SNAPSHOT');
        toolResult(await bounded(signal => clients.mcp.callTool({ name: 'bp_record_fx_snapshot', arguments: input }, { signal }), timeoutMs));
        report.fx.saved++; report.fx.status = 'OK'; report.fx.lastSuccessAt = time;
      }
    } catch (error) { fail(report.fx, error, time); }
  }
  return report;
}
