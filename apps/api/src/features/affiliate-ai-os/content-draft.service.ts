import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  ContentDraftUpdateInput,
  ContentDraftApprovalInput,
  ListContentDraftsQuery,
} from './dto/offer-enrichment.dto';

const CONTENT_DRAFT_STATUS_DRAFT = 'DRAFT';
const CONTENT_DRAFT_STATUS_PENDING_APPROVAL = 'PENDING_APPROVAL';
const CONTENT_DRAFT_STATUS_APPROVED = 'APPROVED';
const CONTENT_DRAFT_STATUS_REJECTED = 'REJECTED';

interface ContentDraftRecord {
  id: string;
  sourceOfferEnrichmentId: string;
  contentType: string;
  title: string | null;
  body: string | null;
  angle: string | null;
  callToAction: string | null;
  status: string;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContentDraftPrisma {
  $transaction<T>(fn: (tx: ContentDraftPrisma) => Promise<T>): Promise<T>;
  contentDraft: {
    findUnique(args: { where: { id: string } }): Promise<ContentDraftRecord | null>;
    findFirst(args: unknown): Promise<ContentDraftRecord | null>;
    findMany(args: unknown): Promise<ContentDraftRecord[]>;
    update(args: unknown): Promise<ContentDraftRecord>;
  };
  offerEnrichment: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string; status: string } | null>;
  };
  approvalAuditEvent: {
    create(args: unknown): Promise<unknown>;
  };
}

const CONTENT_DRAFT_SELECT = {
  id: true,
  sourceOfferEnrichmentId: true,
  contentType: true,
  title: true,
  body: true,
  angle: true,
  callToAction: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const APPROVABLE_STATUSES = [
  CONTENT_DRAFT_STATUS_DRAFT,
  CONTENT_DRAFT_STATUS_PENDING_APPROVAL,
];

@Injectable()
export class ContentDraftService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gets a single content draft by ID.
   */
  async getDraft(id: string) {
    const db = this.prisma as unknown as ContentDraftPrisma;
    const draft = await db.contentDraft.findUnique({
      where: { id },
    });

    if (!draft) {
      throw new NotFoundException(`ContentDraft ${id} was not found`);
    }

    return draft;
  }

  /**
   * Lists content drafts with optional filters.
   */
  async listDrafts(query: ListContentDraftsQuery = {}) {
    const db = this.prisma as unknown as ContentDraftPrisma;
    const take = this.normalizeLimit(query.limit);
    const skip = this.normalizeOffset(query.offset);

    return db.contentDraft.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.contentType ? { contentType: query.contentType } : {}),
        ...(query.sourceOfferEnrichmentId
          ? { sourceOfferEnrichmentId: query.sourceOfferEnrichmentId }
          : {}),
      },
      select: CONTENT_DRAFT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  /**
   * Updates editable content draft fields.
   */
  async updateDraft(id: string, input: ContentDraftUpdateInput) {
    const db = this.prisma as unknown as ContentDraftPrisma;
    const draft = await db.contentDraft.findUnique({ where: { id } });

    if (!draft) {
      throw new NotFoundException(`ContentDraft ${id} was not found`);
    }

    const data: Record<string, unknown> = {};

    if (input.title !== undefined) {
      data.title = input.title?.trim() || null;
    }
    if (input.body !== undefined) {
      data.body = input.body ?? null;
    }
    if (input.angle !== undefined) {
      data.angle = input.angle?.trim() || null;
    }
    if (input.callToAction !== undefined) {
      data.callToAction = input.callToAction?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return this.getDraft(id);
    }

    await db.contentDraft.update({
      where: { id },
      data,
    });

    return this.getDraft(id);
  }

  /**
   * Approves a content draft. This only changes the status to APPROVED.
   * It does NOT publish or schedule - those are separate phases.
   */
  async approveDraft(id: string, options: ContentDraftApprovalInput = {}) {
    const db = this.prisma as unknown as ContentDraftPrisma;
    const draft = await db.contentDraft.findUnique({ where: { id } });

    if (!draft) {
      throw new NotFoundException(`ContentDraft ${id} was not found`);
    }

    const idempotencyKey = options.idempotencyKey?.trim() || null;

    // Idempotent retry: if already approved with same idempotency key, return as-is
    if (
      idempotencyKey &&
      draft.status === CONTENT_DRAFT_STATUS_APPROVED &&
      draft.idempotencyKey === idempotencyKey
    ) {
      return this.getDraft(id);
    }

    if (!APPROVABLE_STATUSES.includes(draft.status)) {
      throw new ConflictException(
        `Cannot approve content draft with status ${draft.status}; expected DRAFT or PENDING_APPROVAL`,
      );
    }

    const updated = await db.contentDraft.update({
      where: { id },
      data: {
        status: CONTENT_DRAFT_STATUS_APPROVED,
      },
    });

    return updated;
  }

  /**
   * Rejects a content draft. This changes the status to REJECTED.
   */
  async rejectDraft(id: string, options: ContentDraftApprovalInput = {}) {
    const db = this.prisma as unknown as ContentDraftPrisma;
    const draft = await db.contentDraft.findUnique({ where: { id } });

    if (!draft) {
      throw new NotFoundException(`ContentDraft ${id} was not found`);
    }

    if (!APPROVABLE_STATUSES.includes(draft.status)) {
      throw new ConflictException(
        `Cannot reject content draft with status ${draft.status}; expected DRAFT or PENDING_APPROVAL`,
      );
    }

    await db.contentDraft.update({
      where: { id },
      data: {
        status: CONTENT_DRAFT_STATUS_REJECTED,
      },
    });

    return this.getDraft(id);
  }

  private normalizeLimit(limit?: number): number {
    if (!limit || limit < 1) return 25;
    return Math.min(100, limit);
  }

  private normalizeOffset(offset?: number): number {
    if (!offset || offset < 0) return 0;
    return Math.min(10_000, offset);
  }
}
