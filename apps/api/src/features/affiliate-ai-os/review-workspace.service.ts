import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { ReviewItemStatus } from '@prisma/client';

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'] as const;
export type ReviewStatusValue = (typeof REVIEW_STATUSES)[number];

export interface ContentReviewItem {
  id: string;
  contentDraftId: string;
  reviewStatus: string;
  reviewNotes: string | null;
  revisionRequested: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  contentDraft?: {
    id: string;
    contentType: string;
    title: string | null;
    body: string | null;
    angle: string | null;
    status: string;
  };
}

export interface ListReviewItemsQuery {
  status?: ReviewStatusValue;
  contentType?: string;
  limit?: number;
  offset?: number;
}

const REVIEW_STATUS_APPROVED: ReviewItemStatus = 'APPROVED';
const REVIEW_STATUS_REJECTED: ReviewItemStatus = 'REJECTED';
const REVIEW_STATUS_REVISION_REQUESTED: ReviewItemStatus = 'REVISION_REQUESTED';

const CONTENT_DRAFT_STATUS_APPROVED = 'APPROVED';
const CONTENT_DRAFT_STATUS_REJECTED = 'REJECTED';
const CONTENT_DRAFT_STATUS_PENDING_APPROVAL = 'PENDING_APPROVAL';

@Injectable()
export class ReviewWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async listReviewItems(query: ListReviewItemsQuery): Promise<{ items: ContentReviewItem[]; total: number }> {
    const where: { reviewStatus?: ReviewItemStatus } = {};
    if (query.status) {
      where.reviewStatus = query.status as ReviewItemStatus;
    }

    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reviewItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.reviewItem.count({ where }),
    ]);

    if (items.length === 0) {
      return { items: [], total };
    }

    const draftIds = items.map((i) => i.contentDraftId);
    const drafts = await this.prisma.contentDraft.findMany({
      where: { id: { in: draftIds } },
      select: { id: true, contentType: true, title: true, body: true, angle: true, status: true },
    });

    const draftMap = new Map(drafts.map((d) => [d.id, d]));

    return {
      items: items.map((item) => ({
        id: item.id,
        contentDraftId: item.contentDraftId,
        reviewStatus: item.reviewStatus,
        reviewNotes: item.reviewNotes,
        revisionRequested: item.revisionRequested,
        reviewedAt: item.reviewedAt?.toISOString() ?? null,
        reviewedBy: item.reviewedBy,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        contentDraft: draftMap.get(item.contentDraftId) ?? undefined,
      })),
      total,
    };
  }

  async getReviewItem(id: string): Promise<ContentReviewItem> {
    const item = await this.prisma.reviewItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`Review item ${id} not found`);
    }

    const draft = await this.prisma.contentDraft.findUnique({
      where: { id: item.contentDraftId },
      select: { id: true, contentType: true, title: true, body: true, angle: true, status: true },
    });

    return {
      id: item.id,
      contentDraftId: item.contentDraftId,
      reviewStatus: item.reviewStatus,
      reviewNotes: item.reviewNotes,
      revisionRequested: item.revisionRequested,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      reviewedBy: item.reviewedBy,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      contentDraft: draft ?? undefined,
    };
  }

  async createReviewItem(contentDraftId: string): Promise<ContentReviewItem> {
    const draft = await this.prisma.contentDraft.findUnique({
      where: { id: contentDraftId },
    });

    if (!draft) {
      throw new NotFoundException(`Content draft ${contentDraftId} not found`);
    }

    const existing = await this.prisma.reviewItem.findFirst({
      where: { contentDraftId },
    });

    if (existing) {
      return this.getReviewItem(existing.id);
    }

    const item = await this.prisma.reviewItem.create({
      data: {
        contentDraftId,
        reviewStatus: 'PENDING',
        revisionRequested: false,
      },
    });

    return {
      id: item.id,
      contentDraftId: item.contentDraftId,
      reviewStatus: item.reviewStatus,
      reviewNotes: item.reviewNotes,
      revisionRequested: item.revisionRequested,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      reviewedBy: item.reviewedBy,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async updateReviewItem(
    id: string,
    input: { reviewNotes?: string; revisionRequested?: boolean },
  ): Promise<ContentReviewItem> {
    const existing = await this.prisma.reviewItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Review item ${id} not found`);
    }

    const data: { reviewNotes?: string; revisionRequested?: boolean } = {};
    if (input.revisionRequested !== undefined) {
      data.revisionRequested = input.revisionRequested;
    }
    if (input.reviewNotes !== undefined) {
      data.reviewNotes = input.reviewNotes;
    }

    const item = await this.prisma.reviewItem.update({
      where: { id },
      data,
    });

    return {
      id: item.id,
      contentDraftId: item.contentDraftId,
      reviewStatus: item.reviewStatus,
      reviewNotes: item.reviewNotes,
      revisionRequested: item.revisionRequested,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      reviewedBy: item.reviewedBy,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async approveReviewItem(id: string, reason?: string): Promise<ContentReviewItem> {
    const existing = await this.prisma.reviewItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Review item ${id} not found`);
    }

    if (existing.reviewStatus === REVIEW_STATUS_APPROVED) {
      throw new BadRequestException('Review item already approved');
    }

    const item = await this.prisma.reviewItem.update({
      where: { id },
      data: {
        reviewStatus: REVIEW_STATUS_APPROVED,
        reviewedAt: new Date(),
        reviewedBy: 'admin',
        reviewNotes: reason ?? null,
        revisionRequested: false,
      },
    });

    await this.prisma.contentDraft.update({
      where: { id: existing.contentDraftId },
      data: { status: CONTENT_DRAFT_STATUS_APPROVED },
    });

    return {
      id: item.id,
      contentDraftId: item.contentDraftId,
      reviewStatus: item.reviewStatus,
      reviewNotes: item.reviewNotes,
      revisionRequested: item.revisionRequested,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      reviewedBy: item.reviewedBy,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async rejectReviewItem(id: string, reason?: string): Promise<ContentReviewItem> {
    const existing = await this.prisma.reviewItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Review item ${id} not found`);
    }

    if (existing.reviewStatus === REVIEW_STATUS_REJECTED) {
      throw new BadRequestException('Review item already rejected');
    }

    const item = await this.prisma.reviewItem.update({
      where: { id },
      data: {
        reviewStatus: REVIEW_STATUS_REJECTED,
        reviewedAt: new Date(),
        reviewedBy: 'admin',
        reviewNotes: reason ?? null,
        revisionRequested: false,
      },
    });

    await this.prisma.contentDraft.update({
      where: { id: existing.contentDraftId },
      data: { status: CONTENT_DRAFT_STATUS_REJECTED },
    });

    return {
      id: item.id,
      contentDraftId: item.contentDraftId,
      reviewStatus: item.reviewStatus,
      reviewNotes: item.reviewNotes,
      revisionRequested: item.revisionRequested,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      reviewedBy: item.reviewedBy,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async requestRevision(id: string, notes: string): Promise<ContentReviewItem> {
    const existing = await this.prisma.reviewItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Review item ${id} not found`);
    }

    const item = await this.prisma.reviewItem.update({
      where: { id },
      data: {
        reviewStatus: REVIEW_STATUS_REVISION_REQUESTED,
        reviewedAt: new Date(),
        reviewedBy: 'admin',
        reviewNotes: notes,
        revisionRequested: true,
      },
    });

    await this.prisma.contentDraft.update({
      where: { id: existing.contentDraftId },
      data: { status: CONTENT_DRAFT_STATUS_PENDING_APPROVAL },
    });

    return {
      id: item.id,
      contentDraftId: item.contentDraftId,
      reviewStatus: item.reviewStatus,
      reviewNotes: item.reviewNotes,
      revisionRequested: item.revisionRequested,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      reviewedBy: item.reviewedBy,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}