import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const SOCIAL_POST_STATUS_DRAFT = 'DRAFT';
const SOCIAL_POST_STATUS_APPROVED = 'APPROVED';
const SOCIAL_POST_STATUS_PUBLISHED = 'PUBLISHED';

@Injectable()
export class SocialDraftService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/social-drafts */
  async listDrafts(params: {
    platform?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const { platform, status, limit = 50, offset = 0 } = params;
    const where: Record<string, unknown> = {};
    if (platform) where.platform = platform;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.socialPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          contentPage: { select: { id: true, title: true } },
          product: { select: { id: true, name: true } },
        },
      }),
      this.prisma.socialPost.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /** GET /admin/social-drafts/:id */
  async getDraft(id: string) {
    const item = await this.prisma.socialPost.findUnique({
      where: { id },
      include: {
        contentPage: { select: { id: true, title: true } },
        product: { select: { id: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException(`SocialPost ${id} not found`);
    return item;
  }

  /** PATCH /admin/social-drafts/:id */
  async updateDraft(id: string, data: {
    content?: unknown;
    hashtags?: string[];
    scheduledAt?: string | null;
  }) {
    const existing = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`SocialPost ${id} not found`);

    const updateData: Record<string, unknown> = {};
    if (data.content !== undefined) updateData.content = data.content;
    if (data.hashtags !== undefined) updateData.hashtags = data.hashtags;
    if (data.scheduledAt !== undefined) {
      updateData.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
    }

    return this.prisma.socialPost.update({ where: { id }, data: updateData });
  }

  /** POST /admin/social-drafts/:id/approve */
  async approveDraft(id: string) {
    const existing = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`SocialPost ${id} not found`);
    if (existing.status !== SOCIAL_POST_STATUS_DRAFT) {
      throw new BadRequestException(`Can only approve DRAFT posts, got ${existing.status}`);
    }
    return this.prisma.socialPost.update({ where: { id }, data: { status: SOCIAL_POST_STATUS_APPROVED } });
  }

  /** POST /admin/social-drafts/:id/schedule */
  async scheduleDraft(id: string, scheduledAt: string) {
    const existing = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`SocialPost ${id} not found`);
    if (existing.status === SOCIAL_POST_STATUS_PUBLISHED) {
      throw new BadRequestException('Already published posts cannot be scheduled');
    }
    return this.prisma.socialPost.update({
      where: { id },
      data: {
        scheduledAt: new Date(scheduledAt),
        status: SOCIAL_POST_STATUS_APPROVED, // scheduling implicitly approves
      },
    });
  }

  /** POST /admin/social-drafts/:id/publish — publish immediately */
  async publishDraft(id: string) {
    const existing = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`SocialPost ${id} not found`);
    if (existing.status === SOCIAL_POST_STATUS_PUBLISHED) {
      return { alreadyPublished: true, item: existing };
    }
    const updated = await this.prisma.socialPost.update({
      where: { id },
      data: { status: SOCIAL_POST_STATUS_PUBLISHED, publishedAt: new Date() },
    });
    return { alreadyPublished: false, item: updated };
  }
}
