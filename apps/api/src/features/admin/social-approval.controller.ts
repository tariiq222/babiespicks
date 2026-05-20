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
import { TelegramPublisherService } from '../../infrastructure/publishing/telegram-publisher.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';

interface PublishResult {
  id: string;
  platform: string;
  success: boolean;
  externalId?: string;
  error?: string;
}

@Controller('admin/approvals/social')
@UseGuards(AdminApiKeyGuard)
export class SocialApprovalController {
  private readonly logger = new Logger(SocialApprovalController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twitter: TwitterPublisherService,
    private readonly telegram: TelegramPublisherService,
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
   * Publish a single APPROVED social post by ID.
   * POST /admin/approvals/social/:id/publish
   *
   * Validates the post exists and is APPROVED before publishing.
   * Publishes only the targeted post — never affects other posts.
   */
  @Post(':id/publish')
  @HttpCode(200)
  async publishOne(@Param('id') id: string): Promise<PublishResult> {
    const post = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });

    if (post.status !== SocialPostStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot publish: status is ${post.status}, expected APPROVED`,
      );
    }

    const platform = post.platform ?? 'twitter';

    if (platform === 'twitter') {
      const tweets = (post.content ?? []) as unknown as TweetContent[];

      if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
        throw new BadRequestException('No tweets to publish');
      }

      const result = await this.twitter.postThread(tweets);

      if (result.success) {
        await this.prisma.socialPost.update({
          where: { id },
          data: {
            status: SocialPostStatus.PUBLISHED,
            publishedAt: new Date(),
            externalId: result.tweetIds?.[0] ?? null,
            metadata: { tweetIds: result.tweetIds } as any,
          },
        });
      } else {
        await this.prisma.socialPost.update({
          where: { id },
          data: {
            status: SocialPostStatus.REJECTED,
            metadata: { error: result.error } as any,
          },
        });
      }

      return {
        id: post.id,
        platform: 'twitter',
        success: result.success,
        externalId: result.tweetIds?.[0],
        error: result.error,
      };
    }

    if (platform === 'telegram') {
      const content = post.content as { text?: string } | null;

      if (!content || !content.text) {
        throw new BadRequestException('No text content to publish to Telegram');
      }

      const result = await this.telegram.postMessage(content.text);

      if (result.success) {
        await this.prisma.socialPost.update({
          where: { id },
          data: {
            status: SocialPostStatus.PUBLISHED,
            publishedAt: new Date(),
            externalId: result.messageId?.toString() ?? null,
          },
        });
      } else {
        await this.prisma.socialPost.update({
          where: { id },
          data: {
            status: SocialPostStatus.REJECTED,
            metadata: { error: result.error } as any,
          },
        });
      }

      return {
        id: post.id,
        platform: 'telegram',
        success: result.success,
        externalId: result.messageId?.toString(),
        error: result.error,
      };
    }

    throw new BadRequestException(`Unsupported platform: ${platform}`);
  }

  /**
   * Publish all APPROVED social posts via the appropriate platform publisher.
   * POST /admin/approvals/social/publish-approved
   *
   * NOTE: Must be declared before /:id routes to avoid NestJS treating
   * "publish-approved" as a dynamic :id segment.
   */
  @Post('publish-approved')
  @HttpCode(200)
  async publishApproved(): Promise<{
    published: number;
    failed: number;
    platformBreakdown: { twitter: number; telegram: number };
    results: PublishResult[];
  }> {
    const approved = await this.prisma.socialPost.findMany({
      where: { status: SocialPostStatus.APPROVED },
    });

    const results: PublishResult[] = [];
    let twitterPublished = 0;
    let telegramPublished = 0;

    for (const post of approved) {
      const platform = post.platform ?? 'twitter';

      if (platform === 'twitter') {
        const tweets = (post.content ?? []) as unknown as TweetContent[];

        if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
          this.logger.warn(`SocialPost ${post.id} has no tweets — skipping`);
          results.push({ id: post.id, platform: 'twitter', success: false, error: 'No tweets to publish' });
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
          twitterPublished++;
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
          platform: 'twitter',
          success: result.success,
          externalId: result.tweetIds?.[0],
          error: result.error,
        });
      } else if (platform === 'telegram') {
        const content = post.content as { text?: string } | null;

        if (!content || !content.text) {
          this.logger.warn(`SocialPost ${post.id} has no text content for Telegram — skipping`);
          results.push({ id: post.id, platform: 'telegram', success: false, error: 'No text content to publish' });
          continue;
        }

        const result = await this.telegram.postMessage(content.text);

        if (result.success) {
          await this.prisma.socialPost.update({
            where: { id: post.id },
            data: {
              status: SocialPostStatus.PUBLISHED,
              publishedAt: new Date(),
              externalId: result.messageId?.toString() ?? null,
            },
          });
          telegramPublished++;
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
          platform: 'telegram',
          success: result.success,
          externalId: result.messageId?.toString(),
          error: result.error,
        });
      } else {
        this.logger.warn(`SocialPost ${post.id} has unsupported platform '${platform}' — skipping`);
        results.push({ id: post.id, platform, success: false, error: `Unsupported platform: ${platform}` });
      }
    }

    const published = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(`publish-approved: ${published} published (twitter=${twitterPublished}, telegram=${telegramPublished}), ${failed} failed`);
    return {
      published,
      failed,
      platformBreakdown: { twitter: twitterPublished, telegram: telegramPublished },
      results,
    };
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
