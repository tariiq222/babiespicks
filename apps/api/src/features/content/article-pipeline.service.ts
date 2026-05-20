import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalAuditAction,
  ApprovalAuditEntityType,
  ArticleDraftStatus,
  ContentStatus,
  ProductDraftStatus,
  ProductStatus,
  type Prisma,
} from '@prisma/client';
import {
  recordApprovalAuditEvent,
  SERVER_DERIVED_APPROVAL_ACTOR_ID,
} from '../../infrastructure/approval/approval-audit';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const ARTICLE_STATUS_NEEDS_REVIEW = ArticleDraftStatus.NEEDS_REVIEW;
const ARTICLE_STATUS_APPROVED = ArticleDraftStatus.APPROVED;
const ARTICLE_STATUS_REJECTED = ArticleDraftStatus.REJECTED;
const ARTICLE_STATUS_PUBLISHED = ArticleDraftStatus.PUBLISHED;
const PRODUCT_ELIGIBLE_STATUSES = [ProductStatus.READY, ProductStatus.ACTIVE] as const;
const PRODUCT_DRAFT_ELIGIBLE_STATUSES = [
  ProductDraftStatus.APPROVED,
  ProductDraftStatus.PUBLISHED,
] as const;

interface ArticleDraftRecord {
  id: string;
  contentPageId?: string | null;
  idempotencyKey?: string | null;
  locale: string;
  type: string;
  title: string;
  slug: string;
  outline?: Prisma.JsonValue | null;
  content?: string | null;
  productIds: string[];
  seo?: Prisma.JsonValue | null;
  status: ArticleDraftStatus | string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  revisionNotes?: string | null;
}

interface ContentPageRecord {
  id: string;
  slug: string;
  type: string;
}

interface EligibleRecord {
  id: string;
  status: string;
}

interface ArticlePipelinePrisma {
  $transaction<T>(fn: (tx: ArticlePipelinePrisma) => Promise<T>): Promise<T>;
  product: {
    findMany(args: unknown): Promise<EligibleRecord[]>;
  };
  productDraft?: {
    findMany(args: unknown): Promise<EligibleRecord[]>;
  };
  articleDraft: {
    findUnique(args: unknown): Promise<ArticleDraftRecord | null>;
    create(args: unknown): Promise<ArticleDraftRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  contentPage?: {
    findUnique(args: unknown): Promise<ContentPageRecord | null>;
    create(args: unknown): Promise<ContentPageRecord>;
    update(args: unknown): Promise<ContentPageRecord>;
  };
  contentPageTranslation?: {
    upsert(args: unknown): Promise<unknown>;
  };
  approvalAuditEvent: {
    create(args: unknown): Promise<unknown>;
  };
}

/** Input accepted by the server-side article draft generation pipeline. */
export interface CreateArticleDraftInput {
  locale: string;
  type: string;
  title: string;
  slug: string;
  content: string;
  outline?: Prisma.InputJsonValue | null;
  seo?: Prisma.InputJsonValue | null;
  productIds?: string[];
  sourceProductDraftIds?: string[];
  idempotencyKey?: string | null;
  idempotency?: string | null;
}

/** Review decision payload for approve, reject, and revision transitions. */
export interface ArticleDraftReviewInput {
  reason?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

@Injectable()
export class ArticlePipelineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a review-only article draft after validating all source products.
   * This method never publishes content; every draft starts in NEEDS_REVIEW.
   */
  async createArticleDraft(input: CreateArticleDraftInput) {
    const db = this.prisma as unknown as ArticlePipelinePrisma;
    const idempotencyKey = this.normalizeOptionalText(
      input.idempotencyKey ?? input.idempotency,
    );

    if (idempotencyKey) {
      const existingDraft = await db.articleDraft.findUnique({
        where: { idempotencyKey },
      });

      if (existingDraft) {
        return existingDraft;
      }
    }

    await this.assertSlugAvailable(db, input.locale, input.slug);
    await this.assertEligibleProducts(db, input.productIds ?? []);
    await this.assertEligibleProductDrafts(db, input.sourceProductDraftIds ?? []);

    return db.articleDraft.create({
      data: {
        locale: input.locale,
        type: input.type,
        title: input.title,
        slug: input.slug,
        content: input.content,
        outline: input.outline ?? undefined,
        seo: input.seo ?? undefined,
        productIds: this.unique(input.productIds ?? []),
        idempotencyKey: idempotencyKey ?? undefined,
        status: ARTICLE_STATUS_NEEDS_REVIEW,
      },
    });
  }

  /** Approves an article draft using the server-derived approval actor. */
  async approveArticleDraft(id: string, input: ArticleDraftReviewInput = {}) {
    const now = new Date();

    return this.transitionReviewState(id, {
      action: ApprovalAuditAction.APPROVED,
      status: ARTICLE_STATUS_APPROVED,
      reason: input.reason,
      metadata: this.idempotencyMetadata(input.idempotencyKey),
      data: {
        status: ARTICLE_STATUS_APPROVED,
        approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
        approvedAt: now,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        revisionNotes: null,
      },
    });
  }

