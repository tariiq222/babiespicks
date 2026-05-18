import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SocialPostStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TwitterPublisherService, TweetContent } from '../../infrastructure/publishing/twitter-publisher.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';

@Controller('admin/approvals/social')
@UseGuards(AdminApiKeyGuard)
export class SocialApprovalController {
  private readonly logger = new Logger(SocialApprovalController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twitter: TwitterPublisherService,
  ) {}

  /**
   * List social posts by status.
   * GET /admin/approvals/social?status=PENDING_APPROVAL
   */
  @Get()
  async listPending(@Query('status') status?: string) {
    const filterStatus = (status as SocialPostStatus | undefined) ?? SocialPostStatus.PENDING_APPROVAL;

    const posts = await this.prisma.socialPost.findMany({
      where: { status: filterStatus },
      orderBy: { createdAt: 'desc' },
    });

    const counts = await this.prisma.socialPost.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const countMap: Record<string, number> = {};
    for (const c of counts) {
      countMap[c.status] = c._count.id;
    }

    const items = posts.map((p) => ({
      id: p.id,
      status: p.status,
      productId: p.productId,
      contentPageId: p.contentPageId,
      platform: p.platform,
      format: p.format,
      content: p.content,
      hashtags: p.hashtags,
      complianceScore: p.complianceScore,
      complianceNotes: p.complianceNotes,
      scheduledAt: p.scheduledAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return {
      total: items.length,
      items,
      counts: countMap,
    };
  }

  /**
   * Publish all APPROVED social posts via Twitter.
   * POST /admin/approvals/social/publish-approved
   *
   * NOTE: Must be declared before /:id routes to avoid NestJS treating
   * "publish-approved" as a dynamic :id segment.
   */
  @Post('publish-approved')
  @HttpCode(200)
  async publishApproved() {
    const approved = await this.prisma.socialPost.findMany({
      where: { status: SocialPostStatus.APPROVED },
    });

    const results: Array<{ id: string; success: boolean; tweetId?: string; error?: string }> = [];

    for (const post of approved) {
      const tweets = (post.content ?? []) as unknown as TweetContent[];

      if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
        this.logger.warn(`SocialPost ${post.id} has no tweets — skipping`);
        results.push({ id: post.id, success: false, error: 'No tweets to publish' });
        continue;
      }

      const result = await this.twitter.postThread(tweets);

      if (result.success) {
        await this.prisma.socialPost.update({
          where: { id: post.id },
          data: {
            status: SocialPostStatus.PUBLISHED,
            publishedAt: new Date(),
            externalId: result.tweetIds?.[0] ?? null,
            metadata: { tweetIds: result.tweetIds } as any,
          },
        });
      } else {
        await this.prisma.socialPost.update({
          where: { id: post.id },
          data: {
            status: SocialPostStatus.REJECTED,
            metadata: { error: result.error } as any,
          },
        });
      }

      results.push({
        id: post.id,
        success: result.success,
        tweetId: result.tweetIds?.[0],
        error: result.error,
      });
    }

    const published = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(`publish-approved: ${published} published, ${failed} failed`);
    return { published, failed, results };
  }

  /**
   * Get single social post detail.
   * GET /admin/approvals/social/:id
   */
  @Get(':id')
  async getDetail(@Param('id') id: string) {
    const post = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });
    return post;
  }

  /**
   * Approve social post.
   * POST /admin/approvals/social/:id/approve
   */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Body() body: { approvedBy?: string },
  ) {
    const post = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });

    if (post.status !== SocialPostStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve: status is ${post.status}, expected PENDING_APPROVAL`,
      );
    }

    await this.prisma.socialPost.update({
      where: { id },
      data: {
        status: SocialPostStatus.APPROVED,
        metadata: { approvedAt: new Date().toISOString(), approvedBy: body.approvedBy ?? 'admin' } as any,
      },
    });

    return { success: true, action: 'approved', status: 'APPROVED' };
  }

  /**
   * Schedule social post for future publishing.
   * POST /admin/approvals/social/:id/schedule
   */
  @Post(':id/schedule')
  @HttpCode(200)
  async schedule(
    @Param('id') id: string,
    @Body() body: { scheduledAt: string; approvedBy?: string },
  ) {
    const post = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });

    if (post.status !== SocialPostStatus.PENDING_APPROVAL && post.status !== SocialPostStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot schedule: status is ${post.status}`,
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

    await this.prisma.socialPost.update({
      where: { id },
      data: {
        status: SocialPostStatus.SCHEDULED,
        scheduledAt,
        metadata: { approvedAt: new Date().toISOString(), approvedBy: body.approvedBy ?? 'admin' } as any,
      },
    });

    return { success: true, action: 'scheduled', status: 'SCHEDULED', scheduledAt };
  }

  /**
   * Reject social post.
   * POST /admin/approvals/social/:id/reject
   */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const post = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });

    if (
      post.status === SocialPostStatus.PUBLISHED ||
      post.status === SocialPostStatus.REJECTED
    ) {
      throw new BadRequestException(`Cannot reject: status is ${post.status}`);
    }

    await this.prisma.socialPost.update({
      where: { id },
      data: {
        status: SocialPostStatus.REJECTED,
        complianceNotes: body.reason ?? null,
      },
    });

    return { success: true, action: 'rejected', status: 'REJECTED' };
  }
}
