import { ApprovalAuditAction, ApprovalAuditActorType, ApprovalAuditEntityType, SocialPostStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TelegramPublisherService } from '../../../infrastructure/publishing/telegram-publisher.service';
import { TwitterPublisherService } from '../../../infrastructure/publishing/twitter-publisher.service';
import { SchedulerService } from '../scheduler.service';

describe('SchedulerService social publish hardening', () => {
  const now = new Date('2026-05-20T12:00:00.000Z');
  const scheduledPost = {
    id: 'post_scheduled',
    status: SocialPostStatus.SCHEDULED,
    platform: 'twitter',
    scheduledAt: new Date('2026-05-20T11:55:00.000Z'),
    content: [{ text: 'scheduled tweet' }],
    metadata: { approvedBy: 'metadata-only-marker' },
  };

  let prisma: {
    socialPost: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    approvalAuditEvent: { findFirst: ReturnType<typeof vi.fn> };
  };
  let twitter: { postThread: ReturnType<typeof vi.fn> };
  let service: SchedulerService;

  beforeEach(() => {
    prisma = {
      socialPost: {
        findMany: vi.fn().mockResolvedValue([scheduledPost]),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      approvalAuditEvent: { findFirst: vi.fn().mockResolvedValue({ id: 'audit_1' }) },
    };
    twitter = { postThread: vi.fn().mockResolvedValue({ success: true, tweetIds: ['tw_1'] }) };
    service = new SchedulerService(
      prisma as unknown as PrismaService,
      {},
      twitter as unknown as TwitterPublisherService,
      { postMessage: vi.fn() } as unknown as TelegramPublisherService,
    );
  });

  it('requires a server approval audit event instead of trusting metadata markers', async () => {
    prisma.approvalAuditEvent.findFirst.mockResolvedValueOnce(null);

    const result = await service.publishScheduledSocialPosts({ now, workerId: 'worker-1' });

    expect(result).toEqual({ published: 0, failed: 0, skippedUnapproved: 1 });
    expect(twitter.postThread).not.toHaveBeenCalled();
    expect(prisma.socialPost.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: scheduledPost.id },
      data: expect.objectContaining({ status: SocialPostStatus.REJECTED }),
    }));
  });

  it('atomically claims the scheduled post before external publish', async () => {
    await service.publishScheduledSocialPosts({ now, workerId: 'worker-1' });

    expect(prisma.approvalAuditEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityType: ApprovalAuditEntityType.SOCIAL_POST,
        entityId: scheduledPost.id,
        action: { in: [ApprovalAuditAction.SCHEDULED, ApprovalAuditAction.APPROVED] },
        actorType: { in: [ApprovalAuditActorType.ADMIN_API_KEY, ApprovalAuditActorType.SYSTEM] },
      }),
    }));
    expect(prisma.socialPost.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      twitter.postThread.mock.invocationCallOrder[0],
    );
    const claimCall = prisma.socialPost.updateMany.mock.calls[0][0];
    expect(claimCall.where).toEqual(expect.objectContaining({
      id: scheduledPost.id,
      status: SocialPostStatus.SCHEDULED,
      metadata: expect.objectContaining({ equals: scheduledPost.metadata }),
    }));
    expect(claimCall.data.metadata.publishLock.attemptId).toEqual(expect.any(String));
  });

  it('does not publish externally when the claim loses the race', async () => {
    prisma.socialPost.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.publishScheduledSocialPosts({ now, workerId: 'worker-1' });

    expect(result).toEqual({ published: 0, failed: 0, skippedUnapproved: 0 });
    expect(twitter.postThread).not.toHaveBeenCalled();
  });
});
