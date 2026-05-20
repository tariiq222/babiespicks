import { SocialPostStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TelegramPublisherService } from '../../../infrastructure/publishing/telegram-publisher.service';
import { TwitterPublisherService } from '../../../infrastructure/publishing/twitter-publisher.service';
import { SocialDraftService } from '../social-drafts.service';

describe('SocialDraftService publish hardening', () => {
  const approvedPost = {
    id: 'post_1',
    status: SocialPostStatus.APPROVED,
    platform: 'twitter',
    content: [{ text: 'safe tweet' }],
    metadata: { approvedAt: '2026-05-20T09:00:00.000Z' },
  };

  let prisma: {
    socialPost: {
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    approvalAuditEvent: { create: ReturnType<typeof vi.fn> };
  };
  let twitter: { postThread: ReturnType<typeof vi.fn> };
  let service: SocialDraftService;

  beforeEach(() => {
    prisma = {
      socialPost: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(approvedPost),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      approvalAuditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit_1' }) },
    };
    twitter = { postThread: vi.fn().mockResolvedValue({ success: true, tweetIds: ['tw_1'] }) };
    service = new SocialDraftService(
      prisma as unknown as PrismaService,
      twitter as unknown as TwitterPublisherService,
      { postMessage: vi.fn() } as unknown as TelegramPublisherService,
    );
  });

  it('claims the approved post before publishing externally', async () => {
    await service.publishSocialDraft('post_1', { actorId: 'admin', trigger: 'manual' });

    expect(prisma.socialPost.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      twitter.postThread.mock.invocationCallOrder[0],
    );
    const claimCall = prisma.socialPost.updateMany.mock.calls[0][0];
    expect(claimCall.where).toEqual(expect.objectContaining({ id: 'post_1', status: SocialPostStatus.APPROVED }));
    expect(claimCall.where.metadata).toEqual(expect.objectContaining({ equals: approvedPost.metadata }));
    expect(claimCall.data.metadata.publishLock.attemptId).toEqual(expect.any(String));
  });

  it('does not publish externally when the atomic claim fails', async () => {
    prisma.socialPost.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.publishSocialDraft('post_1');

    expect(twitter.postThread).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'Social draft is already being published' });
  });
});
