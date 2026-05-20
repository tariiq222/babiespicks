import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { SERVER_DERIVED_APPROVAL_ACTOR_ID } from '../../src/infrastructure/approval/approval-audit';
import { ProductDraftsController } from '../../src/features/affiliate-ai-os/product-drafts.controller';
import { ProductDraftsService } from '../../src/features/affiliate-ai-os/product-drafts.service';

type EvaluationInput = {
  aiRunId?: string;
  idempotencyKey?: string;
};

type PublishInput = {
  actorId?: string;
  idempotencyKey?: string;
};

type ProductDraftsEvaluationPublishingService = ProductDraftsService & {
  evaluateDraft(id: string, input?: EvaluationInput): Promise<unknown>;
  publishApprovedDraft(id: string, input?: PublishInput): Promise<unknown>;
};

type ProductDraftsPublishingController = ProductDraftsController & {
  publish(id: string, body?: PublishInput): Promise<unknown>;
};

type ProductDraftsApprovalController = ProductDraftsController & {
  approve(id: string, body?: { idempotencyKey?: string }): Promise<unknown>;
};

const baseDraft = {
  id: 'draft_stroller_1',
  title: 'عربة أطفال خفيفة قابلة للطي',
  description: 'عربة سفر للأطفال مع قفل أمان وخامة مناسبة للعائلات في السعودية',
  imageUrl: 'https://cdn.example.com/stroller.jpg',
  price: 499,
  sourceUrl: 'https://www.amazon.sa/light-stroller/dp/BABY123',
  canonicalUrl: 'https://www.amazon.sa/light-stroller/dp/BABY123',
  affiliateUrl: 'https://affiliate.example.com/stroller',
  category: 'strollers',
  sourceType: 'amazon_sa',
  normalizedTitle: 'عربة اطفال خفيفة قابلة للطي',
  sourceHash: 'hash_stroller_1',
  discoveryReason: 'High Saudi parent demand',
  trendScore: 88,
  demandSignal: 'High saves and creator mentions',
  competitionSignal: 'Moderate competition',
  seasonalitySignal: 'Evergreen',
  rawData: {
    brand: 'SafeBaby',
    locale: 'ar',
    reviews: [{ rating: 4.7, text: 'ثابتة وخفيفة' }],
  },
  status: 'APPROVED',
  approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
  approvedAt: new Date('2026-05-20T10:00:00.000Z'),
};

const approvedReadyScore = {
  id: 'score_ready_1',
  productDraftId: baseDraft.id,
  productId: null,
  aiRunId: 'ai_run_1',
  scores: {
    overall: 8.6,
    safety: 9.1,
    affiliate: 8.2,
    content: 8.5,
  },
  reasoning: {
    ar: 'آمن ومناسب وقابل للتسويق بمحتوى عربي واضح.',
    en: 'Safe, commercially viable, and content-ready.',
  },
  riskFlags: [],
  recommendation: 'READY',
  status: 'APPROVED',
};

