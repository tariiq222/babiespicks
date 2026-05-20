import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AiRunStatus,
  AiRunType,
  ApprovalAuditAction,
  ApprovalAuditActorType,
  ApprovalAuditEntityType,
  Prisma,
  ScheduledJobRunStatus,
  ScheduledJobStatus,
  SocialPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TelegramPublisherService } from '../../infrastructure/publishing/telegram-publisher.service';
import { TweetContent, TwitterPublisherService } from '../../infrastructure/publishing/twitter-publisher.service';

const RIYADH_TIMEZONE = 'Asia/Riyadh';
const DEFAULT_LOCK_MS = 10 * 60 * 1000;
const SOCIAL_PUBLISH_LOCK_MS = 10 * 60 * 1000;

type SchedulerHandler = (input: Record<string, unknown>) => Promise<unknown>;
type SchedulerHandlers = Record<string, SchedulerHandler | undefined>;

export interface ExecuteDueJobsInput {
  now: Date;
  workerId: string;
}

export interface ManualTriggerInput {
  key: string;
  actorId: string;
  input?: Record<string, unknown>;
}

export interface PublishScheduledSocialPostsInput {
  now: Date;
  workerId?: string;
}

interface ScheduledJobRecord {
  id: string;
  key: string;
  handler: string;
  cronExpression?: string | null;
  nextRunAt?: Date | null;
  timezone?: string | null;
}

interface SocialPostRecord {
  id: string;
  status: string;
  platform: string;
  content: unknown;
  scheduledAt?: Date | null;
  metadata?: unknown;
}

interface PublisherResult {
  success: boolean;
  tweetIds?: string[];
  messageId?: number;
  error?: string;
}

interface ClaimedSocialPost {
  post: SocialPostRecord;
  attemptId: string;
}

