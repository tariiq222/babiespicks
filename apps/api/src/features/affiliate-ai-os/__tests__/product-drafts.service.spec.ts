import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ProductDraftsService } from '../product-drafts.service';

describe('ProductDraftsService', () => {
  it('uses an explicit dashboard select and excludes rawData from listDrafts', async () => {
    const prisma = {
      productDraft: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);

    await service.listDrafts({ status: 'NEEDS_REVIEW', limit: 25, offset: 50 });

    const [findManyArgs] = prisma.productDraft.findMany.mock.calls[0] as [
      { select: Record<string, boolean>; skip: number; take: number },
    ];

    expect(findManyArgs.take).toBe(25);
    expect(findManyArgs.skip).toBe(50);
    expect(findManyArgs.select.id).toBe(true);
    expect(findManyArgs.select.title).toBe(true);
    expect(findManyArgs.select.status).toBe(true);
    expect(findManyArgs.select.rawData).toBeUndefined();
  });

  it('clamps offset pagination for listDrafts while preserving array response', async () => {
    const drafts = [{ id: 'draft_1', title: 'Draft 1' }];
    const prisma = {
      productDraft: {
        findMany: vi.fn().mockResolvedValue(drafts),
      },
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);

    const result = await service.listDrafts({ limit: 10, offset: 50_000 });

    expect(result).toBe(drafts);
    expect(prisma.productDraft.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10_000,
      take: 10,
    }));
  });

  it('rolls back product draft approval when audit creation fails', async () => {
    const draft = {
      id: 'draft_rollback',
      status: 'NEEDS_REVIEW' as const,
      transitionIdempotencyKey: null,
      approvedBy: null as string | null,
    };
    const txDraft = { ...draft };
    const tx = {
      productDraft: {
        updateMany: vi.fn(async ({ data }: any) => {
          Object.assign(txDraft, data);
          return { count: 1 };
        }),
        findUnique: vi.fn().mockResolvedValue(txDraft),
      },
      approvalAuditEvent: {
        create: vi.fn().mockRejectedValue(new Error('audit write failed')),
      },
    };
    const prisma = {
      productDraft: {
        findUnique: vi.fn().mockResolvedValue(draft),
      },
      $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => {
        try {
          const result = await fn(tx);
          Object.assign(draft, txDraft);
          return result;
        } catch (error) {
          return Promise.reject(error);
        }
      }),
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);

    await expect(service.transitionDraft('draft_rollback', { action: 'approve' })).rejects.toThrow(
      'audit write failed',
    );

    expect(draft.status).toBe('NEEDS_REVIEW');
    expect(draft.approvedBy).toBeNull();
    expect(tx.productDraft.updateMany).toHaveBeenCalled();
    expect(tx.approvalAuditEvent.create).toHaveBeenCalled();
  });

  it('automates approval, evaluation, and publish with deterministic idempotency keys', async () => {
    const draft = {
      id: 'draft_auto',
      status: 'NEEDS_REVIEW' as const,
      transitionIdempotencyKey: null,
    };
    const prisma = {
      productDraft: {
        findUnique: vi.fn().mockResolvedValue(draft),
      },
      productScore: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);
    const transition = vi.spyOn(service, 'transitionDraft').mockResolvedValue({
      ...draft,
      status: 'APPROVED',
    } as never);
    const evaluate = vi.spyOn(service, 'evaluateDraft').mockResolvedValue({
      id: 'score_1',
      productDraftId: 'draft_auto',
      scores: { safety: 8.5, overall: 8.2, affiliate: 8, content: 8 },
      reasoning: {},
      riskFlags: [],
      recommendation: 'READY',
      status: 'APPROVED',
    } as never);
    const publish = vi.spyOn(service, 'publishApprovedDraft').mockResolvedValue({
      product: { id: 'product_1' },
      draft: { ...draft, status: 'PUBLISHED' },
    } as never);

    const result = await service.approveEvaluateAndPublishDraft('draft_auto');

    expect(result).toEqual(expect.objectContaining({ success: true, action: 'approved_evaluated_published' }));
    expect(transition).toHaveBeenCalledWith('draft_auto', expect.objectContaining({
      action: 'approve',
      idempotencyKey: 'product-draft:draft_auto:approval-automation:v1:approve',
    }));
    expect(evaluate).toHaveBeenCalledWith('draft_auto', {
      idempotencyKey: 'product-draft:draft_auto:approval-automation:v1:evaluate',
    });
    expect(publish).toHaveBeenCalledWith('draft_auto', expect.objectContaining({
      idempotencyKey: 'product-draft:draft_auto:approval-automation:v1:publish',
    }));
  });

  it('does not publish when automated evaluation is not ready', async () => {
    const draft = {
      id: 'draft_unsafe',
      status: 'APPROVED' as const,
      transitionIdempotencyKey: null,
    };
    const prisma = {
      productDraft: {
        findUnique: vi.fn().mockResolvedValue(draft),
      },
      productScore: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);
    vi.spyOn(service, 'evaluateDraft').mockResolvedValue({
      id: 'score_unsafe',
      productDraftId: 'draft_unsafe',
      scores: { safety: 5, overall: 6, affiliate: 8, content: 8 },
      reasoning: {},
      riskFlags: [],
      recommendation: 'NEEDS_REVIEW',
      status: 'NEEDS_REVIEW',
    } as never);
    const publish = vi.spyOn(service, 'publishApprovedDraft').mockResolvedValue({} as never);

    await expect(service.approveEvaluateAndPublishDraft('draft_unsafe')).rejects.toMatchObject({
      response: expect.objectContaining({ success: false, stage: 'evaluate' }),
    });
    expect(publish).not.toHaveBeenCalled();
  });
});
