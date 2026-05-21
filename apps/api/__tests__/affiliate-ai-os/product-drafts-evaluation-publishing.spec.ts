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

  it('rejects publishing in Phase 1 even with an APPROVED draft and valid score', async () => {
    const { prisma, service } = createService();

    await expect(
      service.publishApprovedDraft(baseDraft.id, {
        idempotencyKey: 'publish:draft_stroller_1',
      }),
    ).rejects.toThrow(
      new ConflictException('Direct product draft publishing is disabled in Affiliate AI OS Phase 1'),
    );

    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.productTranslation.upsert).not.toHaveBeenCalled();
    expect(prisma.productPrice.upsert).not.toHaveBeenCalled();
    expect(prisma.verdict.upsert).not.toHaveBeenCalled();
    expect(prisma.productDraft.updateMany).not.toHaveBeenCalled();
  });

  it('rejects retry publishing in Phase 1 even with a previously used idempotencyKey', async () => {
    const { prisma, service } = createService();

    await expect(
      service.publishApprovedDraft(baseDraft.id, {
        idempotencyKey: 'publish:draft_stroller_1',
      }),
    ).rejects.toThrow(
      new ConflictException('Direct product draft publishing is disabled in Affiliate AI OS Phase 1'),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
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

  it('rejects publishing in Phase 1 and never records a PUBLISHED audit event', async () => {
    const { prisma, service } = createService();

    await expect(
      service.publishApprovedDraft(baseDraft.id, {
        actorId: 'spoofed-body-actor',
        idempotencyKey: 'publish:audit',
      }),
    ).rejects.toThrow(
      new ConflictException('Direct product draft publishing is disabled in Affiliate AI OS Phase 1'),
    );

    expect(prisma.approvalAuditEvent.create).not.toHaveBeenCalled();
  });
});

describe('ProductDraftsController publishing contract', () => {
  it('approve delegates to transitionDraft with server-derived actor', async () => {
    const service = {
      transitionDraft: vi.fn().mockResolvedValue({
        id: baseDraft.id,
        status: 'APPROVED',
        approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      }),
    };
    const controller = new ProductDraftsController(
      service as unknown as ProductDraftsService,
    );

    await controller.approve(baseDraft.id, { idempotencyKey: 'approve:controller' });

    expect(service.transitionDraft).toHaveBeenCalledWith(baseDraft.id, {
      action: 'approve',
      reviewerId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      idempotencyKey: 'approve:controller',
    });
  });

  it('does not trust actor values from the approve request body', async () => {
    const service = {
      transitionDraft: vi.fn().mockResolvedValue({
        id: baseDraft.id,
        status: 'APPROVED',
        approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      }),
    };
    const controller = new ProductDraftsController(
      service as unknown as ProductDraftsService,
    );

    await controller.approve(baseDraft.id, {
      reviewerId: 'spoofed-admin-from-body',
      idempotencyKey: 'approve:controller',
    });

    expect(service.transitionDraft).toHaveBeenCalledWith(baseDraft.id, {
      action: 'approve',
      reviewerId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      idempotencyKey: 'approve:controller',
    });
    expect(service.transitionDraft).not.toHaveBeenCalledWith(
      baseDraft.id,
      expect.objectContaining({ reviewerId: 'spoofed-admin-from-body' }),
    );
  });
});
