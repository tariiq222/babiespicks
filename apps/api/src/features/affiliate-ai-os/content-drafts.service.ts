import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ArticleDraftStatus, ApprovalAuditAction, ApprovalAuditEntityType } from '@prisma/client';
import {
  recordApprovalAuditEvent,
  SERVER_DERIVED_APPROVAL_ACTOR_ID,
} from '../../infrastructure/approval/approval-audit';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  ContentDraftResponse,
  ContentDraftStatus,
  ContentDraftTransitionBodyDto,
  CreateContentDraftBodyDto,
  ListContentDraftsQuery,
  OfferEnrichmentInput,
  OfferEnrichmentOutput,
  Phase2ContentType,
  UpdateContentDraftBodyDto,
} from './phase-2.dto';

const ARTICLE_STATUS_NEEDS_REVIEW = ArticleDraftStatus.NEEDS_REVIEW;
const ARTICLE_STATUS_APPROVED = ArticleDraftStatus.APPROVED;
const ARTICLE_STATUS_REJECTED = ArticleDraftStatus.REJECTED;

interface ArticleDraftRecord {
  id: string;
  locale: string;
  type: string;
  title: string;
  slug: string;
  content?: string | null;
  outline?: unknown;
  productIds: string[];
  seo?: unknown;
  status: ArticleDraftStatus | string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  revisionNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AiRunRecord {
  id: string;
  type: string;
  status: string;
  input: unknown;
  output: unknown;
}

interface ContentDraftsPrisma {
  $transaction<T>(fn: (tx: ContentDraftsPrisma) => Promise<T>): Promise<T>;
  aiRun: {
    findUnique(args: unknown): Promise<AiRunRecord | null>;
  };
  articleDraft: {
    findUnique(args: unknown): Promise<ArticleDraftRecord | null>;
    findMany(args: unknown): Promise<ArticleDraftRecord[]>;
    create(args: unknown): Promise<ArticleDraftRecord>;
    update(args: unknown): Promise<ArticleDraftRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  approvalAuditEvent: {
    create(args: unknown): Promise<unknown>;
  };
}

const ARTICLE_DRAFT_LIST_SELECT = {
  id: true,
  locale: true,
  type: true,
  title: true,
  slug: true,
  content: true,
  outline: true,
  productIds: true,
  seo: true,
  status: true,
  approvedBy: true,
  approvedAt: true,
  rejectedBy: true,
  rejectedAt: true,
  rejectionReason: true,
  revisionNotes: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ARTICLE_DRAFT_DETAIL_SELECT = {
  ...ARTICLE_DRAFT_LIST_SELECT,
} as const;

@Injectable()
export class ContentDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an ArticleDraft in NEEDS_REVIEW from an offer enrichment AiRun.
   * Maps sourceProductDraftId from the enrichment input into ArticleDraft.productIds.
   * Stores Phase 2 metadata (sourceOfferEnrichmentId, contentType, angle, callToAction) in the outline JSON.
   * Only 'article' contentType is supported; others are rejected with a deferred message.
   */
  async createDraft(body: CreateContentDraftBodyDto): Promise<ContentDraftResponse> {
    const db = this.prisma as unknown as ContentDraftsPrisma;

    const contentType = body.contentType ?? 'article';
    if (contentType !== 'article') {
      throw new ConflictException(
        `Content type '${contentType}' is deferred to a future phase. Only 'article' is supported.`,
      );
    }

    const enrichment = await db.aiRun.findUnique({
      where: { id: body.sourceOfferEnrichmentId },
      select: { id: true, type: true, status: true, input: true, output: true },
    });

    if (!enrichment) {
      throw new NotFoundException(
        `OfferEnrichment ${body.sourceOfferEnrichmentId} was not found`,
      );
    }

    if (enrichment.type !== 'CONTENT_PIPELINE') {
      throw new ConflictException(
        `OfferEnrichment ${body.sourceOfferEnrichmentId} is not a CONTENT_PIPELINE run (type: ${enrichment.type})`,
      );
    }

    if (enrichment.status !== 'COMPLETED') {
      throw new ConflictException(
        `OfferEnrichment ${body.sourceOfferEnrichmentId} is not completed (status: ${enrichment.status})`,
      );
    }

    const enrichmentInput = this.parseEnrichmentInput(enrichment.input);
    const enrichmentOutput = this.parseEnrichmentOutput(enrichment.output);

    if (!enrichmentInput.sourceProductDraftId) {
      throw new BadRequestException(
        `OfferEnrichment ${body.sourceOfferEnrichmentId} input is missing sourceProductDraftId`,
      );
    }

    if (!enrichmentOutput.offerTitle) {
      throw new BadRequestException(
        `OfferEnrichment ${body.sourceOfferEnrichmentId} output is missing offerTitle`,
      );
    }

    const locale = (body.locale ?? 'ar').trim().toLowerCase();
    const type = body.type ?? 'BEST_LIST';
    const title = body.title.trim();
    const slug = await this.generateSlug(db, locale, title);

    const outline = {
      ...(typeof body.rawData === 'object' && body.rawData !== null
        ? (body.rawData as Record<string, unknown>)
        : {}),
      sourceOfferEnrichmentId: enrichment.id,
      phase2Metadata: {
        offerTitle: enrichmentOutput.offerTitle,
        positioningAngle: enrichmentOutput.positioningAngle,
        contentAngles: enrichmentOutput.contentAngles,
        suggestedHooks: enrichmentOutput.suggestedHooks,
        keywords: enrichmentOutput.keywords,
        confidenceScore: enrichmentOutput.confidenceScore,
        contentType,
        angle: body.angle,
        callToAction: body.callToAction,
      },
    };

    const articleDraft = await db.articleDraft.create({
      data: {
        locale,
        type,
        title,
        slug,
        content: body.body ?? '',
        outline,
        productIds: [enrichmentInput.sourceProductDraftId],
        status: ARTICLE_STATUS_NEEDS_REVIEW,
      },
      select: ARTICLE_DRAFT_DETAIL_SELECT,
    });

    return this.mapArticleDraftToResponse(articleDraft);
  }

  /** Gets a single content draft mapped to the Phase 2 response shape. */
  async getDraft(id: string): Promise<ContentDraftResponse> {
    const db = this.prisma as unknown as ContentDraftsPrisma;
    const draft = await db.articleDraft.findUnique({
      where: { id },
      select: ARTICLE_DRAFT_DETAIL_SELECT,
    });

    if (!draft) {
      throw new NotFoundException(`ArticleDraft ${id} was not found`);
    }

    if (!this.isPhase2Draft(draft)) {
      throw new NotFoundException(`ArticleDraft ${id} was not found`);
    }

    return this.mapArticleDraftToResponse(draft);
  }

  /** Lists content drafts mapped to the Phase 2 response shape. */
  async listDrafts(query: ListContentDraftsQuery = {}): Promise<ContentDraftResponse[]> {
    const db = this.prisma as unknown as ContentDraftsPrisma;
    const take = this.normalizeLimit(query.limit);
    const skip = this.normalizeOffset(query.offset);

    const where: Record<string, unknown> = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.type) {
      where.type = query.type;
    }

    const drafts = await db.articleDraft.findMany({
      where,
      select: ARTICLE_DRAFT_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return drafts
      .filter((draft) => this.isPhase2Draft(draft))
      .map((draft) => this.mapArticleDraftToResponse(draft));
  }

  /** Updates editable fields (title, body, angle, callToAction) on a reviewable ArticleDraft. */
  async updateDraft(id: string, body: UpdateContentDraftBodyDto): Promise<ContentDraftResponse> {
    const db = this.prisma as unknown as ContentDraftsPrisma;
    const draft = await db.articleDraft.findUnique({ where: { id } });

    if (!draft) {
      throw new NotFoundException(`ArticleDraft ${id} was not found`);
    }

    if (!this.isPhase2Draft(draft)) {
      throw new ConflictException(
        `ArticleDraft ${id} is not a Phase 2 draft`,
      );
    }

    if (
      draft.status !== ARTICLE_STATUS_NEEDS_REVIEW &&
      draft.status !== String(ArticleDraftStatus.DRAFT)
    ) {
      throw new ConflictException(
        `Cannot update ArticleDraft from ${draft.status}; expected NEEDS_REVIEW or DRAFT`,
      );
    }

    const data = this.buildUpdateData(body, draft);

    if (Object.keys(data).length === 0) {
      return this.getDraft(id);
    }

    await db.articleDraft.update({
      where: { id },
      data,
    });

    return this.getDraft(id);
  }

  /**
   * Approves an ArticleDraft using the server-derived approval actor.
   * No publishing or scheduling is triggered — this is an approval stop only.
   */
  async approveDraft(id: string, body: ContentDraftTransitionBodyDto = {}): Promise<ContentDraftResponse> {
    const db = this.prisma as unknown as ContentDraftsPrisma;
    const draft = await db.articleDraft.findUnique({ where: { id } });

    if (!draft) {
      throw new NotFoundException(`ArticleDraft ${id} was not found`);
    }

    if (!this.isPhase2Draft(draft)) {
      throw new ConflictException(
        `ArticleDraft ${id} is not a Phase 2 draft`,
      );
    }

    if (draft.status !== ARTICLE_STATUS_NEEDS_REVIEW) {
      throw new ConflictException(
        `Cannot approve ArticleDraft from ${draft.status}; expected NEEDS_REVIEW`,
      );
    }

    const now = new Date();

    const updatedDraft = await db.$transaction(async (tx) => {
      const updateResult = await tx.articleDraft.updateMany({
        where: { id, status: ARTICLE_STATUS_NEEDS_REVIEW },
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

      const draftAfterUpdate = await tx.articleDraft.findUnique({ where: { id } });

      if (!draftAfterUpdate) {
        throw new NotFoundException(`ArticleDraft ${id} was not found`);
      }

      if (updateResult.count === 1) {
        await recordApprovalAuditEvent(tx, {
          action: ApprovalAuditAction.APPROVED,
          entityType: ApprovalAuditEntityType.ARTICLE_DRAFT,
          entityId: id,
          reason: body.reason?.trim() || null,
          metadata: body.idempotencyKey
            ? { idempotencyKey: body.idempotencyKey.trim() }
            : {},
        });
      }

      if (updateResult.count !== 1 && draftAfterUpdate.status !== ARTICLE_STATUS_APPROVED) {
        throw new ConflictException(
          `Cannot approve ArticleDraft from ${draftAfterUpdate.status}`,
        );
      }

      return draftAfterUpdate;
    });

    return this.mapArticleDraftToResponse(updatedDraft);
  }

  /**
   * Rejects an ArticleDraft using the server-derived approval actor.
   * No publishing or scheduling is triggered.
   */
  async rejectDraft(id: string, body: ContentDraftTransitionBodyDto = {}): Promise<ContentDraftResponse> {
    const db = this.prisma as unknown as ContentDraftsPrisma;
    const draft = await db.articleDraft.findUnique({ where: { id } });

    if (!draft) {
      throw new NotFoundException(`ArticleDraft ${id} was not found`);
    }

    if (!this.isPhase2Draft(draft)) {
      throw new ConflictException(
        `ArticleDraft ${id} is not a Phase 2 draft`,
      );
    }

    if (draft.status !== ARTICLE_STATUS_NEEDS_REVIEW) {
      throw new ConflictException(
        `Cannot reject ArticleDraft from ${draft.status}; expected NEEDS_REVIEW`,
      );
    }

    const now = new Date();
    const reason = body.reason?.trim() || null;

    const updatedDraft = await db.$transaction(async (tx) => {
      const updateResult = await tx.articleDraft.updateMany({
        where: { id, status: ARTICLE_STATUS_NEEDS_REVIEW },
        data: {
          status: ARTICLE_STATUS_REJECTED,
          rejectedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
          rejectedAt: now,
          rejectionReason: reason,
        },
      });

      const draftAfterUpdate = await tx.articleDraft.findUnique({ where: { id } });

      if (!draftAfterUpdate) {
        throw new NotFoundException(`ArticleDraft ${id} was not found`);
      }

      if (updateResult.count === 1) {
        await recordApprovalAuditEvent(tx, {
          action: ApprovalAuditAction.REJECTED,
          entityType: ApprovalAuditEntityType.ARTICLE_DRAFT,
          entityId: id,
          reason,
          metadata: body.idempotencyKey
            ? { idempotencyKey: body.idempotencyKey.trim() }
            : {},
        });
      }

      if (updateResult.count !== 1 && draftAfterUpdate.status !== ARTICLE_STATUS_REJECTED) {
        throw new ConflictException(
          `Cannot reject ArticleDraft from ${draftAfterUpdate.status}`,
        );
      }

      return draftAfterUpdate;
    });

    return this.mapArticleDraftToResponse(updatedDraft);
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  private buildUpdateData(
    body: UpdateContentDraftBodyDto,
    draft: ArticleDraftRecord,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const trimmed = body.title.trim();
      if (!trimmed) {
        throw new BadRequestException('title cannot be empty');
      }
      data.title = trimmed;
    }

    if (body.body !== undefined) {
      data.content = body.body;
    }

    const needsMetadataUpdate = body.angle !== undefined || body.callToAction !== undefined;
    const needsRawDataUpdate = body.rawData !== undefined;

    if (needsMetadataUpdate || needsRawDataUpdate) {
      const existingOutline =
        typeof draft.outline === 'object' && draft.outline !== null
          ? (draft.outline as Record<string, unknown>)
          : {};

      const existingPhase2Metadata =
        typeof existingOutline.phase2Metadata === 'object' && existingOutline.phase2Metadata !== null
          ? (existingOutline.phase2Metadata as Record<string, unknown>)
          : {};

      const newPhase2Metadata = { ...existingPhase2Metadata };

      if (body.angle !== undefined) {
        newPhase2Metadata.angle = body.angle;
      }

      if (body.callToAction !== undefined) {
        newPhase2Metadata.callToAction = body.callToAction;
      }

      const incomingRawData =
        typeof body.rawData === 'object' && body.rawData !== null
          ? (body.rawData as Record<string, unknown>)
          : {};

      // Preserve Phase 2 metadata keys injected at creation time
      data.outline = {
        ...incomingRawData,
        sourceOfferEnrichmentId: existingOutline.sourceOfferEnrichmentId,
        phase2Metadata: newPhase2Metadata,
      };
    }

    return data;
  }

  private async generateSlug(
    db: ContentDraftsPrisma,
    locale: string,
    title: string,
  ): Promise<string> {
    const baseSlug = this.slugify(title);
    let slug = baseSlug;
    let suffix = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await db.articleDraft.findUnique({
        where: { locale_slug: { locale, slug } },
      });

      if (!existing) {
        return slug;
      }

      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }
  }

  private slugify(text: string): string {
    const slug = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);
    return slug || 'draft';
  }

  private parseEnrichmentInput(value: unknown): OfferEnrichmentInput {
    if (typeof value !== 'object' || value === null) {
      return { sourceProductDraftId: '' };
    }
    const obj = value as Record<string, unknown>;
    return {
      sourceProductDraftId: String(obj.sourceProductDraftId ?? ''),
      enrichmentReason: obj.enrichmentReason
        ? String(obj.enrichmentReason)
        : undefined,
    };
  }

  private parseEnrichmentOutput(value: unknown): OfferEnrichmentOutput {
    if (typeof value !== 'object' || value === null) {
      return {
        offerTitle: '',
        sourceProductDraftId: '',
        status: 'NEEDS_REVIEW',
      };
    }
    const obj = value as Record<string, unknown>;
    return {
      offerTitle: String(obj.offerTitle ?? ''),
      targetAudience: Array.isArray(obj.targetAudience)
        ? obj.targetAudience.map(String)
        : undefined,
      keyBenefits: Array.isArray(obj.keyBenefits)
        ? obj.keyBenefits.map(String)
        : undefined,
      painPoints: Array.isArray(obj.painPoints)
        ? obj.painPoints.map(String)
        : undefined,
      objections: Array.isArray(obj.objections)
        ? obj.objections.map(String)
        : undefined,
      positioningAngle: obj.positioningAngle
        ? String(obj.positioningAngle)
        : undefined,
      contentAngles: Array.isArray(obj.contentAngles)
        ? obj.contentAngles.map(String)
        : undefined,
      suggestedHooks: Array.isArray(obj.suggestedHooks)
        ? obj.suggestedHooks.map(String)
        : undefined,
      keywords: Array.isArray(obj.keywords)
        ? obj.keywords.map(String)
        : undefined,
      confidenceScore:
        typeof obj.confidenceScore === 'number'
          ? obj.confidenceScore
          : undefined,
      sourceProductDraftId: String(obj.sourceProductDraftId ?? ''),
      enrichmentReason: obj.enrichmentReason
        ? String(obj.enrichmentReason)
        : undefined,
      status: this.normalizeEnrichmentStatus(obj.status),
    };
  }

  private normalizeEnrichmentStatus(
    value: unknown,
  ): 'READY' | 'NEEDS_REVIEW' | 'REJECTED' {
    const s = String(value ?? '').toUpperCase();
    if (s === 'READY' || s === 'REJECTED') return s;
    return 'NEEDS_REVIEW';
  }

  private normalizeLimit(value?: number | string): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(value ?? '50', 10);
    if (!Number.isFinite(parsed)) return 50;
    return Math.min(100, Math.max(1, parsed));
  }

  private normalizeOffset(value?: number | string): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(value ?? '0', 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(10_000, Math.max(0, parsed));
  }

  private isPhase2Draft(draft: ArticleDraftRecord): boolean {
    const outline =
      typeof draft.outline === 'object' && draft.outline !== null
        ? (draft.outline as Record<string, unknown>)
        : {};
    return Boolean(outline.sourceOfferEnrichmentId);
  }

  private mapArticleDraftToResponse(draft: ArticleDraftRecord): ContentDraftResponse {
    const outline =
      typeof draft.outline === 'object' && draft.outline !== null
        ? (draft.outline as Record<string, unknown>)
        : {};

    const phase2Metadata =
      typeof outline.phase2Metadata === 'object' && outline.phase2Metadata !== null
        ? (outline.phase2Metadata as Record<string, unknown>)
        : {};

    const status = this.mapArticleStatusToPhase2(draft.status as ArticleDraftStatus);

    return {
      id: draft.id,
      sourceOfferEnrichmentId: String(outline.sourceOfferEnrichmentId ?? ''),
      contentType: (phase2Metadata.contentType as Phase2ContentType) ?? 'article',
      title: draft.title,
      body: draft.content ?? '',
      angle:
        (phase2Metadata.angle as string | undefined) ??
        (phase2Metadata.positioningAngle as string | undefined),
      callToAction: phase2Metadata.callToAction as string | undefined,
      status,
      approvalStatus: status,
      readyForNextPhase: status === 'approved',
      locale: draft.locale,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    };
  }

  private mapArticleStatusToPhase2(status: ArticleDraftStatus): ContentDraftStatus {
    switch (status) {
      case ArticleDraftStatus.DRAFT:
        return 'draft';
      case ArticleDraftStatus.NEEDS_REVIEW:
        return 'pending_approval';
      case ArticleDraftStatus.APPROVED:
        return 'approved';
      case ArticleDraftStatus.REJECTED:
        return 'rejected';
      default:
        // PUBLISHED / SCHEDULED are not valid Phase 2 states
        throw new ConflictException(
          `ArticleDraft status '${status}' is not a valid Phase 2 state`,
        );
    }
  }
}
