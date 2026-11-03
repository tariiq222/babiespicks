import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFxSnapshot, type FxSourcePolicy } from './fx';
import { refreshMarketData, TransientMarketDataError } from '../../../scripts/operations/refresh-market-data';
import * as sourcePolicies from './source-policy';

const now = new Date('2026-11-02T12:00:00Z');
const policy: FxSourcePolicy = { sourceId: 'fixture-fx', enabled: true, status: 'VERIFIED', maxAgeSeconds: 86400, holidayWindows: [] };
const row = { id: 'fx-1', base: 'USD', rates: { SAR: '3.75' }, sourceId: policy.sourceId, asOf: new Date('2026-11-02T11:00:00Z'), expiresAt: new Date('2026-11-02T13:00:00Z') };
const priceJob = { offerId: 'offer-1', marketplaceCode: 'SA', sourceId: 'amazon-creators-api-sa', sellerKey: 'seller', fulfillerKey: 'fulfiller', audience: 'PUBLIC', shipTo: null } as const;
const observation = { ...priceJob, checkedAt: '2026-11-02T11:30:00Z', sourceUrl: 'https://amazon.sa/dp/B000000001', taxBasis: 'UNKNOWN', availability: 'AVAILABLE', price: { amount: '100', currency: 'SAR' }, originalPrice: null };
const toolNames = ['bp_record_offer_price', 'bp_record_fx_snapshot'];
function clients() {
  return { mcp: { listTools: vi.fn(async () => ({ tools: toolNames.map(name => ({ name })) })), callTool: vi.fn(async ({ name }: { name: string; arguments: Record<string, unknown> }) => name === 'bp_get_capabilities' ? { internationalOffers: { contractVersion: 2, enabled: true, sourcePolicies: [{ ...sourcePolicies.resolveSourcePolicy(priceJob.sourceId, 'SA'), enabled: true, status: 'VERIFIED' }] } } : { saved: true }) }, priceSources: { [priceJob.sourceId]: { fetchPrice: vi.fn(async () => observation) } }, fxSources: { [policy.sourceId]: { fetchSnapshot: vi.fn(async () => ({ base: 'USD', rates: { SAR: '3.75' }, sourceId: policy.sourceId, asOf: row.asOf.toISOString() })) } }, now: () => now };
}
function enableFixturePrice() { vi.spyOn(sourcePolicies, 'resolveSourcePolicy').mockReturnValue({ ...sourcePolicies.resolveSourcePolicy(priceJob.sourceId, 'SA'), enabled: true, status: 'VERIFIED' }); }
afterEach(() => vi.restoreAllMocks());
describe('getFxSnapshot — one trusted snapshot per request', () => {
  it('defaults to disabled with no approved T1 FX source and no database read', async () => {
    const findFirst = vi.fn(async () => row);
    expect(await getFxSnapshot({ fxSnapshot: { findFirst } }, ['USD', 'SAR'], now)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('reads once for the whole currency set and preserves provenance', async () => {
    const findFirst = vi.fn(async () => row);
    expect(await getFxSnapshot({ fxSnapshot: { findFirst }, fxPolicies: [policy] }, ['USD', 'SAR', 'USD'], now)).toEqual({ ...row, asOf: row.asOf.toISOString(), expiresAt: row.expiresAt.toISOString() });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
  it('does not fall back to an older row after missing SAR or expired newest snapshot', async () => {
    for (const newest of [{ ...row, rates: {} }, { ...row, expiresAt: now }]) {
      const findFirst = vi.fn(async () => newest);
      expect(await getFxSnapshot({ fxSnapshot: { findFirst }, fxPolicies: [policy] }, ['USD', 'SAR'], now)).toBeNull();
      expect(findFirst).toHaveBeenCalledTimes(1);
    }
  });
  it('allows a documented synthetic provider holiday only within policy and stored expiry', async () => {
    // Synthetic provider closure, NOT evidence of a real provider or an ECB/SAR assumption.
    const holidayPolicy: FxSourcePolicy = { ...policy, holidayWindows: [{ startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-03T00:00:00Z', maxAgeSeconds: 4 * 86400, evidenceUrl: 'https://fixture.invalid/provider-calendar' }] };
    const holidayRow = { ...row, asOf: new Date('2026-10-30T12:00:00Z') };
    const fxSnapshot = { findFirst: vi.fn(async () => holidayRow) };
    expect(await getFxSnapshot({ fxSnapshot, fxPolicies: [policy] }, ['SAR'], now)).toBeNull();
    expect(await getFxSnapshot({ fxSnapshot, fxPolicies: [holidayPolicy] }, ['SAR'], now)).not.toBeNull();
    expect(await getFxSnapshot({ fxSnapshot: { findFirst: vi.fn(async () => ({ ...holidayRow, expiresAt: now })) }, fxPolicies: [holidayPolicy] }, ['SAR'], now)).toBeNull();
  });
  it('degrades safely on repository outage', async () => {
    expect(await getFxSnapshot({ fxSnapshot: { findFirst: vi.fn().mockRejectedValue(new Error('down')) }, fxPolicies: [policy] }, ['SAR'], now)).toBeNull();
  });
});
describe('refreshMarketData — bounded MCP-only observations', () => {
  it('does not collect disabled T1 sources or invent an FX adapter', async () => {
    const c = clients();
    const result = await refreshMarketData({ priceJobs: [priceJob], fxSourceId: policy.sourceId }, c);
    expect(result.price.status).toBe('DISABLED');
    expect(result.fx.status).toBe('DISABLED');
    expect(c.priceSources[priceJob.sourceId]!.fetchPrice).not.toHaveBeenCalled();
    expect(c.fxSources[policy.sourceId]!.fetchSnapshot).not.toHaveBeenCalled();
  });
  it('gates on live capabilities and tool availability before any fetch', async () => {
    enableFixturePrice(); const c = clients();
    c.mcp.callTool.mockResolvedValueOnce({ internationalOffers: { contractVersion: 2, enabled: false } } as never);
    expect((await refreshMarketData({ priceJobs: [priceJob] }, c)).price.status).toBe('DISABLED');
    expect(c.priceSources[priceJob.sourceId]!.fetchPrice).not.toHaveBeenCalled();
  });
  it('records through the exact MCP schema and never changes editorial fields', async () => {
    enableFixturePrice(); const c = clients();
    const report = await refreshMarketData({ priceJobs: [priceJob], previous: { price: { lastSuccessAt: '2026-11-01T00:00:00Z', lastFailureAt: null }, fx: { lastSuccessAt: null, lastFailureAt: null } } }, c);
    expect(report.price.status).toBe('OK');
    expect(report.price.lastSuccessAt).toBe(now.toISOString());
    const call = c.mcp.callTool.mock.calls.find(([input]) => input.name === 'bp_record_offer_price')![0];
    expect(call.arguments).toMatchObject({ price: observation.price, checkedAt: observation.checkedAt });
    expect(Object.keys(call.arguments)).not.toEqual(expect.arrayContaining(['title', 'verdict', 'imageUrl']));
  });
  it('retries an ambiguous write once with identical key and payload', async () => {
    enableFixturePrice(); const c = clients();
    c.mcp.callTool.mockImplementationOnce(async () => ({ internationalOffers: { contractVersion: 2, enabled: true, sourcePolicies: [sourcePolicies.resolveSourcePolicy(priceJob.sourceId, 'SA')] } }) as never)
      .mockRejectedValueOnce(new TransientMarketDataError()).mockResolvedValueOnce({ saved: true } as never);
    expect((await refreshMarketData({ priceJobs: [priceJob] }, c)).price.status).toBe('OK');
    const writes = c.mcp.callTool.mock.calls.filter(([input]) => input.name === 'bp_record_offer_price');
    expect(writes).toHaveLength(2); expect(writes[0]![0]).toEqual(writes[1]![0]);
  });
  it('source outage never writes null over original or renews checkedAt', async () => {
    enableFixturePrice(); const c = clients();
    c.priceSources[priceJob.sourceId]!.fetchPrice.mockRejectedValue(new TransientMarketDataError());
    const report = await refreshMarketData({ priceJobs: [priceJob], previous: { price: { lastSuccessAt: '2026-11-01T00:00:00Z', lastFailureAt: null }, fx: { lastSuccessAt: null, lastFailureAt: null } } }, c);
    expect(report.price).toMatchObject({ status: 'FAILED', lastSuccessAt: '2026-11-01T00:00:00Z', lastFailureAt: now.toISOString() });
    expect(c.mcp.callTool.mock.calls.filter(([input]) => input.name === 'bp_record_offer_price')).toHaveLength(0);
    expect(c.priceSources[priceJob.sourceId]!.fetchPrice).toHaveBeenCalledTimes(2);
  });
  it('rejects source identity mismatch with no retry or write', async () => {
    enableFixturePrice(); const c = clients();
    c.priceSources[priceJob.sourceId]!.fetchPrice.mockResolvedValue({ ...observation, sellerKey: 'other' } as never);
    expect((await refreshMarketData({ priceJobs: [priceJob] }, c)).price.status).toBe('FAILED');
    expect(c.priceSources[priceJob.sourceId]!.fetchPrice).toHaveBeenCalledTimes(1);
    expect(c.mcp.callTool.mock.calls.filter(([input]) => input.name === 'bp_record_offer_price')).toHaveLength(0);
  });
  it('uses stable keys across independent batches with the same source timestamp', async () => {
    enableFixturePrice(); const c = clients();
    await refreshMarketData({ priceJobs: [priceJob] }, c);
    await refreshMarketData({ priceJobs: [priceJob] }, c);
    const writes = c.mcp.callTool.mock.calls.filter(([input]) => input.name === 'bp_record_offer_price');
    expect(writes).toHaveLength(2); expect(writes[0]![0]).toEqual(writes[1]![0]);
  });
  it('caps work to the batch and reports deferred jobs', async () => {
    enableFixturePrice(); const c = clients();
    const report = await refreshMarketData({ priceJobs: [priceJob, priceJob], batchSize: 1 }, c);
    expect(report.price).toMatchObject({ saved: 1, deferred: 1 });
    expect(c.priceSources[priceJob.sourceId]!.fetchPrice).toHaveBeenCalledTimes(1);
  });
  it('does not fetch if the live tool is absent or local source is unknown', async () => {
    enableFixturePrice(); const c = clients(); c.mcp.listTools.mockResolvedValue({ tools: [] });
    expect((await refreshMarketData({ priceJobs: [priceJob] }, c)).price.status).toBe('DISABLED');
    expect(c.priceSources[priceJob.sourceId]!.fetchPrice).not.toHaveBeenCalled();
  });
  it('separates FX success from a price outage and uses the FX MCP contract', async () => {
    enableFixturePrice(); const c = { ...clients(), fxPolicies: [policy] };
    c.priceSources[priceJob.sourceId]!.fetchPrice.mockRejectedValue(new Error('contains-secret-must-not-leak'));
    const report = await refreshMarketData({ priceJobs: [priceJob], fxSourceId: policy.sourceId }, c);
    expect(report.price.status).toBe('FAILED'); expect(report.fx.status).toBe('OK');
    expect(JSON.stringify(report)).not.toContain('contains-secret');
    expect(c.mcp.callTool.mock.calls.find(([input]) => input.name === 'bp_record_fx_snapshot')![0].arguments).toMatchObject({ sourceId: policy.sourceId, asOf: row.asOf.toISOString(), rates: row.rates });
    expect(c.priceSources[priceJob.sourceId]!.fetchPrice).toHaveBeenCalledTimes(1);
  });
  it('does not persist expired, future or mismatched FX snapshots', async () => {
    for (const bad of [{ sourceId: 'other', asOf: row.asOf.toISOString() }, { sourceId: policy.sourceId, asOf: '2026-11-03T00:00:00Z' }, { sourceId: policy.sourceId, asOf: '2026-10-30T00:00:00Z' }]) {
      const c = { ...clients(), fxPolicies: [policy] };
      c.fxSources[policy.sourceId]!.fetchSnapshot.mockResolvedValue({ ...bad, base: 'USD', rates: row.rates });
      expect((await refreshMarketData({ priceJobs: [], fxSourceId: policy.sourceId }, c)).fx.status).toBe('FAILED');
      expect(c.mcp.callTool.mock.calls.filter(([input]) => input.name === 'bp_record_fx_snapshot')).toHaveLength(0);
    }
  });
  it('treats SDK isError as a failed write, not a saved observation', async () => {
    enableFixturePrice(); const c = clients();
    const original = c.mcp.callTool.getMockImplementation()!;
    c.mcp.callTool.mockImplementation(async input => input.name === 'bp_get_capabilities' ? original(input) : { isError: true, structuredContent: { error: { code: 'INVALID_INPUT' } } } as never);
    expect((await refreshMarketData({ priceJobs: [priceJob] }, c)).price).toMatchObject({ status: 'FAILED', saved: 0, reasons: ['MCP_REJECTED'] });
  });
  it('aborts timeout without a second overlapping request or a fabricated write', async () => {
    enableFixturePrice(); const c = clients();
    c.priceSources[priceJob.sourceId]!.fetchPrice.mockImplementation(() => new Promise(() => {}));
    const report = await refreshMarketData({ priceJobs: [priceJob], timeoutMs: 5 }, c);
    expect(report.price).toMatchObject({ status: 'FAILED', reasons: ['TIMEOUT'] });
    expect(c.priceSources[priceJob.sourceId]!.fetchPrice).toHaveBeenCalledTimes(1);
    expect(c.mcp.callTool.mock.calls.filter(([input]) => input.name === 'bp_record_offer_price')).toHaveLength(0);
  });
  it('enforces batch and timeout ceilings without an extra writer', async () => {
    const c = clients();
    await expect(refreshMarketData({ priceJobs: [priceJob], batchSize: 101 }, c)).rejects.toThrow();
    await expect(refreshMarketData({ priceJobs: [], timeoutMs: 60001 }, c)).rejects.toThrow();
  });
});