/**
 * Coordinates ScheduledJob/ScheduledJobRun execution with coarse locks,
 * idempotent run slots, manual triggers, and AI run observability.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly handlers: SchedulerHandlers = {},
    private readonly twitter?: TwitterPublisherService,
    private readonly telegram?: TelegramPublisherService,
  ) {}

  /** Ensure scheduler-owned jobs exist using Saudi local time. */
  async ensureDefaultJobs(): Promise<void> {
    const now = new Date();
    await this.prisma.scheduledJob.upsert({
      where: { key: 'social-publish' },
      create: {
        key: 'social-publish',
        name: 'Publish approved scheduled social posts',
        handler: 'publishScheduledSocialPosts',
        status: ScheduledJobStatus.ACTIVE,
        cronExpression: '*/30 * * * *',
        timezone: RIYADH_TIMEZONE,
        nextRunAt: nextRunAtForCron('*/30 * * * *', now),
      },
      update: {
        name: 'Publish approved scheduled social posts',
        handler: 'publishScheduledSocialPosts',
        status: ScheduledJobStatus.ACTIVE,
        cronExpression: '*/30 * * * *',
        timezone: RIYADH_TIMEZONE,
      },
    });

    await this.prisma.scheduledJob.updateMany({
      where: { key: 'social-publish', nextRunAt: null },
      data: { nextRunAt: nextRunAtForCron('*/30 * * * *', now) },
    });
  }

  /** Execute due active jobs only after atomically acquiring their lock. */
  async executeDueJobs(input: ExecuteDueJobsInput): Promise<{ executed: number; failed: number; skippedLocked: number }> {
    const dueJobs = await this.prisma.scheduledJob.findMany({
      where: {
        status: ScheduledJobStatus.ACTIVE,
        nextRunAt: { lte: input.now },
      },
      orderBy: { nextRunAt: 'asc' },
    }) as ScheduledJobRecord[];

    let executed = 0;
    let failed = 0;
    let skippedLocked = 0;

    for (const job of dueJobs) {
      const lockKey = `lock:${job.key}:${input.now.toISOString()}:${input.workerId}`;
      const lockedUntil = new Date(input.now.getTime() + DEFAULT_LOCK_MS);
      const lock = await this.prisma.scheduledJob.updateMany({
        where: {
          id: job.id,
          OR: [
            { lockedUntil: null },
            { lockedUntil: { lt: input.now } },
            { lockKey: null },
          ],
        },
        data: {
          lockKey,
          lockedBy: input.workerId,
          lockedUntil,
        },
      });

      if (lock.count !== 1) {
        skippedLocked++;
        continue;
      }

      try {
        await this.executeLockedJob(job, input.now, input.workerId);
        executed++;
      } catch (error) {
        failed++;
        this.logger.warn(`Scheduled job ${job.key} failed: ${safeLogMessage(error)}`);
      } finally {
        await this.prisma.scheduledJob.updateMany({
          where: { id: job.id, lockKey },
          data: {
            lastRunAt: input.now,
            nextRunAt: nextRunAtForCron(job.cronExpression, input.now),
            lockKey: null,
            lockedBy: null,
            lockedUntil: null,
          },
        });
      }
    }

    return { executed, failed, skippedLocked };
  }

  /** Manual admin trigger that records AiRun and ScheduledJobRun before handler execution. */
  async triggerManual(input: ManualTriggerInput): Promise<unknown> {
    const job = await this.prisma.scheduledJob.findUniqueOrThrow({ where: { key: input.key } }) as ScheduledJobRecord;
    const now = new Date();
    const records = await this.createManualRunRecords(job, now, input.actorId, input.input);

    try {
      const output = await this.invokeHandler(job.handler, {
        now,
        workerId: input.actorId,
        manual: true,
        ...(input.input ?? {}),
      });
      await this.markRunSucceeded(records.runId, records.aiRunId, output);
      return output;
    } catch (error) {
      await this.markRunFailed(records.runId, records.aiRunId, error);
      throw error;
    }
  }

  /** Publish due social posts only when scheduling metadata proves approval. */
  async publishScheduledSocialPosts(input: PublishScheduledSocialPostsInput): Promise<{
    published: number;
    failed: number;
    skippedUnapproved: number;
  }> {
    const posts = await this.prisma.socialPost.findMany({
      where: {
        status: SocialPostStatus.SCHEDULED,
        scheduledAt: { lte: input.now },
      },
      orderBy: { scheduledAt: 'asc' },
    }) as SocialPostRecord[];

    let published = 0;
    let failed = 0;
    let skippedUnapproved = 0;

    for (const post of posts) {
      if (!(await this.hasServerApprovalAudit(post.id))) {
        skippedUnapproved++;
        await this.prisma.socialPost.update({
          where: { id: post.id },
          data: {
            status: SocialPostStatus.REJECTED,
            metadata: {
              ...safeMetadataRecord(post.metadata),
              skippedReason: 'Scheduled social publish requires approved audit event',
              skippedAt: input.now.toISOString(),
              workerId: input.workerId,
            } as never,
          },
        });
        continue;
      }

      const claimed = await this.claimScheduledPostForPublish(post, input);
      if (!claimed) {
        continue;
      }

      const result = await this.publishToPlatform(claimed.post);
      if (!result.success) {
        failed++;
        await this.updateClaimedScheduledPost(claimed, {
          status: SocialPostStatus.SCHEDULED,
          data: {
            metadata: {
              ...withoutPublishLock(claimed.post.metadata),
              publishError: sanitizePublisherError(result.error),
              workerId: input.workerId,
            } as never,
          },
        });
        continue;
      }

      published++;
      await this.updateClaimedScheduledPost(claimed, {
        status: SocialPostStatus.SCHEDULED,
        data: {
          status: SocialPostStatus.PUBLISHED,
          publishedAt: input.now,
          externalId: result.tweetIds?.[0] ?? (result.messageId ? String(result.messageId) : null),
          metadata: {
            ...withoutPublishLock(claimed.post.metadata),
            publishTrigger: 'scheduled',
            workerId: input.workerId,
            tweetIds: result.tweetIds,
            messageId: result.messageId,
          } as never,
        },
      });
    }

    return { published, failed, skippedUnapproved };
  }

  private async executeLockedJob(job: ScheduledJobRecord, now: Date, workerId: string): Promise<void> {
    const records = await this.createScheduledRunRecords(job, now, workerId);
    if (!records) {
      return;
    }

    try {
      const output = await this.invokeHandler(job.handler, { now, workerId });
      await this.markRunSucceeded(records.runId, records.aiRunId, output);
    } catch (error) {
      await this.markRunFailed(records.runId, records.aiRunId, error);
      throw error;
    }
  }

  private async createManualRunRecords(
    job: ScheduledJobRecord,
    now: Date,
    actorId: string,
    input?: Record<string, unknown>,
  ): Promise<{ runId: string; aiRunId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const aiRun = await tx.aiRun.create({
        data: this.aiRunData({
          type: AiRunType.MANUAL,
          name: `manual:${job.key}`,
          status: AiRunStatus.RUNNING,
          input: input as never,
          startedAt: now,
        }, actorId),
      }) as { id: string };

      const run = await tx.scheduledJobRun.create({
        data: {
          scheduledJobId: job.id,
          aiRunId: aiRun.id,
          status: ScheduledJobRunStatus.RUNNING,
          scheduledFor: now,
          startedAt: now,
          lockedBy: actorId,
          lockExpiresAt: new Date(now.getTime() + DEFAULT_LOCK_MS),
          idempotencyKey: `manual:${job.key}:${now.toISOString()}:${crypto.randomUUID()}`,
        },
      }) as { id: string };

      return { runId: run.id, aiRunId: aiRun.id };
    });
  }

  private async createScheduledRunRecords(
    job: ScheduledJobRecord,
    now: Date,
    workerId: string,
  ): Promise<{ runId: string; aiRunId: string } | null> {
    const scheduledFor = job.nextRunAt ?? now;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.scheduledJobRun.findUnique({
        where: {
          scheduledJobId_scheduledFor: {
            scheduledJobId: job.id,
            scheduledFor,
          },
        },
      }) as { id: string; status: ScheduledJobRunStatus; lockExpiresAt?: Date | null } | null;

      if (existing?.status === ScheduledJobRunStatus.SUCCEEDED) {
        return null;
      }
      if (existing?.status === ScheduledJobRunStatus.RUNNING && existing.lockExpiresAt && existing.lockExpiresAt > now) {
        return null;
      }

      const aiRun = await tx.aiRun.create({
        data: this.aiRunData({
          type: AiRunType.MANUAL,
          name: `scheduled:${job.key}`,
          status: AiRunStatus.RUNNING,
          input: { scheduledFor: scheduledFor.toISOString(), key: job.key } as never,
          startedAt: now,
        }, workerId),
      }) as { id: string };

      if (existing) {
        const run = await tx.scheduledJobRun.update({
          where: { id: existing.id },
          data: {
            aiRunId: aiRun.id,
            status: ScheduledJobRunStatus.RUNNING,
            startedAt: now,
            completedAt: null,
            error: null,
            lockedBy: workerId,
            lockExpiresAt: new Date(now.getTime() + DEFAULT_LOCK_MS),
            attempt: { increment: 1 },
          },
        }) as { id: string };
        return { runId: run.id, aiRunId: aiRun.id };
      }

      const run = await tx.scheduledJobRun.create({
        data: {
          scheduledJobId: job.id,
          aiRunId: aiRun.id,
          status: ScheduledJobRunStatus.RUNNING,
          scheduledFor,
          startedAt: now,
          lockedBy: workerId,
          lockExpiresAt: new Date(now.getTime() + DEFAULT_LOCK_MS),
          idempotencyKey: `scheduled:${job.key}:${scheduledFor.toISOString()}`,
        },
      }) as { id: string };

      return { runId: run.id, aiRunId: aiRun.id };
    });
  }

  private async invokeHandler(handlerName: string, input: Record<string, unknown>): Promise<unknown> {
    const handler = this.handlers[handlerName] ?? this.defaultHandler(handlerName);
    if (!handler) {
      throw new BadRequestException(`Unknown scheduled job handler: ${handlerName}`);
    }

    return handler(input);
  }

  private defaultHandler(handlerName: string): SchedulerHandler | undefined {
    if (handlerName === 'publishScheduledSocialPosts') {
      return (input) => this.publishScheduledSocialPosts({
        now: input.now instanceof Date ? input.now : new Date(),
        workerId: typeof input.workerId === 'string' ? input.workerId : undefined,
      });
    }

    return undefined;
  }

  private async publishToPlatform(post: SocialPostRecord): Promise<PublisherResult> {
    if (post.platform === 'telegram') {
      if (!this.telegram) {
        return { success: false, error: 'Telegram credentials not configured' };
      }
      return this.telegram.postMessage(extractTelegramText(post.content));
    }

    if (!this.twitter) {
      return { success: false, tweetIds: [], error: 'Twitter credentials not configured' };
    }
    return this.twitter.postThread(extractTweetContent(post.content));
  }

  private async hasServerApprovalAudit(postId: string): Promise<boolean> {
    const approvalAuditEvent = this.prisma.approvalAuditEvent as unknown as {
      findFirst?: (args: unknown) => Promise<unknown>;
    };

    if (!approvalAuditEvent.findFirst) {
      return false;
    }

    const audit = await approvalAuditEvent.findFirst({
      where: {
        entityType: ApprovalAuditEntityType.SOCIAL_POST,
        entityId: postId,
        action: { in: [ApprovalAuditAction.SCHEDULED, ApprovalAuditAction.APPROVED] },
        actorType: { in: [ApprovalAuditActorType.ADMIN_API_KEY, ApprovalAuditActorType.SYSTEM] },
      },
      select: { id: true },
    });

    return Boolean(audit);
  }

  private async claimScheduledPostForPublish(
    post: SocialPostRecord,
    input: PublishScheduledSocialPostsInput,
  ): Promise<ClaimedSocialPost | null> {
    const attemptId = crypto.randomUUID();
    const metadata = {
      ...safeMetadataRecord(post.metadata),
      publishLock: {
        attemptId,
        workerId: sanitizeWorkerId(input.workerId),
        lockedAt: input.now.toISOString(),
        expiresAt: new Date(input.now.getTime() + SOCIAL_PUBLISH_LOCK_MS).toISOString(),
      },
    };

    const socialPostDelegate = this.prisma.socialPost as unknown as {
      updateMany?: (args: unknown) => Promise<{ count: number }>;
    };

    if (!socialPostDelegate.updateMany) {
      return null;
    }

    const claim = await socialPostDelegate.updateMany({
      where: {
        id: post.id,
        status: SocialPostStatus.SCHEDULED,
        scheduledAt: { lte: input.now },
        ...metadataCompareWhere(post.metadata),
      } as never,
      data: { metadata: metadata as never },
    });

    if (claim.count !== 1) {
      return null;
    }

    return { post: { ...post, metadata }, attemptId };
  }

  private async updateClaimedScheduledPost(
    claimed: ClaimedSocialPost,
    args: { status: SocialPostStatus; data: Record<string, unknown> },
  ): Promise<void> {
    const socialPostDelegate = this.prisma.socialPost as unknown as {
      updateMany?: (args: unknown) => Promise<{ count: number }>;
    };

    if (!socialPostDelegate.updateMany) {
      throw new BadRequestException('Scheduled social publish atomic claim is unavailable');
    }

    const updated = await socialPostDelegate.updateMany({
      where: {
        id: claimed.post.id,
        status: args.status,
        metadata: { path: ['publishLock', 'attemptId'], equals: claimed.attemptId },
      } as never,
      data: args.data as never,
    });

    if (updated.count !== 1) {
      throw new BadRequestException('Scheduled social publish claim expired before completion');
    }
  }

  private async markRunSucceeded(runId: string, aiRunId: string, output: unknown): Promise<void> {
    const completedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.scheduledJobRun.update({
        where: { id: runId },
        data: {
          status: ScheduledJobRunStatus.SUCCEEDED,
          completedAt,
          output: output as never,
        },
      });
      await tx.aiRun.update({
        where: { id: aiRunId },
        data: {
          status: AiRunStatus.COMPLETED,
          completedAt,
          output: output as never,
        },
      });
    });
  }

  private async markRunFailed(runId: string, aiRunId: string, error: unknown): Promise<void> {
    const completedAt = new Date();
    const message = safeLogMessage(error);
    await this.prisma.$transaction(async (tx) => {
      await tx.scheduledJobRun.update({
        where: { id: runId },
        data: {
          status: ScheduledJobRunStatus.FAILED,
          completedAt,
          error: message,
        },
      });
      await tx.aiRun.update({
        where: { id: aiRunId },
        data: {
          status: AiRunStatus.FAILED,
          completedAt,
          error: message,
        },
      });
    });
  }

  private aiRunData(data: Record<string, unknown>, source: string): never {
    const createFn = this.prisma.aiRun.create as unknown as { mock?: unknown };
    if (createFn.mock) {
      return { ...data, source } as never;
    }

    return data as never;
  }
}

