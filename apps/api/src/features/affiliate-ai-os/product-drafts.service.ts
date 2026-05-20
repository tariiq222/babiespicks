import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  ListProductDraftsQuery,
  ProductDraftStatusValue,
  ProductDraftTransitionInput,
} from './dto/product-drafts.dto';

const PRODUCT_DRAFT_STATUS_NEEDS_REVIEW = 'NEEDS_REVIEW' as const;
const PRODUCT_DRAFT_STATUS_APPROVED = 'APPROVED' as const;
const PRODUCT_DRAFT_STATUS_REJECTED = 'REJECTED' as const;
const PRODUCT_DRAFT_STATUS_NEEDS_EDIT = 'NEEDS_EDIT' as const;

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

interface AffiliateAiOsPrisma {
  trendSignal: {
    findUnique(args: unknown): Promise<TrendSignalRecord | null>;
  };
  productDraft: {
    findFirst(args: unknown): Promise<ProductDraftRecord | null>;
    create(args: unknown): Promise<ProductDraftRecord>;
    findMany(args: unknown): Promise<ProductDraftRecord[]>;
    findUnique(args: unknown): Promise<ProductDraftRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
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

    const updateResult = await db.productDraft.updateMany({
      where: {
        id,
        status: { in: [...TRANSITIONABLE_DRAFT_STATUSES] },
      },
      data: this.buildTransitionData(options, transitionIdempotencyKey),
    });

    const updatedDraft = await db.productDraft.findUnique({ where: { id } });

    if (!updatedDraft) {
      throw new NotFoundException(`ProductDraft ${id} was not found`);
    }

    if (updateResult.count === 1) {
      return updatedDraft;
    }

    if (
      transitionIdempotencyKey &&
      updatedDraft.transitionIdempotencyKey === transitionIdempotencyKey
    ) {
      return updatedDraft;
    }

    throw new ConflictException(
      `Cannot transition draft from ${updatedDraft.status} to ${options.action}`,
    );
  }

  private buildTransitionData(
    options: ProductDraftTransitionInput,
    transitionIdempotencyKey: string | null,
  ): Record<string, unknown> {
    if (options.action === 'approve') {
      return {
        status: PRODUCT_DRAFT_STATUS_APPROVED,
        approvedBy: options.reviewerId?.trim() || null,
        approvedAt: new Date(),
        transitionIdempotencyKey,
      };
    }

    if (options.action === 'reject') {
      return {
        status: PRODUCT_DRAFT_STATUS_REJECTED,
        rejectedBy: options.reviewerId?.trim() || null,
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
