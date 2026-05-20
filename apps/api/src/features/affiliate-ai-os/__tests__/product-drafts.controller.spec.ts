import { describe, expect, it, vi } from 'vitest';
import { ProductDraftsController } from '../product-drafts.controller';
import type { ProductDraftsService } from '../product-drafts.service';

describe('ProductDraftsController', () => {
  it('routes approve to the approval-only transition and never publish automation', async () => {
    const service = {
      transitionDraft: vi.fn().mockResolvedValue({ id: 'draft_1', status: 'APPROVED' }),
      publishApprovedDraft: vi.fn(),
    };
    const controller = new ProductDraftsController(service as unknown as ProductDraftsService);

    await expect(controller.approve('draft_1', { idempotencyKey: 'approve_1' })).resolves.toEqual({
      id: 'draft_1',
      status: 'APPROVED',
    });

    expect(service.transitionDraft).toHaveBeenCalledWith('draft_1', expect.objectContaining({
      action: 'approve',
      idempotencyKey: 'approve_1',
    }));
    expect(service.publishApprovedDraft).not.toHaveBeenCalled();
    expect('publish' in controller).toBe(false);
  });

  it('creates drafts from trend signals through the review queue endpoint', async () => {
    const service = {
      createDraftFromSignal: vi.fn().mockResolvedValue({
        id: 'draft_1',
        trendSignalId: 'signal_1',
        status: 'NEEDS_REVIEW',
      }),
    };
    const controller = new ProductDraftsController(service as unknown as ProductDraftsService);

    await expect(controller.createFromTrendSignal({ trendSignalId: 'signal_1' })).resolves.toEqual({
      id: 'draft_1',
      trendSignalId: 'signal_1',
      status: 'NEEDS_REVIEW',
    });
    expect(service.createDraftFromSignal).toHaveBeenCalledWith('signal_1');
  });
});
