import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductDraftsService } from '../../src/features/affiliate-ai-os/product-drafts.service';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

describe('ProductDraftsService', () => {
  const mockPrisma = {
    $transaction: vi.fn(),
    trendSignal: {
      findUnique: vi.fn(),
    },
    productDraft: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    product: {
      create: vi.fn(),
      upsert: vi.fn(),
    },
    approvalAuditEvent: {
      create: vi.fn(),
    },
  };

  const trendSignal = {
    id: 'signal_1',
    canonicalUrl: 'https://www.noon.com/saudi-en/foldable-stroller/p/',
    rawTitle: 'عربة أطفال خفيفة قابلة للطي',
    normalizedTitle: 'عربة أطفال خفيفة قابلة للطي',
    sourceHash: 'signal_hash_1',
    discoveryReason: 'High mention velocity from Saudi parenting creators',
    trendScore: 87,
    source: 'tiktok',
    metadata: { mentions: 42 },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
  });

  it('converts a TrendSignal into a ProductDraft without creating a Product', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );
    const createdDraft = {
      id: 'draft_1',
      trendSignalId: 'signal_1',
      status: 'NEEDS_REVIEW',
      canonicalUrl: trendSignal.canonicalUrl,
      normalizedTitle: trendSignal.normalizedTitle,
      sourceHash: trendSignal.sourceHash,
      discoveryReason: trendSignal.discoveryReason,
      trendScore: trendSignal.trendScore,
    };

    mockPrisma.trendSignal.findUnique.mockResolvedValue(trendSignal);
    mockPrisma.productDraft.findFirst.mockResolvedValue(null);
    mockPrisma.productDraft.create.mockResolvedValue(createdDraft);

    const result = await service.createDraftFromSignal('signal_1');

    expect(mockPrisma.trendSignal.findUnique).toHaveBeenCalledWith({
      where: { id: 'signal_1' },
    });
    expect(mockPrisma.productDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trendSignalId: 'signal_1',
          status: 'NEEDS_REVIEW',
          canonicalUrl: trendSignal.canonicalUrl,
          normalizedTitle: trendSignal.normalizedTitle,
          sourceHash: trendSignal.sourceHash,
          discoveryReason: trendSignal.discoveryReason,
          trendScore: trendSignal.trendScore,
        }),
      }),
    );
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
    expect(mockPrisma.product.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(createdDraft);
  });

  it('deduplicates ProductDrafts by canonicalUrl, normalizedTitle, and sourceHash', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );
    const existingDraft = {
      id: 'draft_existing',
      trendSignalId: 'signal_other',
      status: 'NEEDS_REVIEW',
      canonicalUrl: trendSignal.canonicalUrl,
      normalizedTitle: trendSignal.normalizedTitle,
      sourceHash: trendSignal.sourceHash,
    };

    mockPrisma.trendSignal.findUnique.mockResolvedValue(trendSignal);
    mockPrisma.productDraft.findFirst.mockResolvedValue(existingDraft);

    const result = await service.createDraftFromSignal('signal_1');

    expect(mockPrisma.productDraft.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { canonicalUrl: trendSignal.canonicalUrl },
            { normalizedTitle: trendSignal.normalizedTitle },
            { sourceHash: trendSignal.sourceHash },
          ]),
        }),
      }),
    );
    expect(mockPrisma.productDraft.create).not.toHaveBeenCalled();
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
    expect(result).toEqual(existingDraft);
  });

  it('is idempotent when the same TrendSignal is converted more than once', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );
    const createdDraft = {
      id: 'draft_1',
      trendSignalId: 'signal_1',
      status: 'NEEDS_REVIEW',
      canonicalUrl: trendSignal.canonicalUrl,
      normalizedTitle: trendSignal.normalizedTitle,
      sourceHash: trendSignal.sourceHash,
    };

    mockPrisma.trendSignal.findUnique.mockResolvedValue(trendSignal);
    mockPrisma.productDraft.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdDraft);
    mockPrisma.productDraft.create.mockResolvedValue(createdDraft);

    const first = await service.createDraftFromSignal('signal_1');
    const second = await service.createDraftFromSignal('signal_1');

    expect(mockPrisma.productDraft.create).toHaveBeenCalledTimes(1);
    expect(first).toEqual(createdDraft);
    expect(second).toEqual(createdDraft);
  });

  it('throws NotFoundException when the TrendSignal does not exist', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );

    mockPrisma.trendSignal.findUnique.mockResolvedValue(null);

    await expect(service.createDraftFromSignal('missing_signal')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.productDraft.create).not.toHaveBeenCalled();
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
  });

  it('returns the existing ProductDraft when a concurrent create hits P2002', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );
    const racedDraft = {
      id: 'draft_race',
      trendSignalId: 'signal_1',
      status: 'NEEDS_REVIEW',
      canonicalUrl: trendSignal.canonicalUrl,
      normalizedTitle: trendSignal.normalizedTitle,
      sourceHash: trendSignal.sourceHash,
    };

    mockPrisma.trendSignal.findUnique.mockResolvedValue(trendSignal);
    mockPrisma.productDraft.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(racedDraft);
    mockPrisma.productDraft.create.mockRejectedValue({ code: 'P2002' });

    const result = await service.createDraftFromSignal('signal_1');

    expect(mockPrisma.productDraft.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
    expect(mockPrisma.product.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(racedDraft);
  });

  it('transitions a draft with an atomic status guard', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );
    const existingDraft = {
      id: 'draft_1',
      status: 'NEEDS_REVIEW',
      transitionIdempotencyKey: null,
    };
    const approvedDraft = {
      id: 'draft_1',
      status: 'APPROVED',
      approvedBy: 'admin-api-key',
      transitionIdempotencyKey: 'approve-draft-1',
    };

    mockPrisma.productDraft.findUnique
      .mockResolvedValueOnce(existingDraft)
      .mockResolvedValueOnce(approvedDraft);
    mockPrisma.productDraft.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.transitionDraft('draft_1', {
      action: 'approve',
      reviewerId: 'admin_1',
      idempotencyKey: 'approve-draft-1',
    });

    expect(mockPrisma.productDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'draft_1',
          status: { in: ['NEEDS_REVIEW', 'NEEDS_EDIT'] },
        },
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedBy: 'admin-api-key',
          transitionIdempotencyKey: 'approve-draft-1',
        }),
      }),
    );
    expect(mockPrisma.approvalAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'ADMIN_API_KEY',
        actorId: 'admin-api-key',
        action: 'APPROVED',
        entityType: 'PRODUCT_DRAFT',
        entityId: 'draft_1',
      }),
    });
    expect(result).toEqual(approvedDraft);
  });

  it('does not trust reviewerId passed into transition options', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );

    mockPrisma.productDraft.findUnique
      .mockResolvedValueOnce({
        id: 'draft_1',
        status: 'NEEDS_REVIEW',
        transitionIdempotencyKey: null,
      })
      .mockResolvedValueOnce({
        id: 'draft_1',
        status: 'APPROVED',
        approvedBy: 'admin-api-key',
        transitionIdempotencyKey: null,
      });
    mockPrisma.productDraft.updateMany.mockResolvedValue({ count: 1 });

    await service.transitionDraft('draft_1', {
      action: 'approve',
      reviewerId: 'spoofed-admin',
    });

    expect(mockPrisma.productDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvedBy: 'admin-api-key' }),
      }),
    );
    expect(mockPrisma.productDraft.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvedBy: 'spoofed-admin' }),
      }),
    );
  });

  it('rejects invalid draft transitions before updating', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );

    mockPrisma.productDraft.findUnique.mockResolvedValue({
      id: 'draft_approved',
      status: 'APPROVED',
      transitionIdempotencyKey: null,
    });

    await expect(
      service.transitionDraft('draft_approved', {
        action: 'needs_edit',
        notes: 'Change after approval',
      }),
    ).rejects.toThrow(ConflictException);
    expect(mockPrisma.productDraft.updateMany).not.toHaveBeenCalled();
  });

  it('returns the existing draft for idempotent transition retries', async () => {
    const service = new ProductDraftsService(
      mockPrisma as unknown as PrismaService,
    );
    const approvedDraft = {
      id: 'draft_1',
      status: 'APPROVED',
      transitionIdempotencyKey: 'approve-draft-1',
    };

    mockPrisma.productDraft.findUnique.mockResolvedValue(approvedDraft);

    const result = await service.transitionDraft('draft_1', {
      action: 'approve',
      idempotencyKey: 'approve-draft-1',
    });

    expect(mockPrisma.productDraft.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual(approvedDraft);
  });
});