function createPrismaMock() {
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    productDraft: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    productScore: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    product: {
      create: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    productTranslation: {
      upsert: vi.fn(),
    },
    productPrice: {
      upsert: vi.fn(),
    },
    verdict: {
      upsert: vi.fn(),
    },
    store: {
      upsert: vi.fn(),
    },
    approvalAuditEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  return prisma;
}

function createService(prisma = createPrismaMock()) {
  return {
    prisma,
    service: new ProductDraftsService(
      prisma as unknown as PrismaService,
    ) as ProductDraftsEvaluationPublishingService,
  };
}

describe('ProductDraftsService phase 2 evaluation contract', () => {
  it('evaluateDraft creates a ProductScore with required score axes and links it to the draft and AiRun', async () => {
    const { prisma, service } = createService();
    prisma.productDraft.findUnique.mockResolvedValue({
      ...baseDraft,
      status: 'NEEDS_REVIEW',
    });
    prisma.productScore.create.mockResolvedValue(approvedReadyScore);

    const result = await service.evaluateDraft(baseDraft.id, {
      aiRunId: 'ai_run_1',
      idempotencyKey: 'eval:draft_stroller_1:ai_run_1',
    });

    expect(prisma.productDraft.findUnique).toHaveBeenCalledWith({
      where: { id: baseDraft.id },
    });
    expect(prisma.productScore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productDraftId: baseDraft.id,
          aiRunId: 'ai_run_1',
          idempotencyKey: 'eval:draft_stroller_1:ai_run_1',
          scores: expect.objectContaining({
            overall: expect.any(Number),
            safety: expect.any(Number),
            affiliate: expect.any(Number),
            content: expect.any(Number),
          }),
          reasoning: expect.any(Object),
          riskFlags: expect.any(Array),
          recommendation: expect.stringMatching(/^(READY|NEEDS_REVIEW|REJECT)$/),
        }),
      }),
    );
    expect(result).toEqual(approvedReadyScore);
  });

  it('high safety risk forces NEEDS_REVIEW or REJECT recommendation and never publishes', async () => {
    const { prisma, service } = createService();
    const highRiskDraft = {
      ...baseDraft,
      id: 'draft_high_risk_1',
      title: 'كرسي أطفال مع بلاغ سحب ومخاطر اختناق',
      rawData: {
        ...baseDraft.rawData,
        safetySignals: {
          severity: 'HIGH',
          recalls: ['SASO-RECALL-2026-1'],
          hazards: ['CHOKING', 'TIP_OVER'],
        },
      },
      status: 'NEEDS_REVIEW',
    };
    const highRiskScore = {
      ...approvedReadyScore,
      id: 'score_high_risk_1',
      productDraftId: highRiskDraft.id,
      scores: { overall: 3.2, safety: 1.5, affiliate: 7.5, content: 6.4 },
      riskFlags: [
        { code: 'SAFETY_RECALL', severity: 'HIGH' },
        { code: 'CHOKING_HAZARD', severity: 'HIGH' },
      ],
      recommendation: 'REJECT',
      status: 'REJECTED',
    };

    prisma.productDraft.findUnique.mockResolvedValue(highRiskDraft);
    prisma.productScore.create.mockResolvedValue(highRiskScore);

    await service.evaluateDraft(highRiskDraft.id, { aiRunId: 'ai_run_high_risk' });

    expect(prisma.productScore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productDraftId: highRiskDraft.id,
          scores: expect.objectContaining({ safety: expect.any(Number) }),
          riskFlags: expect.arrayContaining([
            expect.objectContaining({ severity: 'HIGH' }),
          ]),
          recommendation: expect.stringMatching(/^(NEEDS_REVIEW|REJECT)$/),
          status: expect.stringMatching(/^(NEEDS_REVIEW|REJECTED)$/),
        }),
      }),
    );
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.productDraft.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
  });

  it('rejects an evaluation idempotencyKey collision from a different draft without moving the score', async () => {
    const { prisma, service } = createService();
    const otherDraftScore = {
      ...approvedReadyScore,
      id: 'score_other_draft',
      productDraftId: 'draft_other_product',
      idempotencyKey: 'eval:collision',
    };

    prisma.productDraft.findUnique.mockResolvedValue({
      ...baseDraft,
      status: 'NEEDS_REVIEW',
    });
    prisma.productScore.findFirst.mockResolvedValue(otherDraftScore);

    await expect(
      service.evaluateDraft(baseDraft.id, { idempotencyKey: 'eval:collision' }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.productScore.update).not.toHaveBeenCalled();
    expect(prisma.productScore.create).not.toHaveBeenCalled();
  });

  it.each(['PUBLISHED', 'REJECTED'] as const)(
    'refuses to evaluate %s ProductDrafts',
    async (status) => {
      const { prisma, service } = createService();
      prisma.productDraft.findUnique.mockResolvedValue({ ...baseDraft, status });

      await expect(
        service.evaluateDraft(baseDraft.id, { idempotencyKey: `eval:${status}` }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.productScore.findFirst).not.toHaveBeenCalled();
      expect(prisma.productScore.update).not.toHaveBeenCalled();
      expect(prisma.productScore.create).not.toHaveBeenCalled();
    },
  );

  it('does not mutate a published ProductScore during evaluation retry', async () => {
    const { prisma, service } = createService();
    prisma.productDraft.findUnique.mockResolvedValue({
      ...baseDraft,
      status: 'APPROVED',
    });
    prisma.productScore.findFirst.mockResolvedValue({
      ...approvedReadyScore,
      productId: 'product_stroller_1',
      idempotencyKey: 'eval:published-score',
      status: 'PUBLISHED',
    });

    await expect(
      service.evaluateDraft(baseDraft.id, {
        idempotencyKey: 'eval:published-score',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.productScore.update).not.toHaveBeenCalled();
    expect(prisma.productScore.create).not.toHaveBeenCalled();
  });
});

describe('ProductDraftsService phase 3 publishing contract', () => {
  it('refuses to publish an approved ProductDraft without an APPROVED and READY ProductScore', async () => {
    const { prisma, service } = createService();
    prisma.productDraft.findUnique.mockResolvedValue(baseDraft);
    prisma.productScore.findFirst.mockResolvedValue({
      ...approvedReadyScore,
      id: 'score_needs_review_1',
      status: 'NEEDS_REVIEW',
      recommendation: 'NEEDS_REVIEW',
    });

    await expect(
      service.publishApprovedDraft(baseDraft.id, { idempotencyKey: 'publish:blocked' }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.productTranslation.upsert).not.toHaveBeenCalled();
    expect(prisma.productPrice.upsert).not.toHaveBeenCalled();
    expect(prisma.verdict.upsert).not.toHaveBeenCalled();
  });

  it('publishes an APPROVED draft with a valid score into product tables using idempotent upserts', async () => {
    const { prisma, service } = createService();
    const publishedProduct = {
      id: 'product_stroller_1',
      slug: 'safebaby-light-stroller',
      sourceUrl: baseDraft.canonicalUrl,
    };

    prisma.productDraft.findUnique.mockResolvedValue(baseDraft);
    prisma.productScore.findFirst.mockResolvedValue(approvedReadyScore);
    prisma.store.upsert.mockResolvedValue({ id: 'store_amazon_sa' });
    prisma.product.upsert.mockResolvedValue(publishedProduct);
    prisma.productTranslation.upsert.mockResolvedValue({ id: 'translation_ar_1' });
    prisma.productPrice.upsert.mockResolvedValue({ id: 'price_1' });
    prisma.verdict.upsert.mockResolvedValue({ id: 'verdict_1' });
    prisma.productScore.update.mockResolvedValue({
      ...approvedReadyScore,
      productId: publishedProduct.id,
      status: 'PUBLISHED',
    });
    prisma.productDraft.update.mockResolvedValue({ ...baseDraft, status: 'PUBLISHED' });
    prisma.approvalAuditEvent.create.mockResolvedValue({ id: 'audit_publish_1' });

    const result = await service.publishApprovedDraft(baseDraft.id, {
      idempotencyKey: 'publish:draft_stroller_1',
    });

    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.any(Object),
        create: expect.objectContaining({
          name: baseDraft.title,
          sourceUrl: baseDraft.canonicalUrl,
          dataSource: 'AI_EXTRACTION',
          status: expect.stringMatching(/^(READY|ACTIVE)$/),
        }),
        update: expect.objectContaining({
          sourceUrl: baseDraft.canonicalUrl,
        }),
      }),
    );
    expect(prisma.productTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.any(Object),
        create: expect.objectContaining({
          productId: publishedProduct.id,
          locale: 'ar',
          name: baseDraft.title,
        }),
        update: expect.objectContaining({ name: baseDraft.title }),
      }),
    );
    expect(prisma.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          productId: publishedProduct.id,
          storeId: 'store_amazon_sa',
          price: baseDraft.price,
          currency: 'SAR',
          url: baseDraft.affiliateUrl,
        }),
      }),
    );
    expect(prisma.verdict.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          productId: publishedProduct.id,
          overallScore: approvedReadyScore.scores.overall,
          safetyScore: approvedReadyScore.scores.safety,
          reasoningAr: approvedReadyScore.reasoning.ar,
          isPublished: true,
        }),
      }),
    );
    expect(prisma.productDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseDraft.id, status: 'APPROVED' },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ product: publishedProduct }));
  });

  it('returns the previously published product for the same publish idempotencyKey without new audit writes', async () => {
    const { prisma, service } = createService();
    const publishedProduct = {
      id: 'product_stroller_1',
      slug: 'safebaby-light-stroller',
      sourceUrl: baseDraft.canonicalUrl,
    };
    const publishedDraft = {
      ...baseDraft,
      status: 'PUBLISHED',
    };

    prisma.productDraft.findUnique.mockResolvedValue(publishedDraft);
    prisma.approvalAuditEvent.findFirst.mockResolvedValue({
      id: 'audit_publish_1',
      metadata: {
        idempotencyKey: 'publish:draft_stroller_1',
        productId: publishedProduct.id,
        productScoreId: approvedReadyScore.id,
      },
    });
    prisma.productScore.findFirst.mockResolvedValue({
      ...approvedReadyScore,
      productId: publishedProduct.id,
      status: 'PUBLISHED',
    });
    prisma.product.findFirst.mockResolvedValue(publishedProduct);

    const result = await service.publishApprovedDraft(baseDraft.id, {
      idempotencyKey: 'publish:draft_stroller_1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        product: publishedProduct,
        draft: publishedDraft,
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.approvalAuditEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: 'PUBLISHED',
          entityType: 'PRODUCT_DRAFT',
          entityId: baseDraft.id,
          metadata: { path: ['idempotencyKey'], equals: 'publish:draft_stroller_1' },
        }),
      }),
    );
    expect(prisma.store.upsert).not.toHaveBeenCalled();
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.productTranslation.upsert).not.toHaveBeenCalled();
    expect(prisma.productPrice.upsert).not.toHaveBeenCalled();
    expect(prisma.verdict.upsert).not.toHaveBeenCalled();
    expect(prisma.approvalAuditEvent.create).not.toHaveBeenCalled();
  });

  it.each(['REJECTED', 'NEEDS_EDIT'] as const)(
    'refuses to publish %s ProductDrafts',
    async (status) => {
      const { prisma, service } = createService();
      prisma.productDraft.findUnique.mockResolvedValue({ ...baseDraft, status });

      await expect(service.publishApprovedDraft(baseDraft.id)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.productScore.findFirst).not.toHaveBeenCalled();
      expect(prisma.product.upsert).not.toHaveBeenCalled();
      expect(prisma.productDraft.update).not.toHaveBeenCalled();
    },
  );

  it('records a PUBLISHED ApprovalAuditEvent with the server actor when publishing', async () => {
    const { prisma, service } = createService();
    prisma.productDraft.findUnique.mockResolvedValue(baseDraft);
    prisma.productScore.findFirst.mockResolvedValue(approvedReadyScore);
    prisma.store.upsert.mockResolvedValue({ id: 'store_amazon_sa' });
    prisma.product.upsert.mockResolvedValue({ id: 'product_stroller_1' });
    prisma.productTranslation.upsert.mockResolvedValue({ id: 'translation_ar_1' });
    prisma.productPrice.upsert.mockResolvedValue({ id: 'price_1' });
    prisma.verdict.upsert.mockResolvedValue({ id: 'verdict_1' });
    prisma.productScore.update.mockResolvedValue({ id: approvedReadyScore.id });
    prisma.productDraft.update.mockResolvedValue({ ...baseDraft, status: 'PUBLISHED' });
    prisma.approvalAuditEvent.create.mockResolvedValue({ id: 'audit_publish_1' });

    await service.publishApprovedDraft(baseDraft.id, {
      actorId: 'spoofed-body-actor',
      idempotencyKey: 'publish:audit',
    });

    expect(prisma.approvalAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'ADMIN_API_KEY',
        actorId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
        action: 'PUBLISHED',
        entityType: 'PRODUCT_DRAFT',
        entityId: baseDraft.id,
        metadata: expect.objectContaining({
          idempotencyKey: 'publish:audit',
          productId: 'product_stroller_1',
          productScoreId: approvedReadyScore.id,
        }),
      }),
    });
    expect(prisma.approvalAuditEvent.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 'spoofed-body-actor' }),
    });
  });
});

