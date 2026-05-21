import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  CreatePublicOfferDraftBodyDto,
  UpdatePublicOfferDraftBodyDto,
  ListPublicOfferDraftsQueryDto,
  PUBLIC_OFFER_DRAFT_STATUS_APPROVED,
  PUBLIC_OFFER_DRAFT_STATUS_DRAFT,
  PUBLIC_OFFER_DRAFT_STATUS_PENDING_APPROVAL,
  PUBLIC_OFFER_DRAFT_STATUS_REJECTED,
} from './dto/public-offer-draft.dto';

@Injectable()
export class PublicOfferDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromContentDraft(
    contentDraftId: string,
    body: CreatePublicOfferDraftBodyDto,
    idempotencyKey?: string,
  ): Promise<unknown> {
    // Find content draft — must be APPROVED
    const contentDraft = await this.prisma.contentDraft.findUnique({
      where: { id: contentDraftId },
      include: { sourceOfferEnrichment: true },
    });

    if (!contentDraft) {
      throw new NotFoundException(`ContentDraft ${contentDraftId} not found`);
    }

    if (contentDraft.status !== 'APPROVED') {
      throw new BadRequestException(
        `Cannot create public offer draft from content draft with status ${contentDraft.status}. Content draft must be APPROVED.`,
      );
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await this.prisma.publicOfferDraft.findFirst({
        where: { sourceContentDraftId: contentDraftId },
      });
      if (existing) {
        return existing;
      }
    }

    // Check if already exists
    const existingDraft = await this.prisma.publicOfferDraft.findUnique({
      where: { sourceContentDraftId: contentDraftId },
    });

    if (existingDraft) {
      throw new ConflictException(
        `Public offer draft already exists for content draft ${contentDraftId}`,
      );
    }

    // Generate slug from title if not provided
    let slug = body.slug;
    if (!slug && body.title) {
      slug = this.generateSlug(body.title);
    } else if (!slug) {
      slug = this.generateSlug(contentDraft.title || contentDraftId);
    }

    // Ensure slug uniqueness
    slug = await this.ensureUniqueSlug(slug);

    const publicOfferDraft = await this.prisma.publicOfferDraft.create({
      data: {
        sourceContentDraftId: contentDraftId,
        slug,
        title: body.title ?? contentDraft.title ?? null,
        summary: body.summary ?? null,
        heroCopy: body.heroCopy ?? null,
        benefits: body.benefits ? JSON.parse(body.benefits) : null,
        faq: body.faq ? JSON.parse(body.faq) : null,
        seoTitle: body.seoTitle ?? null,
        seoDescription: body.seoDescription ?? null,
        status: PUBLIC_OFFER_DRAFT_STATUS_DRAFT,
      },
      include: {
        sourceContentDraft: {
          select: {
            id: true,
            title: true,
            contentType: true,
            body: true,
            angle: true,
            status: true,
          },
        },
      },
    });

    return publicOfferDraft;
  }

  async listDrafts(query: ListPublicOfferDraftsQueryDto): Promise<unknown> {
    const { status, limit = 50, offset = 0 } = query;

    const where =
      status && status !== 'ALL'
        ? { status: status as typeof PUBLIC_OFFER_DRAFT_STATUS_DRAFT }
        : {};

    const [drafts, total] = await Promise.all([
      this.prisma.publicOfferDraft.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          sourceContentDraft: {
            select: {
              id: true,
              title: true,
              contentType: true,
              body: true,
              angle: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.publicOfferDraft.count({ where }),
    ]);

    return { items: drafts, total, limit, offset };
  }

  async getDraft(id: string): Promise<unknown> {
    const draft = await this.prisma.publicOfferDraft.findUnique({
      where: { id },
      include: {
        sourceContentDraft: {
          select: {
            id: true,
            title: true,
            contentType: true,
            body: true,
            angle: true,
            status: true,
          },
        },
      },
    });

    if (!draft) {
      throw new NotFoundException(`PublicOfferDraft ${id} not found`);
    }

    return draft;
  }

  async updateDraft(id: string, body: UpdatePublicOfferDraftBodyDto): Promise<unknown> {
    const existing = await this.prisma.publicOfferDraft.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`PublicOfferDraft ${id} not found`);
    }

    let slug = body.slug ?? existing.slug;
    if (body.slug && body.slug !== existing.slug) {
      slug = await this.ensureUniqueSlug(body.slug);
    }

    const updated = await this.prisma.publicOfferDraft.update({
      where: { id },
      data: {
        slug,
        title: body.title ?? existing.title,
        summary: body.summary ?? existing.summary,
        heroCopy: body.heroCopy ?? existing.heroCopy,
        benefits: body.benefits ? JSON.parse(body.benefits) : existing.benefits,
        faq: body.faq ? JSON.parse(body.faq) : existing.faq,
        seoTitle: body.seoTitle ?? existing.seoTitle,
        seoDescription: body.seoDescription ?? existing.seoDescription,
      },
      include: {
        sourceContentDraft: {
          select: {
            id: true,
            title: true,
            contentType: true,
            body: true,
            angle: true,
            status: true,
          },
        },
      },
    });

    return updated;
  }

  async approveDraft(id: string): Promise<unknown> {
    const existing = await this.prisma.publicOfferDraft.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`PublicOfferDraft ${id} not found`);
    }

    // APPROVE only changes status — NO publishing
    const updated = await this.prisma.publicOfferDraft.update({
      where: { id },
      data: { status: PUBLIC_OFFER_DRAFT_STATUS_APPROVED },
      include: {
        sourceContentDraft: {
          select: {
            id: true,
            title: true,
            contentType: true,
            body: true,
            angle: true,
            status: true,
          },
        },
      },
    });

    return updated;
  }

  async rejectDraft(id: string): Promise<unknown> {
    const existing = await this.prisma.publicOfferDraft.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`PublicOfferDraft ${id} not found`);
    }

    const updated = await this.prisma.publicOfferDraft.update({
      where: { id },
      data: { status: PUBLIC_OFFER_DRAFT_STATUS_REJECTED },
      include: {
        sourceContentDraft: {
          select: {
            id: true,
            title: true,
            contentType: true,
            body: true,
            angle: true,
            status: true,
          },
        },
      },
    });

    return updated;
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 80);
  }

  private async ensureUniqueSlug(slug: string): Promise<string> {
    let candidate = slug;
    let attempt = 0;

    while (true) {
      const existing = await this.prisma.publicOfferDraft.findUnique({
        where: { slug: candidate },
      });
      if (!existing) {
        return candidate;
      }
      attempt++;
      candidate = `${slug}-${attempt}`;
    }
  }
}