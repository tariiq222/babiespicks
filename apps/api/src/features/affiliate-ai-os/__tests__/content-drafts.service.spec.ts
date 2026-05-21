import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ContentDraftsService } from '../content-drafts.service';

vi.mock('../../../infrastructure/approval/approval-audit', () => ({
  recordApprovalAuditEvent: vi.fn().mockResolvedValue(undefined),
  SERVER_DERIVED_APPROVAL_ACTOR_ID: 'server-actor',
}));

describe('ContentDraftsService', () => {
  it('can create content draft from completed CONTENT_PIPELINE enrichment', async () => {
    const enrichment = {
      id: 'enrich_1',
      type: 'CONTENT_PIPELINE',
      status: 'COMPLETED',
      input: { sourceProductDraftId: 'pd_1', enrichmentReason: 'test' },
      output: { offerTitle: 'Test Offer', sourceProductDraftId: 'pd_1', status: 'READY' },
    };
    const createdDraft = {
      id: 'draft_1',
      locale: 'ar',
      type: 'BEST_LIST',
      title: 'Test Draft',
      slug: 'test-draft',
      content: 'body text',
      outline: {
        sourceOfferEnrichmentId: 'enrich_1',
        phase2Metadata: { offerTitle: 'Test Offer', contentType: 'article' },
      },
      productIds: ['pd_1'],
      seo: null,
      status: 'NEEDS_REVIEW',
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      revisionNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      aiRun: {
        findUnique: vi.fn().mockResolvedValue(enrichment),
      },
      articleDraft: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        create: vi.fn().mockResolvedValue(createdDraft),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(prisma)),
    };
    const service = new ContentDraftsService(prisma as unknown as PrismaService);

    const result = await service.createDraft({
      sourceOfferEnrichmentId: 'enrich_1',
      title: 'Test Draft',
      body: 'body text',
      locale: 'ar',
      type: 'BEST_LIST',
      contentType: 'article',
    } as any);

    expect(prisma.aiRun.findUnique).toHaveBeenCalledWith({
      where: { id: 'enrich_1' },
      select: { id: true, type: true, status: true, input: true, output: true },
    });
    expect(prisma.articleDraft.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: 'Test Draft',
        content: 'body text',
        locale: 'ar',
        type: 'BEST_LIST',
        status: 'NEEDS_REVIEW',
        productIds: ['pd_1'],
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      id: 'draft_1',
      title: 'Test Draft',
      status: 'pending_approval',
      sourceOfferEnrichmentId: 'enrich_1',
    }));
  });

  it('content draft is created in NEEDS_REVIEW status requiring approval', async () => {
    const enrichment = {
      id: 'enrich_1',
      type: 'CONTENT_PIPELINE',
      status: 'COMPLETED',
      input: { sourceProductDraftId: 'pd_1' },
      output: { offerTitle: 'Test Offer', sourceProductDraftId: 'pd_1', status: 'READY' },
    };
    const createdDraft = {
      id: 'draft_1',
      locale: 'ar',
      type: 'BEST_LIST',
      title: 'Test Draft',
      slug: 'test-draft',
      content: '',
      outline: { sourceOfferEnrichmentId: 'enrich_1' },
      productIds: ['pd_1'],
      seo: null,
      status: 'NEEDS_REVIEW',
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      revisionNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      aiRun: {
        findUnique: vi.fn().mockResolvedValue(enrichment),
      },
      articleDraft: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        create: vi.fn().mockResolvedValue(createdDraft),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(prisma)),
    };
    const service = new ContentDraftsService(prisma as unknown as PrismaService);

    const result = await service.createDraft({
      sourceOfferEnrichmentId: 'enrich_1',
      title: 'Test Draft',
    } as any);

    expect(result.status).toBe('pending_approval');
    expect(result.approvalStatus).toBe('pending_approval');
    expect(result.readyForNextPhase).toBe(false);
  });

  it('approving content draft updates status to APPROVED and does not publish', async () => {
    const draft = {
      id: 'draft_1',
      locale: 'ar',
      type: 'BEST_LIST',
      title: 'Test Draft',
      slug: 'test-draft',
      content: 'body',
      outline: { sourceOfferEnrichmentId: 'enrich_1' },
      productIds: ['pd_1'],
      seo: null,
      status: 'NEEDS_REVIEW',
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      revisionNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const approvedDraft = {
      ...draft,
      status: 'APPROVED',
      approvedBy: 'server-actor',
      approvedAt: new Date(),
    };
    const tx = {
      articleDraft: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(approvedDraft),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
      },
    };
    const prisma = {
      aiRun: { findUnique: vi.fn() },
      articleDraft: {
        findUnique: vi.fn().mockResolvedValue(draft),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new ContentDraftsService(prisma as unknown as PrismaService);

    const result = await service.approveDraft('draft_1');

    expect(tx.articleDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'draft_1', status: 'NEEDS_REVIEW' },
      data: expect.objectContaining({
        status: 'APPROVED',
        approvedBy: 'server-actor',
      }),
    }));
    expect(result.status).toBe('approved');
    expect(result.approvalStatus).toBe('approved');
    expect(result.readyForNextPhase).toBe(true);
    // Assert no publish/schedule/ContentPage/SocialPost calls
    expect(prisma.articleDraft.create).not.toHaveBeenCalled();
  });

  it('rejecting content draft updates status to REJECTED only', async () => {
    const draft = {
      id: 'draft_1',
      locale: 'ar',
      type: 'BEST_LIST',
      title: 'Test Draft',
      slug: 'test-draft',
      content: 'body',
      outline: { sourceOfferEnrichmentId: 'enrich_1' },
      productIds: ['pd_1'],
      seo: null,
      status: 'NEEDS_REVIEW',
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      revisionNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const rejectedDraft = {
      ...draft,
      status: 'REJECTED',
      rejectedBy: 'server-actor',
      rejectedAt: new Date(),
      rejectionReason: 'not good',
    };
    const tx = {
      articleDraft: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(rejectedDraft),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
      },
    };
    const prisma = {
      aiRun: { findUnique: vi.fn() },
      articleDraft: {
        findUnique: vi.fn().mockResolvedValue(draft),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new ContentDraftsService(prisma as unknown as PrismaService);

    const result = await service.rejectDraft('draft_1', { reason: 'not good' });

    expect(tx.articleDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'draft_1', status: 'NEEDS_REVIEW' },
      data: expect.objectContaining({
        status: 'REJECTED',
        rejectedBy: 'server-actor',
        rejectionReason: 'not good',
      }),
    }));
    expect(result.status).toBe('rejected');
    expect(result.approvalStatus).toBe('rejected');
    expect(result.readyForNextPhase).toBe(false);
    // Assert no publish/schedule/ContentPage/SocialPost calls
    expect(prisma.articleDraft.create).not.toHaveBeenCalled();
  });

  it('throws ConflictException when aiRun type is not CONTENT_PIPELINE', async () => {
    const enrichment = {
      id: 'enrich_1',
      type: 'SCRAPER',
      status: 'COMPLETED',
      input: { sourceProductDraftId: 'pd_1' },
      output: { offerTitle: 'Test Offer', sourceProductDraftId: 'pd_1', status: 'READY' },
    };
    const prisma = {
      aiRun: {
        findUnique: vi.fn().mockResolvedValue(enrichment),
      },
      articleDraft: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(prisma)),
    };
    const service = new ContentDraftsService(prisma as unknown as PrismaService);

    await expect(service.createDraft({
      sourceOfferEnrichmentId: 'enrich_1',
      title: 'Test Draft',
      contentType: 'article',
    } as any)).rejects.toThrow(ConflictException);

    expect(prisma.articleDraft.create).not.toHaveBeenCalled();
  });

  it('throws ConflictException when aiRun status is not COMPLETED', async () => {
    const enrichment = {
      id: 'enrich_1',
      type: 'CONTENT_PIPELINE',
      status: 'RUNNING',
      input: { sourceProductDraftId: 'pd_1' },
      output: { offerTitle: 'Test Offer', sourceProductDraftId: 'pd_1', status: 'READY' },
    };
    const prisma = {
      aiRun: {
        findUnique: vi.fn().mockResolvedValue(enrichment),
      },
      articleDraft: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(prisma)),
    };
    const service = new ContentDraftsService(prisma as unknown as PrismaService);

    await expect(service.createDraft({
      sourceOfferEnrichmentId: 'enrich_1',
      title: 'Test Draft',
      contentType: 'article',
    } as any)).rejects.toThrow(ConflictException);

    expect(prisma.articleDraft.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when enrichment input lacks sourceProductDraftId', async () => {
    const enrichment = {
      id: 'enrich_1',
      type: 'CONTENT_PIPELINE',
      status: 'COMPLETED',
      input: {},
      output: { offerTitle: 'Test Offer', sourceProductDraftId: 'pd_1', status: 'READY' },
    };
    const prisma = {
      aiRun: {
        findUnique: vi.fn().mockResolvedValue(enrichment),
      },
      articleDraft: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(prisma)),
    };
    const service = new ContentDraftsService(prisma as unknown as PrismaService);

    await expect(service.createDraft({
      sourceOfferEnrichmentId: 'enrich_1',
      title: 'Test Draft',
      contentType: 'article',
    } as any)).rejects.toThrow(BadRequestException);

    expect(prisma.articleDraft.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when enrichment output lacks offerTitle', async () => {
    const enrichment = {
      id: 'enrich_1',
      type: 'CONTENT_PIPELINE',
      status: 'COMPLETED',
      input: { sourceProductDraftId: 'pd_1' },
      output: { sourceProductDraftId: 'pd_1', status: 'READY' },
    };
    const prisma = {
      aiRun: {
        findUnique: vi.fn().mockResolvedValue(enrichment),
      },
      articleDraft: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(prisma)),
    };
    const service = new ContentDraftsService(prisma as unknown as PrismaService);

    await expect(service.createDraft({
      sourceOfferEnrichmentId: 'enrich_1',
      title: 'Test Draft',
      contentType: 'article',
    } as any)).rejects.toThrow(BadRequestException);

    expect(prisma.articleDraft.create).not.toHaveBeenCalled();
  });
});
