import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PublisherService } from '../../agents/publisher/publisher.service';
import {
  recordApprovalAuditEvent,
  SERVER_DERIVED_APPROVAL_ACTOR_ID,
} from '../../infrastructure/approval/approval-audit';
import { AdminApiKeyGuard } from './admin-api-key.guard';

@Controller('admin/approvals')
@UseGuards(AdminApiKeyGuard)
export class ApprovalController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly publisher?: PublisherService,
  ) {}

  /**
   * List content pages pending approval
   * GET /admin/approvals?status=PENDING_APPROVAL&type=BEST_LIST
   */
  @Get()
  async listPending(
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    const where: Prisma.ContentPageWhereInput = {};

    if (status) {
      where.status = status as ContentStatus;
    } else {
      // Default: show all that need attention
      where.status = {
        in: [
          ContentStatus.PENDING_APPROVAL,
          ContentStatus.QUALITY_CHECK,
          ContentStatus.REVISION_REQUESTED,
        ],
      };
    }

    if (type) {
      where.type = type as any;
    }

    const pages = await this.prisma.contentPage.findMany({
      where,
      include: {
        translations: true,
        category: true,
        publishedPosts: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = pages.map((page) => {
      const arT = page.translations.find((t) => t.locale === 'ar');
      const enT = page.translations.find((t) => t.locale === 'en');
      return {
        id: page.id,
        type: page.type,
        slug: page.slug,
        status: page.status,
        titleAr: arT?.title ?? '',
        titleEn: enT?.title ?? '',
        excerptAr: arT?.excerpt ?? '',
        excerptEn: enT?.excerpt ?? '',
        category: page.category?.name ?? null,
        seoScore: page.seoScore,
        seoScoreAr: page.seoScoreAr,
        seoScoreEn: page.seoScoreEn,
        qualityScore: page.qualityScore,
        revisionNotes: page.revisionNotes,
        rejectionReason: page.rejectionReason,
        scheduledAt: page.scheduledAt,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
      };
    });

    return {
      total: enriched.length,
      items: enriched,
      counts: {
        pendingApproval: pages.filter((p) => p.status === ContentStatus.PENDING_APPROVAL).length,
        qualityCheck: pages.filter((p) => p.status === ContentStatus.QUALITY_CHECK).length,
        revisionRequested: pages.filter((p) => p.status === ContentStatus.REVISION_REQUESTED).length,
      },
    };
  }

  /**
   * Publish scheduled content (called by cron or manually)
   * POST /admin/approvals/publish-scheduled
   *
   * NOTE: This route MUST be declared before GET/POST /:id to avoid NestJS
   * treating "publish-scheduled" as a dynamic :id segment.
   */
  @Post('publish-scheduled')
  @HttpCode(200)
  async publishScheduled() {
    const now = new Date();
    const scheduled = await this.prisma.contentPage.findMany({
      where: {
        status: ContentStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
    });

    const results: Array<{ id: string; slug: string }> = [];
    for (const page of scheduled) {
      const claimed = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.contentPage.updateMany({
          where: {
            id: page.id,
            status: ContentStatus.SCHEDULED,
            scheduledAt: { lte: now },
          },
          data: {
            status: ContentStatus.PUBLISHED,
            isPublished: true,
            publishedAt: now,
          },
        });

        if (claim.count !== 1) {
          return false;
        }

        await tx.publishedPost.create({
          data: {
            contentPageId: page.id,
            channel: 'website',
            metadata: { publishedVia: 'scheduled' },
          },
        });

        await recordApprovalAuditEvent(tx, {
          action: 'PUBLISHED',
          entityType: 'CONTENT_PAGE',
          entityId: page.id,
          metadata: {
            publishedAt: now.toISOString(),
            publishedVia: 'scheduled',
          },
        });

        return true;
      });

      if (claimed) {
        results.push({ id: page.id, slug: page.slug });
      }
    }

    return { published: results.length, items: results };
  }

  /**
   * Get single content page detail for review
   * GET /admin/approvals/:id
   */
  @Get(':id')
  async getDetail(@Param('id') id: string) {
    const page = await this.prisma.contentPage.findUniqueOrThrow({
      where: { id },
      include: {
        translations: true,
        category: true,
        publishedPosts: true,
      },
    });

    const arT = page.translations.find((t) => t.locale === 'ar');
    const enT = page.translations.find((t) => t.locale === 'en');

    return {
      id: page.id,
      type: page.type,
      slug: page.slug,
      status: page.status,
      titleAr: arT?.title ?? '',
      titleEn: enT?.title ?? '',
      contentAr: arT?.content ?? '',
      contentEn: enT?.content ?? '',
      metaTitleAr: arT?.metaTitle ?? '',
      metaTitleEn: enT?.metaTitle ?? '',
      metaDescAr: arT?.metaDescription ?? '',
      metaDescEn: enT?.metaDescription ?? '',
      excerptAr: arT?.excerpt ?? '',
      excerptEn: enT?.excerpt ?? '',
      category: page.category,
      seoScore: page.seoScore,
      seoScoreAr: page.seoScoreAr,
      seoScoreEn: page.seoScoreEn,
      qualityScore: page.qualityScore,
      revisionNotes: page.revisionNotes,
      rejectionReason: page.rejectionReason,
      scheduledAt: page.scheduledAt,
      approvedAt: page.approvedAt,
      approvedBy: page.approvedBy,
      isPublished: page.isPublished,
      publishedAt: page.publishedAt,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  }

  /**
   * Approve content → publish immediately
   * POST /admin/approvals/:id/approve
   */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Body() _body: { approvedBy?: string } = {},
  ) {
    const page = await this.prisma.contentPage.findUniqueOrThrow({ where: { id } });

    if (page.status === ContentStatus.PUBLISHED) {
      return {
        success: true,
        action: 'approved',
        status: 'PUBLISHED',
        publishedAt: page.publishedAt,
        idempotent: true,
      };
    }

    if (page.status !== ContentStatus.PENDING_APPROVAL && page.status !== ContentStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot approve: status is ${page.status}, expected PENDING_APPROVAL or APPROVED`,
      );
    }

    const approvedAt = new Date();

    if (this.publisher) {
      if (page.status === ContentStatus.PENDING_APPROVAL) {
        const claimed = await this.prisma.$transaction(async (tx) => {
          const claim = await tx.contentPage.updateMany({
            where: { id, status: ContentStatus.PENDING_APPROVAL },
            data: {
              status: ContentStatus.APPROVED,
              approvedAt,
              approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
            },
          });

          if (claim.count !== 1) {
            return false;
          }

          await recordApprovalAuditEvent(tx, {
            action: 'APPROVED',
            entityType: 'CONTENT_PAGE',
            entityId: id,
            metadata: {
              seoScore: page.seoScore,
              qualityScore: page.qualityScore,
              approvedAt: approvedAt.toISOString(),
            },
          });

          return true;
        });

        if (!claimed) {
          const current = await this.prisma.contentPage.findUniqueOrThrow({ where: { id } });
          if (current.status === ContentStatus.PUBLISHED) {
            return {
              success: true,
              action: 'approved',
              status: 'PUBLISHED',
              publishedAt: current.publishedAt,
              idempotent: true,
            };
          }

          throw new BadRequestException(`Cannot approve: status is ${current.status}`);
        }
      }

      const result = await this.publisher.approveAndPublish(id);
      if (!result.published) {
        throw new BadRequestException({
          success: false,
          stage: 'publish',
          error: result.reason ?? 'Content publish failed',
        });
      }

      const publishedAt = new Date();
      return { success: true, action: 'approved', status: 'PUBLISHED', publishedAt, idempotent: result.idempotent };
    }

    const now = approvedAt;
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.contentPage.updateMany({
        where: { id, status: ContentStatus.PENDING_APPROVAL },
        data: {
          status: ContentStatus.PUBLISHED,
          approvedAt: now,
          approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
          isPublished: true,
          publishedAt: now,
        },
      });

      if (claim.count !== 1) {
        throw new BadRequestException('Content approval is already being processed');
      }

      await tx.publishedPost.create({
        data: {
          contentPageId: id,
          channel: 'website',
          metadata: {
            seoScore: page.seoScore,
            qualityScore: page.qualityScore,
            approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
          },
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'APPROVED',
        entityType: 'CONTENT_PAGE',
        entityId: id,
        metadata: {
          seoScore: page.seoScore,
          qualityScore: page.qualityScore,
          publishedAt: now.toISOString(),
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'PUBLISHED',
        entityType: 'CONTENT_PAGE',
        entityId: id,
        metadata: {
          seoScore: page.seoScore,
          qualityScore: page.qualityScore,
          publishedAt: now.toISOString(),
          publishedVia: 'manual_approval',
        },
      });
    });

    return { success: true, action: 'approved', status: 'PUBLISHED', publishedAt: now };
  }

  /**
   * Schedule content for future publishing
   * POST /admin/approvals/:id/schedule
   */
  @Post(':id/schedule')
  @HttpCode(200)
  async schedule(
    @Param('id') id: string,
    @Body() body: { scheduledAt: string; approvedBy?: string },
  ) {
    const page = await this.prisma.contentPage.findUniqueOrThrow({ where: { id } });

    if (page.status !== ContentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot schedule: status is ${page.status}, expected PENDING_APPROVAL`,
      );
    }

    if (!body.scheduledAt) {
      throw new BadRequestException('scheduledAt is required');
    }

    const scheduledAt = new Date(body.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is not a valid date');
    }
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contentPage.update({
        where: { id },
        data: {
          status: ContentStatus.SCHEDULED,
          scheduledAt,
          approvedAt: new Date(),
          approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'SCHEDULED',
        entityType: 'CONTENT_PAGE',
        entityId: id,
        metadata: { scheduledAt: scheduledAt.toISOString() },
      });
    });

    return { success: true, action: 'scheduled', status: 'SCHEDULED', scheduledAt };
  }

  /**
   * Request revision — send back to ContentWriter
   * POST /admin/approvals/:id/revise
   */
  @Post(':id/revise')
  @HttpCode(200)
  async revise(
    @Param('id') id: string,
    @Body() body: { notes: string },
  ) {
    const page = await this.prisma.contentPage.findUniqueOrThrow({ where: { id } });

    const revisionAllowed: ContentStatus[] = [
      ContentStatus.PENDING_APPROVAL,
      ContentStatus.QUALITY_CHECK,
    ];
    if (!revisionAllowed.includes(page.status)) {
      throw new BadRequestException(`Cannot request revision: status is ${page.status}`);
    }

    if (!body.notes || body.notes.trim().length === 0) {
      throw new BadRequestException('Revision notes are required');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contentPage.update({
        where: { id },
        data: {
          status: ContentStatus.REVISION_REQUESTED,
          revisionNotes: body.notes,
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'REVISION_REQUESTED',
        entityType: 'CONTENT_PAGE',
        entityId: id,
        reason: body.notes,
        metadata: { previousStatus: page.status },
      });
    });

    return { success: true, action: 'revision_requested', status: 'REVISION_REQUESTED' };
  }

  /**
   * Reject content
   * POST /admin/approvals/:id/reject
   */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const page = await this.prisma.contentPage.findUniqueOrThrow({ where: { id } });

    if (
      page.status === ContentStatus.PUBLISHED ||
      page.status === ContentStatus.REJECTED
    ) {
      throw new BadRequestException(`Cannot reject: status is ${page.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contentPage.update({
        where: { id },
        data: {
          status: ContentStatus.REJECTED,
          rejectionReason: body.reason ?? null,
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'REJECTED',
        entityType: 'CONTENT_PAGE',
        entityId: id,
        reason: body.reason ?? null,
        metadata: { previousStatus: page.status },
      });
    });

    return { success: true, action: 'rejected', status: 'REJECTED' };
  }

  /**
   * Postpone — acknowledge without changing status
   * PATCH /admin/approvals/:id/postpone
   */
  @Patch(':id/postpone')
  async postpone(@Param('id') id: string) {
    const page = await this.prisma.contentPage.findUniqueOrThrow({ where: { id } });
    return { success: true, action: 'postponed', currentStatus: page.status };
  }
}
