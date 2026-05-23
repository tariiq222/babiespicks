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
