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
    expect(findManyArgs.select.discoveryReason).toBe(true);
    expect(findManyArgs.select.trendScore).toBe(true);
    expect(findManyArgs.select.trendSignal).toEqual(expect.objectContaining({
      select: expect.objectContaining({ id: true }),
    }));
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

  it('creates a product draft from a trend signal with Phase 1 fields and signal reference', async () => {
    const trendSignal = {
      id: 'signal_1',
      source: 'manual',
      sourceUrl: 'https://source.example/signal',
      canonicalUrl: 'https://store.example/product',
      rawTitle: 'Baby Monitor',
      normalizedTitle: 'baby monitor',
      sourceHash: 'hash_1',
      discoveryReason: 'High intent parent searches',
      trendScore: 81,
      demandSignal: 'Demand up',
      competitionSignal: null,
      seasonalitySignal: null,
      metadata: { source: 'manual' },
    };
    const detail = {
      id: 'draft_1',
      trendSignalId: 'signal_1',
      trendSignal: { id: 'signal_1' },
      discoveryReason: 'High intent parent searches',
      trendScore: 81,
      status: 'NEEDS_REVIEW',
    };
    const prisma = {
      trendSignal: {
        findUnique: vi.fn().mockResolvedValue(trendSignal),
      },
      productDraft: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'draft_1', status: 'NEEDS_REVIEW' }),
        findUnique: vi.fn().mockResolvedValue(detail),
      },
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);

    const result = await service.createDraftFromSignal('signal_1');

    expect(result).toBe(detail);
    expect(prisma.productDraft.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        trendSignalId: 'signal_1',
        discoveryReason: 'High intent parent searches',
        trendScore: 81,
        status: 'NEEDS_REVIEW',
      }),
    }));
    expect(prisma.productDraft.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        discoveryReason: true,
        trendScore: true,
        trendSignal: expect.any(Object),
      }),
    }));
  });

  it('approves a draft with audit only and never publishes', async () => {
    const draft = {
      id: 'draft_approve',
      status: 'NEEDS_REVIEW' as const,
      transitionIdempotencyKey: null,
    };
    const updatedDraft = { ...draft, status: 'APPROVED' as const };
    const tx = {
      productDraft: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(updatedDraft),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
      },
    };
    const prisma = {
      productDraft: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(draft)
          .mockResolvedValueOnce(updatedDraft),
      },
      product: { upsert: vi.fn() },
      $transaction: vi.fn((fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);
    const publish = vi.spyOn(service, 'publishApprovedDraft');

    const result = await service.transitionDraft('draft_approve', { action: 'approve' });

    expect(result).toBe(updatedDraft);
    expect(tx.approvalAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'APPROVED' }),
    }));
    expect(publish).not.toHaveBeenCalled();
    expect(prisma.product.upsert).not.toHaveBeenCalled();
  });

  it('rejects a draft with audit only', async () => {
    const draft = {
      id: 'draft_reject',
      status: 'NEEDS_REVIEW' as const,
      transitionIdempotencyKey: null,
    };
    const updatedDraft = { ...draft, status: 'REJECTED' as const, rejectionReason: 'unsafe' };
    const tx = {
      productDraft: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(updatedDraft),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_reject' }),
      },
    };
    const prisma = {
      productDraft: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(draft)
          .mockResolvedValueOnce(updatedDraft),
      },
      $transaction: vi.fn((fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);

    await expect(service.transitionDraft('draft_reject', {
      action: 'reject',
      reason: 'unsafe',
    })).resolves.toBe(updatedDraft);
    expect(tx.approvalAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REJECTED', reason: 'unsafe' }),
    }));
  });

  it('updates editable fields before approval', async () => {
    const draft = {
      id: 'draft_edit',
      status: 'NEEDS_EDIT' as const,
      transitionIdempotencyKey: null,
    };
    const updatedDraft = {
      ...draft,
      title: 'Edited title',
      discoveryReason: 'Better reason',
      trendScore: 91,
    };
    const prisma = {
      productDraft: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(draft)
          .mockResolvedValueOnce(updatedDraft),
        update: vi.fn().mockResolvedValue(updatedDraft),
      },
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);

    const result = await service.updateDraft('draft_edit', {
      title: '  Edited title  ',
      discoveryReason: 'Better reason',
      trendScore: 91,
    });

    expect(result).toBe(updatedDraft);
    expect(prisma.productDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft_edit' },
      data: expect.objectContaining({
        title: 'Edited title',
        discoveryReason: 'Better reason',
        trendScore: 91,
      }),
    });
  });

  it('fails closed when direct publish is called', async () => {
    const prisma = {
      product: { upsert: vi.fn() },
      productDraft: { updateMany: vi.fn() },
    };
    const service = new ProductDraftsService(prisma as unknown as PrismaService);

    await expect(service.publishApprovedDraft('draft_1')).rejects.toThrow(
      'Direct product draft publishing is disabled in Affiliate AI OS Phase 1',
    );
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.productDraft.updateMany).not.toHaveBeenCalled();
  });
});
