import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DifyOrchestrationController,
  DifyOrchestrationGuardedController,
} from '../dify-orchestration.controller';

describe('DifyOrchestrationController', () => {
  it('health returns ok', () => {
    const ctrl = new DifyOrchestrationController({} as never);
    expect(ctrl.health()).toEqual({ ok: true });
  });
});

describe('DifyOrchestrationGuardedController', () => {
  let service: {
    searchMarketplace: ReturnType<typeof vi.fn>;
    processProduct: ReturnType<typeof vi.fn>;
  };
  let ctrl: DifyOrchestrationGuardedController;

  beforeEach(() => {
    service = {
      searchMarketplace: vi.fn(),
      processProduct: vi.fn(),
    };
    ctrl = new DifyOrchestrationGuardedController(service as never);
  });

  it('marketplace-search returns wrapped ok response', async () => {
    service.searchMarketplace.mockResolvedValue({
      url: 'https://noon.com/x',
      platform: 'noon',
      sku: null,
      available: true,
    });

    const result = await ctrl.marketplaceSearch({ name: 'X' });

    expect(result).toEqual({
      ok: true,
      data: { url: 'https://noon.com/x', platform: 'noon', sku: null, available: true },
    });
  });

  it('process-product returns wrapped ok response', async () => {
    service.processProduct.mockResolvedValue({
      product_id: 'p1',
      content_page_id: null,
      status: 'PENDING_APPROVAL',
      summary: {
        acquisition: 'success',
        reviews: 'success',
        verdict: 'success',
        publish: 'success',
        time_ms: 100,
      },
    });

    const result = await ctrl.processProduct({
      url: 'https://x.com/p',
      platform: 'noon',
    });

    expect(result.ok).toBe(true);
    expect((result as { ok: true; data: { status: string } }).data.status).toBe('PENDING_APPROVAL');
  });
});

describe('DifyOrchestrationGuardedController.runStart / runFinish', () => {
  it('runStart returns ok with dify_run_id', async () => {
    const service = {
      searchMarketplace: vi.fn(),
      processProduct: vi.fn(),
      startRun: vi.fn().mockResolvedValue({ dify_run_id: 'r-1' }),
      finishRun: vi.fn(),
    };
    const ctrl = new DifyOrchestrationGuardedController(service as never);
    const result = await ctrl.runStart({ triggered_by: 'manual' });
    expect(result).toEqual({ ok: true, data: { dify_run_id: 'r-1' } });
  });

  it('runFinish returns ok with run summary', async () => {
    const service = {
      searchMarketplace: vi.fn(),
      processProduct: vi.fn(),
      startRun: vi.fn(),
      finishRun: vi.fn().mockResolvedValue({
        dify_run_id: 'r-1',
        total_candidates: 5,
        succeeded: 3,
        failed: 2,
        started_at: '2026-05-23T10:00:00.000Z',
        finished_at: '2026-05-23T10:10:00.000Z',
      }),
    };
    const ctrl = new DifyOrchestrationGuardedController(service as never);
    const result = await ctrl.runFinish({ dify_run_id: 'r-1', succeeded: 3, failed: 2 });
    expect((result as { ok: true; data: { succeeded: number } }).data.succeeded).toBe(3);
  });
});
