import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SocialApprovalController } from '../social-approval.controller';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TwitterPublisherService } from '../../../infrastructure/publishing/twitter-publisher.service';
import { TelegramPublisherService } from '../../../infrastructure/publishing/telegram-publisher.service';
import { SocialPostStatus } from '@prisma/client';

type SocialPost = {
  id: string;
  status: SocialPostStatus;
  platform: string;
  content: unknown;
  format: string | null;
  hashtags: unknown | null;
  productId: string | null;
  contentPageId: string;
  complianceScore: number | null;
  complianceNotes: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  externalId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

describe('SocialApprovalController', () => {
  let controller: SocialApprovalController;

  // ── Mock publishers (clear env before instantiation) ──────────────────────
  beforeEach(() => {
    delete process.env.TWITTER_BEARER_TOKEN;
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHANNEL_ID;
  });

  // ── Happy-path mock factories ─────────────────────────────────────────────
  const makeTwitterPost = (overrides: Partial<SocialPost> = {}): SocialPost => ({
    id: 'post_twitter_1',
    status: SocialPostStatus.APPROVED,
    platform: 'twitter',
    content: [{ text: 'Test tweet text' }],
    format: 'thread',
    hashtags: ['baby', 'diapers'],
    productId: null,
    contentPageId: 'page_1',
    complianceScore: 90,
    complianceNotes: null,
    scheduledAt: null,
    publishedAt: null,
    externalId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeTelegramPost = (overrides: Partial<SocialPost> = {}): SocialPost => ({
    id: 'post_telegram_1',
    status: SocialPostStatus.APPROVED,
    platform: 'telegram',
    content: { text: 'Test telegram message text' },
    format: 'telegram_ar',
    hashtags: ['baby'],
    productId: null,
    contentPageId: 'page_1',
    complianceScore: 85,
    complianceNotes: null,
    scheduledAt: null,
    publishedAt: null,
    externalId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createController = (
    prisma: unknown,
    twitter: unknown,
    telegram: unknown,
  ): SocialApprovalController => {
    const enhancedPrisma = prisma as {
      $transaction?: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
      approvalAuditEvent?: { create: ReturnType<typeof vi.fn> };
      socialPost?: { findFirst?: ReturnType<typeof vi.fn> };
    };

    enhancedPrisma.approvalAuditEvent ??= {
      create: vi.fn().mockResolvedValue({ id: 'audit_default' }),
    };
    if (enhancedPrisma.socialPost) {
      enhancedPrisma.socialPost.findFirst ??= vi.fn().mockResolvedValue(null);
    }
    enhancedPrisma.$transaction ??= async <T,>(fn: (tx: unknown) => Promise<T>) =>
      fn(enhancedPrisma);

    return new SocialApprovalController(
      enhancedPrisma as unknown as PrismaService,
      twitter as TwitterPublisherService,
      telegram as TelegramPublisherService,
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // approval decisions — actor spoofing protection
  // ══════════════════════════════════════════════════════════════════════════
  describe('approval decisions', () => {
    it('ignores approvedBy body spoofing and stores the server-derived actor in metadata/audit', async () => {
      const pendingPost = makeTwitterPost({
        id: 'post_pending_1',
        status: SocialPostStatus.PENDING_APPROVAL,
      });
      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(pendingPost),
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({
            ...pendingPost,
            status: SocialPostStatus.SCHEDULED,
            metadata: { approvedBy: 'admin-api-key' },
          }),
        },
        approvalAuditEvent: {
          create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
        },
      };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.approve('post_pending_1', { approvedBy: 'spoofed-admin' });

      expect(result).toEqual(expect.objectContaining({ action: 'scheduled', status: 'SCHEDULED' }));
      expect(mockPrisma.socialPost.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'post_pending_1',
          status: { in: [SocialPostStatus.PENDING_APPROVAL, SocialPostStatus.APPROVED] },
        },
        data: expect.objectContaining({
          status: SocialPostStatus.SCHEDULED,
          scheduledAt: expect.any(Date),
          metadata: expect.objectContaining({ approvedBy: 'admin-api-key' }),
        }),
      });
      expect(mockPrisma.socialPost.updateMany.mock.calls[0][0].data.metadata.approvedBy).not.toBe('spoofed-admin');
      expect(mockPrisma.approvalAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorType: 'ADMIN_API_KEY',
          actorId: 'admin-api-key',
          action: 'APPROVED',
          entityType: 'SOCIAL_POST',
          entityId: 'post_pending_1',
        }),
      });
      expect(mockPrisma.approvalAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'SCHEDULED',
          entityType: 'SOCIAL_POST',
          entityId: 'post_pending_1',
        }),
      });
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
      expect(mockTelegram.postMessage).not.toHaveBeenCalled();
    });

    it('rolls back social approval when audit creation fails', async () => {
      const store = makeTwitterPost({
        id: 'post_rollback',
        status: SocialPostStatus.PENDING_APPROVAL,
        metadata: null,
      });
      const txStore = { ...store };
      const tx = {
        socialPost: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(async ({ data }: any) => {
            Object.assign(txStore, data);
            return { count: 1 };
          }),
        },
        approvalAuditEvent: {
          create: vi.fn().mockRejectedValue(new Error('audit write failed')),
        },
      };
      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(store),
          findMany: vi.fn().mockResolvedValue([]),
        },
        $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => {
          try {
            const result = await fn(tx);
            Object.assign(store, txStore);
            return result;
          } catch (error) {
            return Promise.reject(error);
          }
        }),
      };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await expect(controller.approve('post_rollback', {})).rejects.toThrow('audit write failed');

      expect(store.status).toBe(SocialPostStatus.PENDING_APPROVAL);
      expect(store.metadata).toBeNull();
      expect(tx.socialPost.updateMany).toHaveBeenCalled();
      expect(tx.approvalAuditEvent.create).toHaveBeenCalled();
    });

    it('approval is idempotent when the social post is already scheduled', async () => {
      const scheduledPost = makeTwitterPost({
        id: 'post_already_scheduled',
        status: SocialPostStatus.SCHEDULED,
        scheduledAt: new Date('2026-05-20T08:00:00.000Z'),
      });
      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(scheduledPost),
          findMany: vi.fn(),
          updateMany: vi.fn(),
        },
        approvalAuditEvent: {
          create: vi.fn(),
        },
      };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.approve('post_already_scheduled', {});

      expect(result).toEqual(expect.objectContaining({
        success: true,
        status: 'SCHEDULED',
        idempotent: true,
      }));
      expect(mockPrisma.socialPost.updateMany).not.toHaveBeenCalled();
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
      expect(mockTelegram.postMessage).not.toHaveBeenCalled();
    });

    it('chooses the next safe Riyadh-time slot by platform capacity', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-20T07:30:00.000Z')); // 10:30 Riyadh
      const pendingPost = makeTwitterPost({
        id: 'post_schedule_policy',
        status: SocialPostStatus.PENDING_APPROVAL,
      });
      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(pendingPost),
          findMany: vi.fn().mockResolvedValue([
            { scheduledAt: new Date('2026-05-20T08:00:00.000Z') }, // 11:00 Riyadh occupied
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        approvalAuditEvent: {
          create: vi.fn().mockResolvedValue({ id: 'audit_policy' }),
        },
      };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      try {
        controller = createController(mockPrisma, mockTwitter, mockTelegram);
        const result = await controller.approve('post_schedule_policy', {});

        expect(result.scheduledAt).toEqual(new Date('2026-05-20T16:00:00.000Z')); // 19:00 Riyadh
        expect(mockPrisma.socialPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ platform: { in: ['twitter', 'x'] } }),
        }));
      } finally {
        vi.useRealTimers();
      }
    });

    it('treats twitter and x as the same schedule platform and rolls forward on collision', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-20T07:30:00.000Z')); // 10:30 Riyadh
      const pendingPost = makeTwitterPost({
        id: 'post_x_alias_collision',
        status: SocialPostStatus.PENDING_APPROVAL,
        platform: 'x',
      });
      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(pendingPost),
          findMany: vi.fn().mockResolvedValue([
            { scheduledAt: new Date('2026-05-20T08:00:00.000Z') }, // twitter 11:00 Riyadh occupies x too
          ]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        approvalAuditEvent: {
          create: vi.fn().mockResolvedValue({ id: 'audit_x_alias' }),
        },
      };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      try {
        controller = createController(mockPrisma, mockTwitter, mockTelegram);
        const result = await controller.approve('post_x_alias_collision', {});

        expect(result.scheduledAt).toEqual(new Date('2026-05-20T16:00:00.000Z')); // 19:00 Riyadh
        expect(mockPrisma.socialPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ platform: { in: ['twitter', 'x'] } }),
        }));
        expect(mockPrisma.socialPost.findFirst).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ platform: { in: ['twitter', 'x'] } }),
        }));
      } finally {
        vi.useRealTimers();
      }
    });

    it('approve-and-schedule alias uses the same safe scheduling logic as approve', async () => {
      const pendingPost = makeTelegramPost({
        id: 'post_alias_schedule',
        status: SocialPostStatus.PENDING_APPROVAL,
      });
      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(pendingPost),
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        approvalAuditEvent: {
          create: vi.fn().mockResolvedValue({ id: 'audit_alias' }),
        },
      };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.approveAndSchedule('post_alias_schedule', { approvedBy: 'spoofed' });

      expect(result).toEqual(expect.objectContaining({ action: 'scheduled', status: 'SCHEDULED' }));
      expect(mockPrisma.socialPost.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          id: 'post_alias_schedule',
          status: { in: [SocialPostStatus.PENDING_APPROVAL, SocialPostStatus.APPROVED] },
        },
      }));
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
      expect(mockTelegram.postMessage).not.toHaveBeenCalled();
    });

    it('retries approve-and-schedule when the selected slot loses a unique race', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-20T07:30:00.000Z')); // 10:30 Riyadh
      const pendingPost = makeTwitterPost({
        id: 'post_unique_conflict',
        status: SocialPostStatus.PENDING_APPROVAL,
      });
      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(pendingPost),
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi
            .fn()
            .mockRejectedValueOnce({ code: 'P2002', meta: { target: ['platform', 'scheduledAt'] } })
            .mockResolvedValueOnce({ count: 1 }),
        },
        approvalAuditEvent: {
          create: vi.fn().mockResolvedValue({ id: 'audit_retry' }),
        },
      };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      try {
        controller = createController(mockPrisma, mockTwitter, mockTelegram);
        const result = await controller.approveAndSchedule('post_unique_conflict', {});

        expect(result).toEqual(expect.objectContaining({ status: 'SCHEDULED' }));
        expect(result.scheduledAt).toEqual(new Date('2026-05-20T16:00:00.000Z'));
        expect(mockPrisma.socialPost.updateMany).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('disabled immediate publish endpoints', () => {
    it('returns 410 for single-post immediate publish without calling providers', async () => {
      const mockPrisma = { socialPost: { findUniqueOrThrow: vi.fn() } };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await expect(controller.publishOne('post_target')).rejects.toMatchObject({
        status: 410,
        response: expect.objectContaining({
          error: expect.stringContaining('Immediate social publishing is disabled'),
        }),
      });
      expect(mockPrisma.socialPost.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
      expect(mockTelegram.postMessage).not.toHaveBeenCalled();
    });

    it('returns 410 for bulk immediate publish without calling providers', async () => {
      const mockPrisma = { socialPost: { findMany: vi.fn() } };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await expect(controller.publishApproved()).rejects.toMatchObject({
        status: 410,
        response: expect.objectContaining({
          error: expect.stringContaining('Immediate bulk social publishing is disabled'),
        }),
      });
      expect(mockPrisma.socialPost.findMany).not.toHaveBeenCalled();
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
      expect(mockTelegram.postMessage).not.toHaveBeenCalled();
    });

    it('returns 410 for manual social scheduling without accepting scheduledAt', async () => {
      const mockPrisma = { socialPost: { findUniqueOrThrow: vi.fn(), update: vi.fn() } };
      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await expect(controller.schedule('post_target')).rejects.toMatchObject({
        status: 410,
        response: expect.objectContaining({
          error: expect.stringContaining('Manual social scheduling is disabled'),
        }),
      });
      expect(mockPrisma.socialPost.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mockPrisma.socialPost.update).not.toHaveBeenCalled();
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
      expect(mockTelegram.postMessage).not.toHaveBeenCalled();
    });
  });
});