describe('ProductDraftsController publishing contract', () => {
  it('approve delegates to the approval automation path', async () => {
    const service = {
      approveEvaluateAndPublishDraft: vi.fn().mockResolvedValue({
        success: true,
        action: 'approved_evaluated_published',
      }),
      publishApprovedDraft: vi.fn(),
    };
    const controller = new ProductDraftsController(
      service as unknown as ProductDraftsService,
    ) as ProductDraftsApprovalController;

    await controller.approve(baseDraft.id, { idempotencyKey: 'approve:controller' });

    expect(service.approveEvaluateAndPublishDraft).toHaveBeenCalledWith(baseDraft.id, {
      actorId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      idempotencyKey: 'approve:controller',
    });
  });

  it('does not trust actor values from the publish request body', async () => {
    const service = {
      publishApprovedDraft: vi.fn().mockResolvedValue({ product: { id: 'product_1' } }),
    };
    const controller = new ProductDraftsController(
      service as unknown as ProductDraftsService,
    ) as ProductDraftsPublishingController;

    await controller.publish(baseDraft.id, {
      actorId: 'spoofed-admin-from-body',
      idempotencyKey: 'publish:controller',
    });

    expect(service.publishApprovedDraft).toHaveBeenCalledWith(baseDraft.id, {
      actorId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      idempotencyKey: 'publish:controller',
    });
    expect(service.publishApprovedDraft).not.toHaveBeenCalledWith(
      baseDraft.id,
      expect.objectContaining({ actorId: 'spoofed-admin-from-body' }),
    );
  });
});