  /** Rejects an article draft using the server-derived approval actor. */
  async rejectArticleDraft(id: string, input: ArticleDraftReviewInput = {}) {
    const now = new Date();
    const reason = input.reason ?? input.notes ?? null;

    return this.transitionReviewState(id, {
      action: ApprovalAuditAction.REJECTED,
      status: ARTICLE_STATUS_REJECTED,
      reason,
      metadata: this.idempotencyMetadata(input.idempotencyKey),
      data: {
        status: ARTICLE_STATUS_REJECTED,
        rejectedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
        rejectedAt: now,
        rejectionReason: this.normalizeOptionalText(reason),
      },
    });
  }

  /** Requests revision while keeping the draft in the review queue. */
  async requestArticleDraftRevision(
    id: string,
    input: ArticleDraftReviewInput = {},
  ) {
    const notes = input.notes ?? input.reason ?? null;

    return this.transitionReviewState(id, {
      action: ApprovalAuditAction.REVISION_REQUESTED,
      status: ARTICLE_STATUS_NEEDS_REVIEW,
      reason: notes,
      metadata: this.idempotencyMetadata(input.idempotencyKey),
      data: {
        status: ARTICLE_STATUS_NEEDS_REVIEW,
        revisionNotes: this.normalizeOptionalText(notes),
      },
    });
  }

  /**
   * Publishes an approved article draft by materializing or updating its content page.
   * The APPROVED precondition is claimed inside the transaction with updateMany so
   * concurrent publishers cannot publish the same draft or bypass review state.
   */
  async publishArticleDraft(id: string) {
    const db = this.prisma as unknown as ArticlePipelinePrisma;

    return db.$transaction(async (tx) => {
      const draft = await tx.articleDraft.findUnique({ where: { id } });

      if (!draft) {
        throw new NotFoundException(`ArticleDraft ${id} was not found`);
      }

      const publishClaim = await tx.articleDraft.updateMany({
        where: { id, status: ARTICLE_STATUS_APPROVED },
        data: { status: ARTICLE_STATUS_PUBLISHED },
      });

      if (publishClaim.count !== 1) {
        throw new ConflictException(
          'ArticleDraft must be approved before publishing',
        );
      }

      const page = await this.upsertContentPageForDraft(tx, draft);
      const updatedDraft = await this.attachPublishedContentPage(
        tx,
        draft.id,
        page.id,
      );

      await recordApprovalAuditEvent(tx, {
        action: ApprovalAuditAction.PUBLISHED,
        entityType: ApprovalAuditEntityType.ARTICLE_DRAFT,
        entityId: draft.id,
        metadata: { contentPageId: page.id, slug: page.slug, locale: draft.locale },
      });

      return updatedDraft;
    });
  }

  private async transitionReviewState(
    id: string,
    options: {
      action:
        | typeof ApprovalAuditAction.APPROVED
        | typeof ApprovalAuditAction.REJECTED
        | typeof ApprovalAuditAction.REVISION_REQUESTED;
      status: ArticleDraftStatus;
      reason?: string | null;
      metadata: Prisma.InputJsonValue;
      data: Record<string, unknown>;
    },
  ) {
    const db = this.prisma as unknown as ArticlePipelinePrisma;
    const existingDraft = await db.articleDraft.findUnique({ where: { id } });

    if (!existingDraft) {
      throw new NotFoundException(`ArticleDraft ${id} was not found`);
    }

    return db.$transaction(async (tx) => {
      const updateResult = await tx.articleDraft.updateMany({
        where: { id, status: ARTICLE_STATUS_NEEDS_REVIEW },
        data: options.data,
      });
      const updatedDraft = await tx.articleDraft.findUnique({ where: { id } });

      if (!updatedDraft) {
        throw new NotFoundException(`ArticleDraft ${id} was not found`);
      }

      if (updateResult.count !== 1) {
        throw new ConflictException(
          `Cannot transition ArticleDraft from ${updatedDraft.status} to ${options.status}`,
        );
      }

      await recordApprovalAuditEvent(tx, {
        action: options.action,
        entityType: ApprovalAuditEntityType.ARTICLE_DRAFT,
        entityId: id,
        reason: this.normalizeOptionalText(options.reason),
        metadata: options.metadata,
      });

      return updatedDraft;
    });
  }

  private async assertSlugAvailable(
    db: ArticlePipelinePrisma,
    locale: string,
    slug: string,
  ) {
    const existingDraft = await db.articleDraft.findUnique({
      where: { locale_slug: { locale, slug } },
    });

    if (existingDraft) {
      throw new ConflictException(
        `ArticleDraft slug must be unique per locale: ${locale}/${slug}`,
      );
    }
  }

