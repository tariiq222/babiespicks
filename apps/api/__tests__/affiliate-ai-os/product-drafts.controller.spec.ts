import { ConflictException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductDraftsController } from '../../src/features/affiliate-ai-os/product-drafts.controller';
import { ProductDraftsService } from '../../src/features/affiliate-ai-os/product-drafts.service';

describe('ProductDraftsController', () => {
  const mockDraftsService = {
    transitionDraft: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves a draft through the service and forwards the idempotency key', async () => {
    const controller = new ProductDraftsController(
      mockDraftsService as unknown as ProductDraftsService,
    );
    const approved = {
      id: 'draft_1',
      status: 'APPROVED',
      approvedBy: 'admin-api-key',
    };

    mockDraftsService.transitionDraft.mockResolvedValue(approved);

    const result = await controller.approve('draft_1', {
      reviewerId: 'admin_1',
      idempotencyKey: 'approve-draft-1',
    });

    expect(mockDraftsService.transitionDraft).toHaveBeenCalledWith('draft_1', {
      action: 'approve',
      reviewerId: 'admin-api-key',
      idempotencyKey: 'approve-draft-1',
    });
    expect(result).toEqual(approved);
  });

  it('rejects a draft with a rejection reason', async () => {
    const controller = new ProductDraftsController(
      mockDraftsService as unknown as ProductDraftsService,
    );
    const rejected = {
      id: 'draft_1',
      status: 'REJECTED',
      rejectionReason: 'Not relevant for Saudi baby product audience',
    };

    mockDraftsService.transitionDraft.mockResolvedValue(rejected);

    const result = await controller.reject('draft_1', {
      reviewerId: 'admin_1',
      reason: 'Not relevant for Saudi baby product audience',
      idempotencyKey: 'reject-draft-1',
    });

    expect(mockDraftsService.transitionDraft).toHaveBeenCalledWith('draft_1', {
      action: 'reject',
      reviewerId: 'admin-api-key',
      reason: 'Not relevant for Saudi baby product audience',
      idempotencyKey: 'reject-draft-1',
    });
    expect(result).toEqual(rejected);
  });

  it('marks a draft as needs_edit with edit notes', async () => {
    const controller = new ProductDraftsController(
      mockDraftsService as unknown as ProductDraftsService,
    );
    const needsEdit = {
      id: 'draft_1',
      status: 'NEEDS_EDIT',
      editNotes: 'Add Arabic title and verify marketplace URL',
    };

    mockDraftsService.transitionDraft.mockResolvedValue(needsEdit);

    const result = await controller.needsEdit('draft_1', {
      reviewerId: 'admin_1',
      notes: 'Add Arabic title and verify marketplace URL',
      idempotencyKey: 'needs-edit-draft-1',
    });

    expect(mockDraftsService.transitionDraft).toHaveBeenCalledWith('draft_1', {
      action: 'needs_edit',
      reviewerId: 'admin-api-key',
      notes: 'Add Arabic title and verify marketplace URL',
      idempotencyKey: 'needs-edit-draft-1',
    });
    expect(result).toEqual(needsEdit);
  });

  it('surfaces invalid transition conflicts without converting them to success responses', async () => {
    const controller = new ProductDraftsController(
      mockDraftsService as unknown as ProductDraftsService,
    );

    mockDraftsService.transitionDraft.mockRejectedValue(
      new ConflictException('Cannot transition draft from APPROVED to NEEDS_EDIT'),
    );

    await expect(
      controller.needsEdit('draft_approved', {
        reviewerId: 'admin_1',
        notes: 'Change after approval',
        idempotencyKey: 'invalid-transition-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('passes idempotency keys for terminal transitions so retries return the same result', async () => {
    const controller = new ProductDraftsController(
      mockDraftsService as unknown as ProductDraftsService,
    );
    const approved = {
      id: 'draft_1',
      status: 'APPROVED',
      transitionIdempotencyKey: 'approve-draft-1',
    };

    mockDraftsService.transitionDraft.mockResolvedValue(approved);

    const first = await controller.approve('draft_1', {
      reviewerId: 'admin_1',
      idempotencyKey: 'approve-draft-1',
    });
    const retry = await controller.approve('draft_1', {
      reviewerId: 'admin_1',
      idempotencyKey: 'approve-draft-1',
    });

    expect(mockDraftsService.transitionDraft).toHaveBeenCalledTimes(2);
    expect(mockDraftsService.transitionDraft).toHaveBeenNthCalledWith(1, 'draft_1', {
      action: 'approve',
      reviewerId: 'admin-api-key',
      idempotencyKey: 'approve-draft-1',
    });
    expect(retry).toEqual(first);
  });

  it('ignores reviewerId body spoofing and uses the server-derived actor', async () => {
    const controller = new ProductDraftsController(
      mockDraftsService as unknown as ProductDraftsService,
    );

    mockDraftsService.transitionDraft.mockResolvedValue({
      id: 'draft_1',
      status: 'APPROVED',
      approvedBy: 'admin-api-key',
    });

    await controller.approve('draft_1', {
      reviewerId: 'spoofed-admin',
      idempotencyKey: 'approve-draft-1',
    });

    expect(mockDraftsService.transitionDraft).toHaveBeenCalledWith('draft_1', {
      action: 'approve',
      reviewerId: 'admin-api-key',
      idempotencyKey: 'approve-draft-1',
    });
  });
});
