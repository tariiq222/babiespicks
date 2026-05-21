import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OfferEnrichmentsService } from '../offer-enrichments.service';

describe('OfferEnrichmentsService', () => {
  it('cannot enrich unapproved ProductDraft', async () => {
    const prisma = {
      productDraft: {
        findUnique: vi.fn().mockResolvedValue({ id: 'pd_1', status: 'NEEDS_REVIEW' }),
      },
      aiRun: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const service = new OfferEnrichmentsService(prisma as unknown as PrismaService);

    await expect(
      service.createEnrichment({
        sourceProductDraftId: 'pd_1',
        offerTitle: 'Test Offer',
        enrichmentReason: 'test reason',
      } as any),
    ).rejects.toThrow(ConflictException);

    expect(prisma.productDraft.findUnique).toHaveBeenCalledWith({
      where: { id: 'pd_1' },
      select: { id: true, status: true },
    });
    expect(prisma.aiRun.create).not.toHaveBeenCalled();
  });

  it('can enrich approved ProductDraft', async () => {
    const prisma = {
      productDraft: {
        findUnique: vi.fn().mockResolvedValue({ id: 'pd_1', status: 'APPROVED' }),
      },
      aiRun: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn().mockResolvedValue({
          id: 'run_1',
          name: 'Offer Enrichment: Test Offer',
          type: 'CONTENT_PIPELINE',
          status: 'COMPLETED',
          input: { sourceProductDraftId: 'pd_1', enrichmentReason: 'test reason' },
          output: { offerTitle: 'Test Offer', sourceProductDraftId: 'pd_1', enrichmentReason: 'test reason', status: 'READY' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: vi.fn(),
      },
    };
    const service = new OfferEnrichmentsService(prisma as unknown as PrismaService);

    const result = await service.createEnrichment({
      sourceProductDraftId: 'pd_1',
      offerTitle: 'Test Offer',
      enrichmentReason: 'test reason',
    } as any);

    expect(prisma.aiRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Offer Enrichment: Test Offer',
        type: 'CONTENT_PIPELINE',
        status: 'COMPLETED',
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      id: 'run_1',
      offerTitle: 'Test Offer',
      aiRunStatus: 'COMPLETED',
    }));
  });

  it('enrichment includes sourceProductDraftId and enrichmentReason', async () => {
    const prisma = {
      productDraft: {
        findUnique: vi.fn().mockResolvedValue({ id: 'pd_1', status: 'APPROVED' }),
      },
      aiRun: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn().mockResolvedValue({
          id: 'run_1',
          name: 'Offer Enrichment: Test Offer',
          type: 'CONTENT_PIPELINE',
          status: 'COMPLETED',
          input: { sourceProductDraftId: 'pd_1', enrichmentReason: 'strong signal' },
          output: { offerTitle: 'Test Offer', sourceProductDraftId: 'pd_1', enrichmentReason: 'strong signal', status: 'READY' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: vi.fn(),
      },
    };
    const service = new OfferEnrichmentsService(prisma as unknown as PrismaService);

    await service.createEnrichment({
      sourceProductDraftId: 'pd_1',
      offerTitle: 'Test Offer',
      enrichmentReason: 'strong signal',
    } as any);

    const [createCall] = prisma.aiRun.create.mock.calls[0] as [any];
    expect(createCall.data.input).toEqual({
      sourceProductDraftId: 'pd_1',
      enrichmentReason: 'strong signal',
    });
    expect(createCall.data.output).toEqual(expect.objectContaining({
      sourceProductDraftId: 'pd_1',
      enrichmentReason: 'strong signal',
    }));
  });
});
