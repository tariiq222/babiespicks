import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DifyOrchestrationService } from '../dify-orchestration.service';

describe('DifyOrchestrationService.searchMarketplace', () => {
  let service: DifyOrchestrationService;
  let prisma: { product: { findFirst: ReturnType<typeof vi.fn> } };
  let discovery: { findOnMarketplace: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { product: { findFirst: vi.fn() } };
    discovery = { findOnMarketplace: vi.fn() };
    service = new DifyOrchestrationService(prisma as never, discovery as never);
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