  private async assertEligibleProducts(
    db: ArticlePipelinePrisma,
    productIds: string[],
  ) {
    const uniqueProductIds = this.unique(productIds);

    if (uniqueProductIds.length === 0) {
      return;
    }

    const eligibleProducts = await db.product.findMany({
      where: {
        id: { in: uniqueProductIds },
        status: { in: [...PRODUCT_ELIGIBLE_STATUSES] },
      },
      select: { id: true, status: true },
    });

    if (eligibleProducts.length !== uniqueProductIds.length) {
      throw new BadRequestException(
        'Article drafts can only reference products with READY or ACTIVE status',
      );
    }
  }

  private async assertEligibleProductDrafts(
    db: ArticlePipelinePrisma,
    productDraftIds: string[],
  ) {
    const uniqueProductDraftIds = this.unique(productDraftIds);

    if (uniqueProductDraftIds.length === 0) {
      return;
    }

    if (!db.productDraft) {
      throw new BadRequestException('ProductDraft eligibility cannot be verified');
    }

    const rejectedDrafts = await db.productDraft.findMany({
      where: { id: { in: uniqueProductDraftIds }, status: ProductDraftStatus.REJECTED },
      select: { id: true, status: true },
    });

    if (rejectedDrafts.length > 0) {
      throw new BadRequestException(
        'Rejected product drafts cannot be used for article generation',
      );
    }

    const eligibleDrafts = await db.productDraft.findMany({
      where: {
        id: { in: uniqueProductDraftIds },
        status: { in: [...PRODUCT_DRAFT_ELIGIBLE_STATUSES] },
      },
      select: { id: true, status: true },
    });

    if (eligibleDrafts.length !== uniqueProductDraftIds.length) {
      throw new BadRequestException(
        'Article drafts can only use approved or published product drafts',
      );
    }
  }

  private async upsertContentPageForDraft(
    tx: ArticlePipelinePrisma,
    draft: ArticleDraftRecord,
  ) {
    if (!tx.contentPage || !tx.contentPageTranslation) {
      throw new BadRequestException('Content publishing delegates are unavailable');
    }

    const existingPage = draft.contentPageId
      ? await tx.contentPage.findUnique({ where: { id: draft.contentPageId } })
      : await tx.contentPage.findUnique({ where: { slug: draft.slug } });

    if (!existingPage) {
      return tx.contentPage.create({
        data: {
          type: draft.type,
          slug: draft.slug,
          status: ContentStatus.PUBLISHED,
          isPublished: true,
          publishedAt: new Date(),
          translations: { create: this.translationDataForDraft(draft) },
        },
      });
    }

    const updatedPage = await tx.contentPage.update({
      where: { id: existingPage.id },
      data: {
        type: draft.type,
        slug: draft.slug,
        status: ContentStatus.PUBLISHED,
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    await tx.contentPageTranslation.upsert({
      where: {
        contentPageId_locale: {
          contentPageId: updatedPage.id,
          locale: draft.locale,
        },
      },
      update: this.translationDataForDraft(draft),
      create: {
        contentPageId: updatedPage.id,
        ...this.translationDataForDraft(draft),
      },
    });

    return updatedPage;
  }

  private async attachPublishedContentPage(
    tx: ArticlePipelinePrisma,
    id: string,
    contentPageId: string,
  ) {
    const updateResult = await tx.articleDraft.updateMany({
      where: { id, status: ARTICLE_STATUS_PUBLISHED },
      data: {
        contentPageId,
      },
    });

    if (updateResult.count !== 1) {
      throw new ConflictException('ArticleDraft publish claim was lost');
    }

    const updatedDraft = await tx.articleDraft.findUnique({ where: { id } });

    if (!updatedDraft) {
      throw new NotFoundException(`ArticleDraft ${id} was not found`);
    }

    return updatedDraft;
  }

  private translationDataForDraft(draft: ArticleDraftRecord) {
    const seo = this.objectSeo(draft.seo);

    return {
      locale: draft.locale,
      title: draft.title,
      content: draft.content ?? '',
      metaTitle: seo.metaTitle ?? draft.title,
      metaDescription: seo.metaDescription ?? null,
      excerpt: seo.excerpt ?? null,
    };
  }

  private objectSeo(value: Prisma.JsonValue | null | undefined) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return {} as Record<string, string | null | undefined>;
    }

    return value as Record<string, string | null | undefined>;
  }

  private idempotencyMetadata(idempotencyKey: string | null | undefined) {
    const normalizedKey = this.normalizeOptionalText(idempotencyKey);

    return normalizedKey ? { idempotencyKey: normalizedKey } : {};
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
  }

  private unique(values: string[]) {
    return [...new Set(values)];
  }
}
