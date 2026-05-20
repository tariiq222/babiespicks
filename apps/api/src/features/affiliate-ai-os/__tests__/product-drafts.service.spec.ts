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

    await service.listDrafts({ status: 'NEEDS_REVIEW', limit: 25 });

    const [findManyArgs] = prisma.productDraft.findMany.mock.calls[0] as [
      { select: Record<string, boolean>; take: number },
    ];

    expect(findManyArgs.take).toBe(25);
    expect(findManyArgs.select.id).toBe(true);
    expect(findManyArgs.select.title).toBe(true);
    expect(findManyArgs.select.status).toBe(true);
    expect(findManyArgs.select.rawData).toBeUndefined();
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
});
