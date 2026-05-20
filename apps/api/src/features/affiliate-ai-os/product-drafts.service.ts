import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  recordApprovalAuditEvent,
  SERVER_DERIVED_APPROVAL_ACTOR_ID,
} from '../../infrastructure/approval/approval-audit';
import type {
  ProductDraftEvaluationInput,
  ProductDraftPublishInput,
  ListProductDraftsQuery,
  ProductDraftStatusValue,
  ProductDraftTransitionInput,
} from './dto/product-drafts.dto';

const PRODUCT_DRAFT_STATUS_NEEDS_REVIEW = 'NEEDS_REVIEW' as const;
const PRODUCT_DRAFT_STATUS_APPROVED = 'APPROVED' as const;
const PRODUCT_DRAFT_STATUS_REJECTED = 'REJECTED' as const;
const PRODUCT_DRAFT_STATUS_NEEDS_EDIT = 'NEEDS_EDIT' as const;
const PRODUCT_DRAFT_STATUS_PUBLISHED = 'PUBLISHED' as const;

const PRODUCT_SCORE_STATUS_APPROVED = 'APPROVED' as const;
const PRODUCT_SCORE_STATUS_NEEDS_REVIEW = 'NEEDS_REVIEW' as const;
const PRODUCT_SCORE_STATUS_REJECTED = 'REJECTED' as const;
const PRODUCT_SCORE_STATUS_PUBLISHED = 'PUBLISHED' as const;

const PRODUCT_SCORE_RECOMMENDATION_READY = 'READY' as const;
const PRODUCT_SCORE_RECOMMENDATION_NEEDS_REVIEW = 'NEEDS_REVIEW' as const;
const PRODUCT_SCORE_RECOMMENDATION_REJECT = 'REJECT' as const;

const MINIMUM_SAFE_SAFETY_SCORE = 7;

interface TrendSignalRecord {
  id: string;
  source: string;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  rawTitle: string;
  normalizedTitle: string;
  sourceHash: string;
  discoveryReason: string;
  trendScore: number;
  demandSignal?: string | null;
  competitionSignal?: string | null;
  seasonalitySignal?: string | null;
  metadata?: unknown;
}

export interface ProductDraftRecord {
  id: string;
  status: ProductDraftStatusValue;
  transitionIdempotencyKey?: string | null;
}

interface ProductDraftEvaluationRecord extends ProductDraftRecord {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  price?: unknown;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  affiliateUrl?: string | null;
  category?: string | null;
  sourceType?: string | null;
  normalizedTitle: string;
  sourceHash: string;
  discoveryReason: string;
  trendScore: number;
  demandSignal?: string | null;
  competitionSignal?: string | null;
  seasonalitySignal?: string | null;
  rawData?: unknown;
}

interface ProductScoreRecord {
  id: string;
  productDraftId?: string | null;
  productId?: string | null;
  aiRunId?: string | null;
  idempotencyKey?: string | null;
  scores: unknown;
  reasoning?: unknown;
  riskFlags?: unknown;
  recommendation?: string | null;
  status: string;
}

interface ProductRecord {
  id: string;
  slug?: string;
  sourceUrl?: string | null;
}

interface StoreRecord {
  id: string;
}

interface ApprovalAuditRecord {
  metadata?: unknown;
}

