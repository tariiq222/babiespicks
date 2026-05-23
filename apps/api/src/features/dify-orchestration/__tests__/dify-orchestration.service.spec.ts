import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DifyOrchestrationService } from '../dify-orchestration.service';

describe('DifyOrchestrationService.searchMarketplace', () => {
  let service: DifyOrchestrationService;
  let prisma: { product: { findFirst: ReturnType<typeof vi.fn> } };
  let discovery: { findOnMarketplace: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { product: { findFirst: vi.fn() } };
    discovery = { findOnMarketplace: vi.fn() };
    service = new DifyOrchestrationService(prisma as never, discovery as never, {} as never);
  });

  it('returns existing_product_id when product already in DB', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-existing',
      sourceUrl: 'https://noon.com/x',
      store: { slug: 'noon' },
    });

    const result = await service.searchMarketplace({ name: 'Stokke Tripp Trapp' });

    expect(result.available).toBe(true);
    expect(result.existing_product_id).toBe('prod-existing');
    expect(discovery.findOnMarketplace).not.toHaveBeenCalled();
  });

  it('queries marketplace when product not in DB', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    discovery.findOnMarketplace.mockResolvedValue({
      url: 'https://www.noon.com/saudi-en/abc/p',
      platform: 'noon',
      sku: 'abc',
    });

    const result = await service.searchMarketplace({ name: 'New Product' });

    expect(result.available).toBe(true);
    expect(result.platform).toBe('noon');
    expect(result.existing_product_id).toBeUndefined();
  });

  it('returns available=false when nothing found', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    discovery.findOnMarketplace.mockResolvedValue(null);

    const result = await service.searchMarketplace({ name: 'Nonexistent' });

    expect(result.available).toBe(false);
  });
});

describe('DifyOrchestrationService.processProduct', () => {
  let service: DifyOrchestrationService;
  let coordinator: { runProductPipeline: ReturnType<typeof vi.fn> };
  let prisma: {
    product: { findFirst: ReturnType<typeof vi.fn> };
    contentPage: { update: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    coordinator = { runProductPipeline: vi.fn() };
    prisma = {
      product: { findFirst: vi.fn() },
      contentPage: {
        update: vi.fn().mockResolvedValue(undefined),
        findFirst: vi.fn().mockResolvedValue({ id: 'cp-1' }),
      },
    };
    service = new DifyOrchestrationService(prisma as never, {} as never, coordinator as never);
  });

  it('runs the existing product pipeline and tags discovery metadata', async () => {
    coordinator.runProductPipeline.mockResolvedValue({
      productId: 'prod-1',
      productName: 'Stokke',
      steps: { acquisition: 'success', reviews: 'success', verdict: 'success', publish: 'success' },
      totalTimeMs: 12345,
    });

    const result = await service.processProduct({
      url: 'https://noon.com/x',
      platform: 'noon',
      trend_score: 8,
      discovery_reason: 'Mentioned in 3 viral threads',
      dify_run_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(coordinator.runProductPipeline).toHaveBeenCalledWith(
      'https://noon.com/x',
      'noon',
      undefined,
    );
    expect(prisma.contentPage.update).toHaveBeenCalled();
    const updateCall = prisma.contentPage.update.mock.calls[0][0];
    expect(updateCall.data.discoverySource).toBe('dify-workflow');
    expect(updateCall.data.trendScore).toBe(8);
    expect(updateCall.data.difyRunId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.product_id).toBe('prod-1');
    expect(result.status).toBe('PENDING_APPROVAL');
  });

  it('returns status FAILED if acquisition failed', async () => {
    coordinator.runProductPipeline.mockResolvedValue({
      productId: '',
      productName: '',
      steps: { acquisition: 'failed', reviews: 'skipped', verdict: 'failed', publish: 'failed' },
      totalTimeMs: 1000,
    });

    const result = await service.processProduct({ url: 'https://x.com/p', platform: 'noon' });

    expect(result.status).toBe('FAILED');
    expect(prisma.contentPage.update).not.toHaveBeenCalled();
  });
});