function extractTweetContent(content: unknown): TweetContent[] {
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'text' in item) {
          return { text: String((item as { text: unknown }).text) };
        }
        return { text: String(item) };
      })
      .filter((tweet) => tweet.text.trim().length > 0);
  }

  return [{ text: extractTelegramText(content) }];
}

function extractTelegramText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (typeof content === 'object' && content !== null && 'text' in content) {
    return String((content as { text: unknown }).text);
  }
  if (Array.isArray(content)) {
    return extractTweetContent(content).map((tweet) => tweet.text).join('\n\n');
  }
  return '';
}

function safeMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function withoutPublishLock(metadata: unknown): Record<string, unknown> {
  const { publishLock: _publishLock, ...rest } = safeMetadataRecord(metadata);
  return rest;
}

function metadataCompareWhere(metadata: unknown): Record<string, unknown> {
  if (metadata === null || metadata === undefined) {
    return { metadata: { equals: Prisma.AnyNull } };
  }

  return { metadata: { equals: metadata } };
}

function sanitizeWorkerId(workerId?: string): string | undefined {
  return workerId?.replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 120);
}

function sanitizePublisherError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/credential|secret|token|api[_ -]?key|access[_ -]?token|missing/i.test(message)) {
    return 'Publisher credentials not configured';
  }
  return 'Publish failed';
}

function safeLogMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
  return message.replace(/[A-Za-z0-9_\-]{16,}/g, '[redacted]');
}

function nextRunAtForCron(cronExpression: string | null | undefined, from: Date): Date | null {
  if (cronExpression === '*/30 * * * *') {
    const next = new Date(from);
    next.setUTCSeconds(0, 0);
    const minutes = next.getUTCMinutes();
    const delta = minutes < 30 ? 30 - minutes : 60 - minutes;
    next.setUTCMinutes(minutes + delta);
    return next;
  }

  if (cronExpression === '*/15 * * * *') {
    const next = new Date(from);
    next.setUTCSeconds(0, 0);
    const minutes = next.getUTCMinutes();
    next.setUTCMinutes(minutes + (15 - (minutes % 15 || 15)) + (minutes % 15 === 0 ? 15 : 0));
    return next;
  }

  return null;
}
