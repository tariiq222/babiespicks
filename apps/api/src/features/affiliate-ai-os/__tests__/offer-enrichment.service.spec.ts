import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OfferEnrichmentService } from '../offer-enrichment.service';

describe('OfferEnrichmentService', () => {
  const mockPrisma = () => ({
    productDraft: {
      findUnique: vi.fn(),
    },
    offerEnrichment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contentDraft: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  });

  it('rejects enrichment when product draft is not found', async () => {
    const prisma = mockPrisma();
    prisma.productDraft.findUnique.mockResolvedValue(null);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    await expect(service.enrichDraft('draft_missing')).rejects.toThrow(
      'ProductDraft draft_missing was not found',
    );
  });

  it('rejects enrichment when product draft is not APPROVED', async () => {
    const prisma = mockPrisma();
    prisma.productDraft.findUnique.mockResolvedValue({
      id: 'draft_1',
      status: 'NEEDS_REVIEW',
      title: 'Test Product',
    });
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    await expect(service.enrichDraft('draft_1')).rejects.toThrow(
      'Cannot enrich draft with status NEEDS_REVIEW; only APPROVED drafts can be enriched',
    );
  });

  it('creates a new enrichment from an APPROVED draft', async () => {
    const prisma = mockPrisma();
    const approvedDraft = {
      id: 'draft_1',
      status: 'APPROVED',
      title: 'Baby Monitor',
      description: 'Top rated baby monitor',
      imageUrl: 'https://example.com/image.jpg',
      price: 199.99,
      affiliateUrl: 'https://example.com/affiliate',
      category: 'Baby Electronics',
      trendScore: 85,
      demandSignal: 'High demand',
      competitionSignal: 'Medium competition',
    };
    prisma.productDraft.findUnique.mockResolvedValue(approvedDraft);
    prisma.offerEnrichment.findFirst.mockResolvedValue(null);
    prisma.offerEnrichment.create.mockResolvedValue({
      id: 'enrich_1',
      sourceProductDraftId: 'draft_1',
      status: 'PENDING',
      offerTitle: 'Baby Monitor - Baby Electronics',
    });
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    const result = await service.enrichDraft('draft_1');

    expect(prisma.offerEnrichment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceProductDraftId: 'draft_1',
          offerTitle: 'Baby Monitor - Baby Electronics',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('returns existing enrichment when one already exists for the draft', async () => {
    const prisma = mockPrisma();
    const existingEnrichment = {
      id: 'enrich_existing',
      sourceProductDraftId: 'draft_1',
      status: 'COMPLETED',
      offerTitle: 'Existing enrichment',
    };
    prisma.productDraft.findUnique.mockResolvedValue({
      id: 'draft_1',
      status: 'APPROVED',
      title: 'Test Product',
    });
    prisma.offerEnrichment.findFirst.mockResolvedValue(existingEnrichment);
    prisma.offerEnrichment.update.mockResolvedValue(existingEnrichment);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    const result = await service.enrichDraft('draft_1');

    expect(prisma.offerEnrichment.create).not.toHaveBeenCalled();
    expect(prisma.offerEnrichment.update).toHaveBeenCalled();
  });

  it('lists enrichments with pagination', async () => {
    const prisma = mockPrisma();
    const enrichments = [
      { id: 'enrich_1', sourceProductDraftId: 'draft_1', status: 'COMPLETED' },
      { id: 'enrich_2', sourceProductDraftId: 'draft_2', status: 'PENDING' },
    ];
    prisma.offerEnrichment.findMany.mockResolvedValue(enrichments);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    const result = await service.listEnrichments({ limit: 10, offset: 20 });

    expect(prisma.offerEnrichment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      }),
    );
    expect(result).toBe(enrichments);
  });

  it('clamps pagination limits to max values', async () => {
    const prisma = mockPrisma();
    prisma.offerEnrichment.findMany.mockResolvedValue([]);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    await service.listEnrichments({ limit: 500, offset: 20000 });

    expect(prisma.offerEnrichment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10000,
        take: 100,
      }),
    );
  });

  it('filters by status when provided', async () => {
    const prisma = mockPrisma();
    prisma.offerEnrichment.findMany.mockResolvedValue([]);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    await service.listEnrichments({ status: 'COMPLETED' });

    expect(prisma.offerEnrichment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('throws NotFoundException when updating missing enrichment', async () => {
    const prisma = mockPrisma();
    prisma.offerEnrichment.findUnique.mockResolvedValue(null);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    await expect(service.updateEnrichment('enrich_missing', {})).rejects.toThrow(
      'OfferEnrichment enrich_missing was not found',
    );
  });

  it('updates enrichment fields correctly', async () => {
    const prisma = mockPrisma();
    const enrichment = {
      id: 'enrich_1',
      sourceProductDraftId: 'draft_1',
      status: 'PENDING',
      offerTitle: 'Old Title',
      confidenceScore: 0.5,
    };
    const updated = { ...enrichment, offerTitle: 'New Title', confidenceScore: 0.9 };
    prisma.offerEnrichment.findUnique.mockResolvedValue(enrichment);
    prisma.offerEnrichment.update.mockResolvedValue(updated);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    const result = await service.updateEnrichment('enrich_1', {
      offerTitle: 'New Title',
      confidenceScore: 0.9,
    });

    expect(prisma.offerEnrichment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'enrich_1' },
        data: expect.objectContaining({
          offerTitle: 'New Title',
          confidenceScore: 0.9,
        }),
      }),
    );
    expect(result.offerTitle).toBe('New Title');
  });

  it('throws NotFoundException when generating content for missing enrichment', async () => {
    const prisma = mockPrisma();
    prisma.offerEnrichment.findUnique.mockResolvedValue(null);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    await expect(service.generateContentDrafts('enrich_missing')).rejects.toThrow(
      'OfferEnrichment enrich_missing was not found',
    );
  });

  it('generates content drafts for each content type', async () => {
    const prisma = mockPrisma();
    const enrichment = {
      id: 'enrich_1',
      sourceProductDraftId: 'draft_1',
      status: 'COMPLETED',
      offerTitle: 'Test Product',
      positioningAngle: 'Premium quality',
      keyBenefits: ['Benefit 1', 'Benefit 2'],
      suggestedHooks: ['Hook 1'],
    };
    const createdDrafts = [
      { id: 'draft_1', contentType: 'article', status: 'DRAFT' },
      { id: 'draft_2', contentType: 'social_post', status: 'DRAFT' },
      { id: 'draft_3', contentType: 'email', status: 'DRAFT' },
      { id: 'draft_4', contentType: 'ad_copy', status: 'DRAFT' },
    ];
    prisma.offerEnrichment.findUnique.mockResolvedValue(enrichment);
    prisma.contentDraft.create
      .mockResolvedValueOnce(createdDrafts[0])
      .mockResolvedValueOnce(createdDrafts[1])
      .mockResolvedValueOnce(createdDrafts[2])
      .mockResolvedValueOnce(createdDrafts[3]);
    prisma.offerEnrichment.update.mockResolvedValue({ ...enrichment, status: 'COMPLETED' });
    prisma.contentDraft.findMany.mockResolvedValue(createdDrafts);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    const result = await service.generateContentDrafts('enrich_1');

    expect(prisma.contentDraft.create).toHaveBeenCalledTimes(4);
    expect(prisma.offerEnrichment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'enrich_1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(result).toHaveLength(4);
  });

  it('returns existing content drafts when idempotency key matches', async () => {
    const prisma = mockPrisma();
    const enrichment = {
      id: 'enrich_1',
      sourceProductDraftId: 'draft_1',
      status: 'COMPLETED',
      offerTitle: 'Test Product',
      positioningAngle: 'Premium quality',
      keyBenefits: null,
      suggestedHooks: null,
    };
    const existingDraft = { id: 'draft_existing', sourceOfferEnrichmentId: 'enrich_1' };
    prisma.offerEnrichment.findUnique.mockResolvedValue(enrichment);
    (prisma.contentDraft as any).findFirst = vi.fn().mockResolvedValue(existingDraft);
    (prisma.contentDraft as any).findMany = vi.fn().mockResolvedValue([existingDraft]);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    const result = await service.generateContentDrafts('enrich_1', { idempotencyKey: 'key_1' });

    expect(prisma.contentDraft.create).not.toHaveBeenCalled();
    expect(result).toEqual([existingDraft]);
  });

  it('normalizes confidence score to 0-1 range', async () => {
    const prisma = mockPrisma();
    const enrichment = {
      id: 'enrich_1',
      sourceProductDraftId: 'draft_1',
      status: 'PENDING',
      offerTitle: 'Test',
      confidenceScore: null,
    };
    const updated = { ...enrichment, confidenceScore: 1 };
    prisma.offerEnrichment.findUnique.mockResolvedValue(enrichment);
    prisma.offerEnrichment.update.mockResolvedValue(updated);
    const service = new OfferEnrichmentService(prisma as unknown as PrismaService);

    await service.updateEnrichment('enrich_1', { confidenceScore: 1.5 });

    expect(prisma.offerEnrichment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confidenceScore: 1 }),
      }),
    );
  });
});
