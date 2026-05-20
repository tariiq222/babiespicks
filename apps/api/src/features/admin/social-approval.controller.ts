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
  GoneException,
  Logger,
} from '@nestjs/common';
import { SocialPostStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TwitterPublisherService } from '../../infrastructure/publishing/twitter-publisher.service';
import { TelegramPublisherService } from '../../infrastructure/publishing/telegram-publisher.service';
import {
  recordApprovalAuditEvent,
  SERVER_DERIVED_APPROVAL_ACTOR_ID,
} from '../../infrastructure/approval/approval-audit';
import { AdminApiKeyGuard } from './admin-api-key.guard';

interface PublishResult {
  id: string;
  platform: string;
  success: boolean;
  externalId?: string;
  error?: string;
}

interface PublishAttemptAudit {
  attemptId: string;
  attemptedAt: Date;
  trigger: 'manual' | 'bulk' | 'scheduled';
}

const RIYADH_TIMEZONE = 'Asia/Riyadh';
const RIYADH_UTC_OFFSET_HOURS = 3;
const SOCIAL_SCHEDULE_POLICY = {
  twitter: { slots: [11, 19], maxPerDay: 2 },
  telegram: { slots: [20], maxPerDay: 1 },
} as const;

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
   * Creates the durable pre-publish audit marker that must exist before any
   * irreversible external social-network side effect is attempted.
   */
  private async recordPublishAttemptAudit(
    post: { id: string; platform: string | null; format?: string | null },
    trigger: PublishAttemptAudit['trigger'],
  ): Promise<PublishAttemptAudit> {
    const attemptedAt = new Date();
    const attemptId = `${post.id}:${trigger}:${attemptedAt.toISOString()}`;

    await this.prisma.$transaction(async (tx) => {
      await recordApprovalAuditEvent(tx, {
        action: 'PUBLISHED',
        entityType: 'SOCIAL_POST',
        entityId: post.id,
        metadata: {
          phase: 'PUBLISH_ATTEMPT',
          result: 'INTENT_RECORDED',
          attemptId,
          trigger,
          platform: post.platform ?? 'twitter',
          format: post.format ?? null,
          attemptedAt: attemptedAt.toISOString(),
        },
      });
    });

    return { attemptId, attemptedAt, trigger };
  }

  /** Records a successful external publish and the resulting local state change atomically. */
  private async recordPublishSuccess(params: {
    postId: string;
    platform: 'twitter' | 'telegram';
    attempt: PublishAttemptAudit;
    externalId: string | null;
    externalIds?: string[];
  }): Promise<void> {
    const publishedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.socialPost.update({
        where: { id: params.postId },
        data: {
          status: SocialPostStatus.PUBLISHED,
          publishedAt,
          externalId: params.externalId,
          metadata: {
            publishAttemptId: params.attempt.attemptId,
            publishTrigger: params.attempt.trigger,
            publishedAt: publishedAt.toISOString(),
            ...(params.externalIds ? { tweetIds: params.externalIds } : {}),
          } as any,
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'PUBLISHED',
        entityType: 'SOCIAL_POST',
        entityId: params.postId,
        metadata: {
          phase: 'PUBLISH_SUCCESS',
          result: 'PUBLISHED',
          attemptId: params.attempt.attemptId,
          trigger: params.attempt.trigger,
          platform: params.platform,
          attemptedAt: params.attempt.attemptedAt.toISOString(),
          publishedAt: publishedAt.toISOString(),
          externalId: params.externalId,
          ...(params.externalIds ? { tweetIds: params.externalIds } : {}),
        },
      });
    });
  }

  /** Records a failed external publish and the resulting rejected state atomically. */
  private async recordPublishFailure(params: {
    postId: string;
    platform: 'twitter' | 'telegram';
    attempt: PublishAttemptAudit;
    error?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.socialPost.update({
        where: { id: params.postId },
        data: {
          status: SocialPostStatus.REJECTED,
          metadata: {
            publishAttemptId: params.attempt.attemptId,
            publishTrigger: params.attempt.trigger,
            error: params.error ?? 'External publish failed',
          } as any,
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'REJECTED',
        entityType: 'SOCIAL_POST',
        entityId: params.postId,
        reason: params.error ?? 'External publish failed',
        metadata: {
          phase: 'PUBLISH_FAILURE',
          result: 'EXTERNAL_FAILURE',
          attemptId: params.attempt.attemptId,
          trigger: params.attempt.trigger,
          platform: params.platform,
          attemptedAt: params.attempt.attemptedAt.toISOString(),
          error: params.error ?? 'External publish failed',
        },
      });
    });
  }

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
    void id;
    throw new GoneException({
      success: false,
      error: 'Immediate social publishing is disabled. Approve the social post to schedule it automatically.',
    });
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
    throw new GoneException({
      success: false,
      error: 'Immediate bulk social publishing is disabled. Approve each social post to schedule it automatically.',
    });
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
   * Human approval gate for social posts. Approval automatically schedules the
   * post into a safe Riyadh-time slot; it never publishes immediately.
   */
  @Post(':id/approve-and-schedule')
  @HttpCode(200)
  async approveAndSchedule(
    @Param('id') id: string,
    @Body() body: { approvedBy?: string },
  ) {
    return this.approve(id, body);
  }

  /** Compatibility alias for approve-and-schedule. */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Body() _body: { approvedBy?: string },
  ) {
    const post = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });

    if (post.status === SocialPostStatus.SCHEDULED) {
      return {
        success: true,
        action: 'scheduled',
        status: 'SCHEDULED',
        scheduledAt: post.scheduledAt,
        idempotent: true,
      };
    }

    if (post.status !== SocialPostStatus.PENDING_APPROVAL && post.status !== SocialPostStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot approve: status is ${post.status}, expected PENDING_APPROVAL or APPROVED`,
      );
    }

    const approvedAt = new Date();
    const scheduleResult = await this.scheduleApprovedPostWithRetry({
      id,
      platform: post.platform ?? 'twitter',
      format: post.format,
      metadata: post.metadata,
      approvedAt,
    });

    if (!scheduleResult.scheduled) {
      const current = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });
      if (current.status === SocialPostStatus.SCHEDULED) {
        return {
          success: true,
          action: 'scheduled',
          status: 'SCHEDULED',
          scheduledAt: current.scheduledAt,
          idempotent: true,
        };
      }
      throw new BadRequestException(`Cannot approve: status is ${current.status}`);
    }

    return { success: true, action: 'scheduled', status: 'SCHEDULED', scheduledAt: scheduleResult.scheduledAt };
  }

  private async scheduleApprovedPostWithRetry(input: {
    id: string;
    platform: string;
    format?: string | null;
    metadata: unknown;
    approvedAt: Date;
  }): Promise<{ scheduled: boolean; scheduledAt?: Date }> {
    let cursor = new Date();

    for (let attempt = 0; attempt < 8; attempt++) {
      const scheduledAt = await this.nextSafeSocialSlot(input.platform, cursor, input.id);
      const scheduled = await this.prisma.$transaction(async (tx) => {
        const occupied = await tx.socialPost.findFirst({
          where: {
            id: { not: input.id },
            platform: this.platformWhereForScheduling(input.platform),
            status: SocialPostStatus.SCHEDULED,
            scheduledAt,
          },
          select: { id: true },
        });

        if (occupied) {
          return false;
        }

        const updateResult = await tx.socialPost.updateMany({
          where: {
            id: input.id,
            status: { in: [SocialPostStatus.PENDING_APPROVAL, SocialPostStatus.APPROVED] },
          },
          data: {
            status: SocialPostStatus.SCHEDULED,
            scheduledAt,
            metadata: {
              ...safeMetadataRecord(input.metadata),
              approvedAt: input.approvedAt.toISOString(),
              approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
              scheduledAt: scheduledAt.toISOString(),
              schedulingPolicy: {
                timezone: RIYADH_TIMEZONE,
                automatedAfterApproval: true,
                raceGuard: 'best_effort_transaction_recheck',
              },
            } as any,
          },
        });

        if (updateResult.count !== 1) {
          return null;
        }

        await recordApprovalAuditEvent(tx, {
          action: 'APPROVED',
          entityType: 'SOCIAL_POST',
          entityId: input.id,
          metadata: { platform: input.platform, format: input.format, approvedAt: input.approvedAt.toISOString() },
        });

        await recordApprovalAuditEvent(tx, {
          action: 'SCHEDULED',
          entityType: 'SOCIAL_POST',
          entityId: input.id,
          metadata: {
            platform: input.platform,
            format: input.format,
            scheduledAt: scheduledAt.toISOString(),
            timezone: RIYADH_TIMEZONE,
          },
        });

        return true;
      });

      if (scheduled === true) {
        return { scheduled: true, scheduledAt };
      }
      if (scheduled === null) {
        return { scheduled: false };
      }

      cursor = new Date(scheduledAt.getTime() + 1_000);
    }

    throw new BadRequestException('No safe social schedule slot is available');
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

    await this.prisma.$transaction(async (tx) => {
      await tx.socialPost.update({
        where: { id },
        data: {
          status: SocialPostStatus.SCHEDULED,
          scheduledAt,
          metadata: {
            approvedAt: new Date().toISOString(),
            approvedBy: SERVER_DERIVED_APPROVAL_ACTOR_ID,
          } as any,
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'SCHEDULED',
        entityType: 'SOCIAL_POST',
        entityId: id,
        metadata: { platform: post.platform, scheduledAt: scheduledAt.toISOString() },
      });
    });

    return { success: true, action: 'scheduled', status: 'SCHEDULED', scheduledAt };
  }

  private async nextSafeSocialSlot(platform: string, now: Date, postId: string): Promise<Date> {
    const normalizedPlatform = platform === 'x' ? 'twitter' : platform;
    const policy = SOCIAL_SCHEDULE_POLICY[normalizedPlatform as keyof typeof SOCIAL_SCHEDULE_POLICY];

    if (!policy) {
      throw new BadRequestException(`Unsupported platform for scheduling: ${platform}`);
    }

    const startDay = riyadhDateParts(now);
    for (let dayOffset = 0; dayOffset < 366; dayOffset++) {
      const day = addRiyadhDays(startDay, dayOffset);
      const dayStart = riyadhLocalToUtc(day.year, day.month, day.day, 0);
      const dayEnd = riyadhLocalToUtc(day.year, day.month, day.day + 1, 0);
      const scheduledPosts = await this.prisma.socialPost.findMany({
        where: {
          id: { not: postId },
          platform: this.platformWhereForScheduling(normalizedPlatform),
          status: SocialPostStatus.SCHEDULED,
          scheduledAt: { gte: dayStart, lt: dayEnd },
        },
        select: { scheduledAt: true },
      });

      if (scheduledPosts.length >= policy.maxPerDay) {
        continue;
      }

      const occupiedTimes = new Set(
        scheduledPosts
          .map((scheduledPost) => scheduledPost.scheduledAt?.getTime())
          .filter((value): value is number => typeof value === 'number'),
      );

      for (const hour of policy.slots) {
        const candidate = riyadhLocalToUtc(day.year, day.month, day.day, hour);
        if (candidate <= now || occupiedTimes.has(candidate.getTime())) {
          continue;
        }
        return candidate;
      }
    }

    throw new BadRequestException('No safe social schedule slot is available');
  }

  private platformWhereForScheduling(platform: string): string | { in: string[] } {
    const normalizedPlatform = platform === 'x' ? 'twitter' : platform;
    return normalizedPlatform === 'twitter' ? { in: ['twitter', 'x'] } : normalizedPlatform;
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

    await this.prisma.$transaction(async (tx) => {
      await tx.socialPost.update({
        where: { id },
        data: {
          status: SocialPostStatus.REJECTED,
          complianceNotes: body.reason ?? null,
        },
      });

      await recordApprovalAuditEvent(tx, {
        action: 'REJECTED',
        entityType: 'SOCIAL_POST',
        entityId: id,
        reason: body.reason ?? null,
        metadata: { platform: post.platform, previousStatus: post.status },
      });
    });

    return { success: true, action: 'rejected', status: 'REJECTED' };
  }
}

interface RiyadhDateParts {
  year: number;
  month: number;
  day: number;
}

function safeMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function riyadhDateParts(date: Date): RiyadhDateParts {
  const shifted = new Date(date.getTime() + RIYADH_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function addRiyadhDays(parts: RiyadhDateParts, days: number): RiyadhDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function riyadhLocalToUtc(year: number, month: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - RIYADH_UTC_OFFSET_HOURS, 0, 0, 0));
}