interface AffiliateAiOsPrisma {
  $transaction<T>(fn: (tx: AffiliateAiOsPrisma) => Promise<T>): Promise<T>;
  trendSignal: {
    findUnique(args: unknown): Promise<TrendSignalRecord | null>;
  };
  productDraft: {
    findFirst(args: unknown): Promise<ProductDraftEvaluationRecord | null>;
    create(args: unknown): Promise<ProductDraftRecord>;
    findMany(args: unknown): Promise<ProductDraftRecord[]>;
    findUnique(args: unknown): Promise<ProductDraftEvaluationRecord | null>;
    update(args: unknown): Promise<ProductDraftRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  productScore: {
    create(args: unknown): Promise<ProductScoreRecord>;
    findFirst(args: unknown): Promise<ProductScoreRecord | null>;
    update(args: unknown): Promise<ProductScoreRecord>;
  };
  product: {
    create(args: unknown): Promise<ProductRecord>;
    findFirst(args: unknown): Promise<ProductRecord | null>;
    upsert(args: unknown): Promise<ProductRecord>;
  };
  productTranslation: {
    upsert(args: unknown): Promise<unknown>;
  };
  productPrice: {
    upsert(args: unknown): Promise<unknown>;
  };
  verdict: {
    upsert(args: unknown): Promise<unknown>;
  };
  store: {
    upsert(args: unknown): Promise<StoreRecord>;
  };
  approvalAuditEvent: {
    findFirst(args: unknown): Promise<ApprovalAuditRecord | null>;
    create(args: unknown): Promise<unknown>;
  };
}

interface ProductDraftScorePayload {
  scores: {
    overall: number;
    safety: number;
    affiliate: number;
    content: number;
  };
  reasoning: {
    ar: string;
    en: string;
  };
  riskFlags: Array<{
    code: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
  }>;
  recommendation:
    | typeof PRODUCT_SCORE_RECOMMENDATION_READY
    | typeof PRODUCT_SCORE_RECOMMENDATION_NEEDS_REVIEW
    | typeof PRODUCT_SCORE_RECOMMENDATION_REJECT;
  status:
    | typeof PRODUCT_SCORE_STATUS_APPROVED
    | typeof PRODUCT_SCORE_STATUS_NEEDS_REVIEW
    | typeof PRODUCT_SCORE_STATUS_REJECTED;
}

interface ProductDraftRawData {
  brand?: unknown;
  locale?: unknown;
  reviews?: unknown;
  safetySignals?: {
    severity?: unknown;
    recalls?: unknown;
    hazards?: unknown;
  };
}

const TRANSITIONABLE_DRAFT_STATUSES = [
  PRODUCT_DRAFT_STATUS_NEEDS_REVIEW,
  PRODUCT_DRAFT_STATUS_NEEDS_EDIT,
] as const;

const PRODUCT_DRAFT_LIST_SELECT = {
  id: true,
  trendSignalId: true,
  title: true,
  description: true,
  imageUrl: true,
  price: true,
  sourceUrl: true,
  canonicalUrl: true,
  affiliateUrl: true,
  category: true,
  sourceType: true,
  normalizedTitle: true,
  sourceHash: true,
  discoveryReason: true,
  trendScore: true,
  demandSignal: true,
  competitionSignal: true,
  seasonalitySignal: true,
  status: true,
  approvedBy: true,
  approvedAt: true,
  rejectedBy: true,
  rejectedAt: true,
  rejectionReason: true,
  editNotes: true,
  transitionIdempotencyKey: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProductDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Converts a trend signal into a review-only product draft.
   * This deliberately never creates or upserts a Product; publishing is outside
   * Affiliate AI OS Phase 1 and requires a separate explicit approval path.
   */
  async createDraftFromSignal(signalId: string) {
    const db = this.prisma as unknown as AffiliateAiOsPrisma;
    const trendSignal = await db.trendSignal.findUnique({
      where: { id: signalId },
    });

    if (!trendSignal) {
      throw new NotFoundException(`TrendSignal ${signalId} was not found`);
    }

    const dedupeConditions = [
      ...(trendSignal.canonicalUrl
        ? [{ canonicalUrl: trendSignal.canonicalUrl }]
        : []),
      { normalizedTitle: trendSignal.normalizedTitle },
      { sourceHash: trendSignal.sourceHash },
    ];

    const existingDraft = await db.productDraft.findFirst({
      where: { OR: dedupeConditions },
    });

    if (existingDraft) {
      return existingDraft;
    }

    try {
      return await db.productDraft.create({
        data: {
          trendSignalId: trendSignal.id,
          title: trendSignal.rawTitle,
          sourceUrl: trendSignal.canonicalUrl ?? trendSignal.sourceUrl,
          canonicalUrl: trendSignal.canonicalUrl,
          sourceType: trendSignal.source,
          normalizedTitle: trendSignal.normalizedTitle,
          sourceHash: trendSignal.sourceHash,
          discoveryReason: trendSignal.discoveryReason,
          trendScore: trendSignal.trendScore,
          demandSignal: trendSignal.demandSignal,
          competitionSignal: trendSignal.competitionSignal,
          seasonalitySignal: trendSignal.seasonalitySignal,
          rawData: trendSignal.metadata,
          status: PRODUCT_DRAFT_STATUS_NEEDS_REVIEW,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      const racedDraft = await db.productDraft.findFirst({
        where: { OR: dedupeConditions },
      });

      if (racedDraft) {
        return racedDraft;
      }

      throw error;
    }
  }

  /** Lists dashboard review drafts with a bounded result size. */
  async listDrafts(query: ListProductDraftsQuery = {}) {
    const db = this.prisma as unknown as AffiliateAiOsPrisma;
    const take = this.normalizeLimit(query.limit);

    return db.productDraft.findMany({
      where: query.status ? { status: query.status } : undefined,
      select: PRODUCT_DRAFT_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Applies an admin review transition to a draft with idempotent retries.
   * Invalid transitions fail closed with ConflictException and never publish a Product.
   */
  async transitionDraft(id: string, options: ProductDraftTransitionInput) {
    const db = this.prisma as unknown as AffiliateAiOsPrisma;
    const draft = await db.productDraft.findUnique({ where: { id } });
    const transitionIdempotencyKey = options.idempotencyKey?.trim() || null;

    if (!draft) {
      throw new NotFoundException(`ProductDraft ${id} was not found`);
    }

    if (
      transitionIdempotencyKey &&
      draft.transitionIdempotencyKey === transitionIdempotencyKey
    ) {
      return draft;
    }

    if (!this.canTransition(draft.status, options.action)) {
      throw new ConflictException(
        `Cannot transition draft from ${draft.status} to ${options.action}`,
      );
    }

    const transitionResult = await db.$transaction(async (tx) => {
      const updateResult = await tx.productDraft.updateMany({
        where: {
          id,
          status: { in: [...TRANSITIONABLE_DRAFT_STATUSES] },
        },
        data: this.buildTransitionData(options, transitionIdempotencyKey),
      });

      const updatedDraft = await tx.productDraft.findUnique({ where: { id } });

      if (!updatedDraft) {
        throw new NotFoundException(`ProductDraft ${id} was not found`);
      }

      if (updateResult.count === 1) {
        await recordApprovalAuditEvent(tx, {
          action: this.auditActionForTransition(options.action),
          entityType: 'PRODUCT_DRAFT',
          entityId: id,
          reason: options.reason?.trim() || options.notes?.trim() || null,
          metadata: transitionIdempotencyKey ? { transitionIdempotencyKey } : {},
        });
      }

      return {
        updateCount: updateResult.count,
        updatedDraft,
      };
    });

    if (transitionResult.updateCount === 1) {
      return transitionResult.updatedDraft;
    }

    if (
      transitionIdempotencyKey &&
      transitionResult.updatedDraft.transitionIdempotencyKey === transitionIdempotencyKey
    ) {
      return transitionResult.updatedDraft;
    }

    throw new ConflictException(
      `Cannot transition draft from ${transitionResult.updatedDraft.status} to ${options.action}`,
    );
  }

  /**
   * Evaluates a draft into a reviewable ProductScore without publishing it.
   * The score is deterministic from draft metadata so repeated runs can safely
   * update the same idempotency key or latest draft score.
   */
  async evaluateDraft(id: string, options: ProductDraftEvaluationInput = {}) {
    const db = this.prisma as unknown as AffiliateAiOsPrisma;
    const draft = await db.productDraft.findUnique({ where: { id } });

    if (!draft) {
      throw new NotFoundException(`ProductDraft ${id} was not found`);
    }

    if (
      draft.status === PRODUCT_DRAFT_STATUS_PUBLISHED ||
      draft.status === PRODUCT_DRAFT_STATUS_REJECTED
    ) {
      throw new ConflictException(
        `Cannot evaluate draft from ${draft.status}; expected a reviewable draft`,
      );
    }

    const scorePayload = this.buildScorePayload(draft);
    const idempotencyKey = options.idempotencyKey?.trim() || null;
    const scoreData = {
      productDraftId: draft.id,
      aiRunId: options.aiRunId?.trim() || null,
      idempotencyKey,
      scores: scorePayload.scores,
      reasoning: scorePayload.reasoning,
      riskFlags: scorePayload.riskFlags,
      recommendation: scorePayload.recommendation,
      status: scorePayload.status,
    };

    const existingScore = idempotencyKey
      ? await db.productScore.findFirst({ where: { idempotencyKey } })
      : await db.productScore.findFirst({
          where: { productDraftId: draft.id },
          orderBy: { updatedAt: 'desc' },
        });

    if (existingScore) {
      if (existingScore.productDraftId !== draft.id) {
        throw new ConflictException(
          'Evaluation idempotency key is already associated with another ProductDraft',
        );
      }

      if (existingScore.status === PRODUCT_SCORE_STATUS_PUBLISHED) {
        throw new ConflictException('Cannot update a published ProductScore');
      }

      return db.productScore.update({
        where: { id: existingScore.id },
        data: scoreData,
      });
    }

    return db.productScore.create({ data: scoreData });
  }

  /**
   * Publishes an explicitly APPROVED draft into the public product tables.
   * Publishing is separate from approval and requires an APPROVED/READY score.
   */
  async publishApprovedDraft(id: string, options: ProductDraftPublishInput = {}) {
    const db = this.prisma as unknown as AffiliateAiOsPrisma;
    const draft = await db.productDraft.findUnique({ where: { id } });

    const idempotencyKey = options.idempotencyKey?.trim() || null;

    if (!draft) {
      throw new NotFoundException(`ProductDraft ${id} was not found`);
    }

    if (
      draft.status === PRODUCT_DRAFT_STATUS_PUBLISHED &&
      idempotencyKey
    ) {
      return this.findPublishedDraftResult(db, draft, idempotencyKey);
    }

    if (draft.status !== PRODUCT_DRAFT_STATUS_APPROVED) {
      throw new ConflictException(
        `Cannot publish draft from ${draft.status}; expected APPROVED`,
      );
    }

    const score = await db.productScore.findFirst({
      where: { productDraftId: draft.id },
      orderBy: { updatedAt: 'desc' },
    });

    if (!this.isApprovedReadyScore(score)) {
      throw new ConflictException(
        'Cannot publish draft without an APPROVED READY ProductScore and safe safety score',
      );
    }

    const publishedAt = new Date();

    return db.$transaction(async (tx) => {
      const store = await tx.store.upsert(this.buildStoreUpsertArgs(draft));
      const product = await tx.product.upsert(
        this.buildProductUpsertArgs(draft, store.id),
      );
      const translation = await tx.productTranslation.upsert(
        this.buildProductTranslationUpsertArgs(draft, product.id),
      );

      const price = draft.price
        ? await tx.productPrice.upsert(
            this.buildProductPriceUpsertArgs(draft, product.id, store.id),
          )
        : null;

      const verdict = await tx.verdict.upsert(
        this.buildVerdictUpsertArgs(product.id, score),
      );
      const updatedScore = await tx.productScore.update({
        where: { id: score.id },
        data: {
          productId: product.id,
          status: PRODUCT_SCORE_STATUS_PUBLISHED,
        },
      });
      const updatedDraft = await tx.productDraft.update({
        where: { id: draft.id },
        data: { status: PRODUCT_DRAFT_STATUS_PUBLISHED },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'PUBLISHED',
        entityType: 'PRODUCT_DRAFT',
        entityId: draft.id,
        metadata: {
          ...(idempotencyKey ? { idempotencyKey } : {}),
          productId: product.id,
          productScoreId: score.id,
          publishedAt: publishedAt.toISOString(),
        },
      });

      return {
        product,
        translation,
        price,
        verdict,
        score: updatedScore,
        draft: updatedDraft,
      };
    });
  }

  /** Returns the previously published product for a same-key publish retry. */
  private async findPublishedDraftResult(
    db: AffiliateAiOsPrisma,
    draft: ProductDraftEvaluationRecord,
    idempotencyKey: string,
  ) {
    const auditEvent = await db.approvalAuditEvent.findFirst({
      where: {
        action: 'PUBLISHED',
        entityType: 'PRODUCT_DRAFT',
        entityId: draft.id,
        metadata: { path: ['idempotencyKey'], equals: idempotencyKey },
      },
      orderBy: { createdAt: 'desc' },
    });
    const auditMetadata = this.asRecord(auditEvent?.metadata);
    const productId =
      typeof auditMetadata.productId === 'string' ? auditMetadata.productId : null;
    const productScoreId =
      typeof auditMetadata.productScoreId === 'string'
        ? auditMetadata.productScoreId
        : null;

    if (!productId) {
      throw new ConflictException(
        'Cannot resolve previously published product for idempotent retry',
      );
    }

    const score = await db.productScore.findFirst({
      where: productScoreId
        ? { id: productScoreId }
        : {
            productDraftId: draft.id,
            productId,
            status: PRODUCT_SCORE_STATUS_PUBLISHED,
          },
      orderBy: { updatedAt: 'desc' },
    });

    if (!score?.productId || score.productId !== productId) {
      throw new ConflictException(
        'Cannot resolve previously published product for idempotent retry',
      );
    }

    const product = await db.product.findFirst({ where: { id: productId } });

    if (!product) {
      throw new ConflictException(
        'Cannot resolve previously published product for idempotent retry',
      );
    }

    return {
      product,
      translation: null,
      price: null,
      verdict: null,
      score,
      draft,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private buildTransitionData(
    options: ProductDraftTransitionInput,
    transitionIdempotencyKey: string | null,
  ): Record<string, unknown> {
    if (options.action === 'approve') {
      return {
        status: PRODUCT_DRAFT_STATUS_APPROVED,
        approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
        approvedAt: new Date(),
        transitionIdempotencyKey,
      };
    }

    if (options.action === 'reject') {
      return {
        status: PRODUCT_DRAFT_STATUS_REJECTED,
        rejectedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
        rejectedAt: new Date(),
        rejectionReason: options.reason?.trim() || null,
        transitionIdempotencyKey,
      };
    }

    return {
      status: PRODUCT_DRAFT_STATUS_NEEDS_EDIT,
      editNotes: options.notes?.trim() || null,
      transitionIdempotencyKey,
    };
  }

  private canTransition(
    currentStatus: ProductDraftStatusValue,
    action: ProductDraftTransitionInput['action'],
  ): boolean {
    if (
      currentStatus !== PRODUCT_DRAFT_STATUS_NEEDS_REVIEW &&
      currentStatus !== PRODUCT_DRAFT_STATUS_NEEDS_EDIT
    ) {
      return false;
    }

    return action === 'approve' || action === 'reject' || action === 'needs_edit';
  }

  private auditActionForTransition(
    action: ProductDraftTransitionInput['action'],
  ): 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' {
    if (action === 'approve') {
      return 'APPROVED';
    }

    if (action === 'reject') {
      return 'REJECTED';
    }

    return 'REVISION_REQUESTED';
  }

  private buildScorePayload(
    draft: ProductDraftEvaluationRecord,
  ): ProductDraftScorePayload {
    const rawData = this.normalizeRawData(draft.rawData);
    const riskFlags = this.extractRiskFlags(rawData);
    const trendScore = this.scoreFromTrend(draft.trendScore);
    const safetyPenalty = riskFlags.reduce((total, flag) => {
      if (flag.severity === 'HIGH') {
        return total + 4;
      }

      if (flag.severity === 'MEDIUM') {
        return total + 2;
      }

      return total + 0.75;
    }, 0);
    const reviewBoost = this.reviewSignalBoost(rawData.reviews);
    const safety = this.clampScore(9 - safetyPenalty + reviewBoost / 2);
    const affiliate = this.clampScore(
      trendScore + (draft.affiliateUrl ? 0.7 : 0) + (draft.price ? 0.3 : -0.3),
    );
    const content = this.clampScore(
      trendScore + (draft.description ? 0.4 : -0.4) + (draft.imageUrl ? 0.3 : 0),
    );
    const overall = this.roundScore(
      safety * 0.45 + affiliate * 0.3 + content * 0.25,
    );
    const hasHighRisk = riskFlags.some((flag) => flag.severity === 'HIGH');
    const hasMediumRisk = riskFlags.some((flag) => flag.severity === 'MEDIUM');
    const recommendation = hasHighRisk
      ? PRODUCT_SCORE_RECOMMENDATION_REJECT
      : hasMediumRisk || safety < MINIMUM_SAFE_SAFETY_SCORE || overall < 7
        ? PRODUCT_SCORE_RECOMMENDATION_NEEDS_REVIEW
        : PRODUCT_SCORE_RECOMMENDATION_READY;
    const status =
      recommendation === PRODUCT_SCORE_RECOMMENDATION_READY
        ? PRODUCT_SCORE_STATUS_APPROVED
        : recommendation === PRODUCT_SCORE_RECOMMENDATION_REJECT
          ? PRODUCT_SCORE_STATUS_REJECTED
          : PRODUCT_SCORE_STATUS_NEEDS_REVIEW;

    return {
      scores: {
        overall,
        safety: this.roundScore(safety),
        affiliate: this.roundScore(affiliate),
        content: this.roundScore(content),
      },
      reasoning: {
        ar: this.buildArabicReasoning(draft, recommendation, riskFlags),
        en: this.buildEnglishReasoning(draft, recommendation, riskFlags),
      },
      riskFlags,
      recommendation,
      status,
    };
  }

  private buildStoreUpsertArgs(draft: ProductDraftEvaluationRecord) {
    const slug = this.storeSlugForDraft(draft);

    return {
      where: { slug },
      create: {
        name: this.storeNameForSlug(slug),
        slug,
        url: this.originForDraft(draft) ?? draft.sourceUrl ?? 'https://babiespicks.com',
        affiliateNetwork: draft.sourceType ?? null,
        isActive: true,
      },
      update: {
        affiliateNetwork: draft.sourceType ?? null,
        isActive: true,
      },
    };
  }

  private buildProductUpsertArgs(
    draft: ProductDraftEvaluationRecord,
    storeId: string,
  ) {
    const sourceUrl = this.productSourceUrl(draft);
    const slug = this.slugify(`${draft.normalizedTitle}-${draft.sourceHash}`);
    const brand = this.extractBrand(draft.rawData);

    return {
      where: sourceUrl ? { sourceUrl } : { slug },
      create: {
        name: draft.title,
        slug,
        brand,
        imageUrl: draft.imageUrl ?? null,
        storeId,
        sourceUrl,
        dataSource: 'AI_EXTRACTION',
        confidence: this.roundScore(this.scoreFromTrend(draft.trendScore)) / 10,
        isActive: true,
        status: 'READY',
      },
      update: {
        name: draft.title,
        brand,
        imageUrl: draft.imageUrl ?? null,
        storeId,
        sourceUrl,
        dataSource: 'AI_EXTRACTION',
        status: 'READY',
        isActive: true,
      },
    };
  }

  private buildProductTranslationUpsertArgs(
    draft: ProductDraftEvaluationRecord,
    productId: string,
  ) {
    const slug = this.slugify(draft.normalizedTitle || draft.title);

    return {
      where: { productId_locale: { productId, locale: 'ar' } },
      create: {
        productId,
        locale: 'ar',
        name: draft.title,
        description: draft.description ?? draft.discoveryReason,
        slug,
        metaTitle: draft.title,
        metaDescription: draft.description ?? draft.discoveryReason,
      },
      update: {
        name: draft.title,
        description: draft.description ?? draft.discoveryReason,
        slug,
        metaTitle: draft.title,
        metaDescription: draft.description ?? draft.discoveryReason,
      },
    };
  }

  private buildProductPriceUpsertArgs(
    draft: ProductDraftEvaluationRecord,
    productId: string,
    storeId: string,
  ) {
    return {
      where: { id: `price_${productId}_${storeId}` },
      create: {
        id: `price_${productId}_${storeId}`,
        productId,
        storeId,
        price: draft.price,
        currency: 'SAR',
        url: draft.affiliateUrl ?? this.productSourceUrl(draft),
        inStock: true,
      },
      update: {
        price: draft.price,
        currency: 'SAR',
        url: draft.affiliateUrl ?? this.productSourceUrl(draft),
        inStock: true,
      },
    };
  }

  private buildVerdictUpsertArgs(productId: string, score: ProductScoreRecord) {
    const scores = this.asScoreObject(score.scores);
    const reasoning = this.asReasoningObject(score.reasoning);

    return {
      where: { productId },
      create: {
        productId,
        type: this.verdictTypeForOverall(scores.overall),
        overallScore: scores.overall,
        safetyScore: scores.safety,
        qualityScore: scores.content,
        reviewsScore: scores.content,
        priceScore: scores.affiliate,
        longTermScore: scores.overall,
        reasoningAr: reasoning.ar,
        reasoningEn: reasoning.en,
        conditionsAr: [],
        conditionsEn: [],
        isPublished: true,
      },
      update: {
        type: this.verdictTypeForOverall(scores.overall),
        overallScore: scores.overall,
        safetyScore: scores.safety,
        qualityScore: scores.content,
        reviewsScore: scores.content,
        priceScore: scores.affiliate,
        longTermScore: scores.overall,
        reasoningAr: reasoning.ar,
        reasoningEn: reasoning.en,
        isPublished: true,
      },
    };
  }

  private isApprovedReadyScore(score: ProductScoreRecord | null): score is ProductScoreRecord {
    if (!score) {
      return false;
    }

    const scores = this.asScoreObject(score.scores);
    const riskFlags = Array.isArray(score.riskFlags) ? score.riskFlags : [];
    const hasHighRisk = riskFlags.some(
      (flag) =>
        typeof flag === 'object' &&
        flag !== null &&
        'severity' in flag &&
        flag.severity === 'HIGH',
    );

    return (
      score.status === PRODUCT_SCORE_STATUS_APPROVED &&
      score.recommendation === PRODUCT_SCORE_RECOMMENDATION_READY &&
      scores.safety >= MINIMUM_SAFE_SAFETY_SCORE &&
      scores.overall >= MINIMUM_SAFE_SAFETY_SCORE &&
      !hasHighRisk
    );
  }

  private normalizeRawData(rawData: unknown): ProductDraftRawData {
    return typeof rawData === 'object' && rawData !== null
      ? (rawData as ProductDraftRawData)
      : {};
  }

  private extractRiskFlags(rawData: ProductDraftRawData): ProductDraftScorePayload['riskFlags'] {
    const safetySignals = rawData.safetySignals;

    if (!safetySignals) {
      return [];
    }

    const severity = this.normalizeRiskSeverity(safetySignals.severity);
    const flags: ProductDraftScorePayload['riskFlags'] = [];
    const recalls = Array.isArray(safetySignals.recalls)
      ? safetySignals.recalls
      : [];
    const hazards = Array.isArray(safetySignals.hazards)
      ? safetySignals.hazards
      : [];

    for (const recall of recalls) {
      flags.push({
        code: 'SAFETY_RECALL',
        severity,
        message: `Safety recall detected: ${String(recall)}`,
      });
    }

    for (const hazard of hazards) {
      flags.push({
        code: this.hazardCode(String(hazard)),
        severity,
        message: `Safety hazard detected: ${String(hazard)}`,
      });
    }

    if (flags.length === 0 && severity !== 'LOW') {
      flags.push({
        code: 'SAFETY_SIGNAL',
        severity,
        message: 'Safety signal requires manual review.',
      });
    }

    return flags;
  }

  private normalizeRiskSeverity(value: unknown): 'LOW' | 'MEDIUM' | 'HIGH' {
    const severity = String(value ?? '').toUpperCase();

    if (severity === 'HIGH') {
      return 'HIGH';
    }

    if (severity === 'MEDIUM') {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private hazardCode(value: string): string {
    const normalized = value.toUpperCase();

    if (normalized.includes('CHOKING')) {
      return 'CHOKING_HAZARD';
    }

    if (normalized.includes('TIP')) {
      return 'TIP_OVER_HAZARD';
    }

    return `SAFETY_${normalized.replace(/[^A-Z0-9]+/g, '_')}`;
  }

  private scoreFromTrend(trendScore: number): number {
    return this.clampScore(trendScore / 10);
  }

  private reviewSignalBoost(reviews: unknown): number {
    if (!Array.isArray(reviews) || reviews.length === 0) {
      return 0;
    }

    const ratings = reviews
      .map((review) => {
        if (typeof review !== 'object' || review === null || !('rating' in review)) {
          return null;
        }

        const rating = Number(review.rating);
        return Number.isFinite(rating) ? rating : null;
      })
      .filter((rating): rating is number => rating !== null);

    if (ratings.length === 0) {
      return 0;
    }

    const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    return Math.max(0, Math.min(1, (average - 4) / 1));
  }

  private buildArabicReasoning(
    draft: ProductDraftEvaluationRecord,
    recommendation: ProductDraftScorePayload['recommendation'],
    riskFlags: ProductDraftScorePayload['riskFlags'],
  ): string {
    if (recommendation === PRODUCT_SCORE_RECOMMENDATION_REJECT) {
      return `تم رفض تقييم ${draft.title} بسبب مؤشرات سلامة عالية تحتاج استبعاد المنتج.`;
    }

    if (recommendation === PRODUCT_SCORE_RECOMMENDATION_NEEDS_REVIEW) {
      return `يحتاج ${draft.title} إلى مراجعة تحريرية قبل النشر بسبب مؤشرات جودة أو سلامة.`;
    }

    return riskFlags.length === 0
      ? `يبدو ${draft.title} مناسباً للنشر مع طلب جيد ومخاطر سلامة منخفضة.`
      : `يبدو ${draft.title} مناسباً للنشر بعد مراجعة مؤشرات المخاطر المحدودة.`;
  }

  private buildEnglishReasoning(
    draft: ProductDraftEvaluationRecord,
    recommendation: ProductDraftScorePayload['recommendation'],
    riskFlags: ProductDraftScorePayload['riskFlags'],
  ): string {
    if (recommendation === PRODUCT_SCORE_RECOMMENDATION_REJECT) {
      return `${draft.title} is rejected because high-severity safety signals were detected.`;
    }

    if (recommendation === PRODUCT_SCORE_RECOMMENDATION_NEEDS_REVIEW) {
      return `${draft.title} needs editorial review before publishing due to quality or safety signals.`;
    }

    return riskFlags.length === 0
      ? `${draft.title} is ready to publish with strong demand and low safety risk.`
      : `${draft.title} is ready to publish after reviewing limited risk signals.`;
  }

  private asScoreObject(scores: unknown): ProductDraftScorePayload['scores'] {
    const value =
      typeof scores === 'object' && scores !== null
        ? (scores as Record<string, unknown>)
        : {};

    return {
      overall: this.numberFromScore(value.overall),
      safety: this.numberFromScore(value.safety),
      affiliate: this.numberFromScore(value.affiliate),
      content: this.numberFromScore(value.content),
    };
  }

  private asReasoningObject(reasoning: unknown): ProductDraftScorePayload['reasoning'] {
    const value =
      typeof reasoning === 'object' && reasoning !== null
        ? (reasoning as Record<string, unknown>)
        : {};

    return {
      ar: typeof value.ar === 'string' ? value.ar : 'تم تقييم المنتج للنشر.',
      en: typeof value.en === 'string' ? value.en : 'The product was evaluated for publishing.',
    };
  }

  private numberFromScore(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? this.roundScore(parsed) : 0;
  }

  private verdictTypeForOverall(score: number): 'WORTH_IT' | 'WORTH_IT_WITH' | 'WAIT' | 'NOT_WORTH_IT' {
    if (score >= 7.5) {
      return 'WORTH_IT';
    }

    if (score >= 6) {
      return 'WORTH_IT_WITH';
    }

    if (score >= 4.5) {
      return 'WAIT';
    }

    return 'NOT_WORTH_IT';
  }

  private extractBrand(rawData: unknown): string | null {
    const normalized = this.normalizeRawData(rawData);
    return typeof normalized.brand === 'string' && normalized.brand.trim()
      ? normalized.brand.trim()
      : null;
  }

  private productSourceUrl(draft: ProductDraftEvaluationRecord): string | null {
    return draft.canonicalUrl ?? draft.sourceUrl ?? null;
  }

  private storeSlugForDraft(draft: ProductDraftEvaluationRecord): string {
    if (draft.sourceType) {
      return this.slugify(draft.sourceType);
    }

    const origin = this.originForDraft(draft);

    if (origin) {
      return this.slugify(new URL(origin).hostname.replace(/^www\./, ''));
    }

    return 'babiespicks-manual';
  }

  private storeNameForSlug(slug: string): string {
    return slug
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private originForDraft(draft: ProductDraftEvaluationRecord): string | null {
    const url = draft.canonicalUrl ?? draft.sourceUrl;

    if (!url) {
      return null;
    }

    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }

  private slugify(value: string): string {
    const slug = value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);

    return slug || 'product-draft';
  }

  private clampScore(value: number): number {
    return Math.min(10, Math.max(0, value));
  }

  private roundScore(value: number): number {
    return Math.round(this.clampScore(value) * 10) / 10;
  }

  private normalizeLimit(value?: number | string): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(value ?? '50', 10);

    if (!Number.isFinite(parsed)) {
      return 50;
    }

    return Math.min(100, Math.max(1, parsed));
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
