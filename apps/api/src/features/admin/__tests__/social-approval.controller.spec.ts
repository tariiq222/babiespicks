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
  ): SocialApprovalController =>
    new SocialApprovalController(
      prisma as PrismaService,
      twitter as TwitterPublisherService,
      telegram as TelegramPublisherService,
    );

  // ══════════════════════════════════════════════════════════════════════════
  // publishOne — single-target publish
  // ══════════════════════════════════════════════════════════════════════════
  describe('publishOne', () => {
    it('throws BadRequestException when post status is not APPROVED', async () => {
      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: 'post_1',
            status: SocialPostStatus.PENDING_APPROVAL,
            platform: 'twitter',
            content: [],
          }),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await expect(controller.publishOne('post_1')).rejects.toThrow(
        /Cannot publish: status is PENDING_APPROVAL, expected APPROVED/,
      );
    });

    it('publishes APPROVED Twitter post and marks it PUBLISHED', async () => {
      const twitterPost = makeTwitterPost();

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(twitterPost),
          update: vi.fn().mockResolvedValue({ ...twitterPost, status: SocialPostStatus.PUBLISHED }),
        },
      };

      const mockTwitter = {
        postThread: vi.fn().mockResolvedValue({ success: true, tweetIds: ['tweet_123'] }),
      };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishOne('post_twitter_1');

      expect(result.success).toBe(true);
      expect(result.platform).toBe('twitter');
      expect(result.externalId).toBe('tweet_123');
      expect(mockTwitter.postThread).toHaveBeenCalledWith([{ text: 'Test tweet text' }]);
      expect(mockPrisma.socialPost.update).toHaveBeenCalledWith({
        where: { id: 'post_twitter_1' },
        data: expect.objectContaining({ status: SocialPostStatus.PUBLISHED }),
      });
    });

    it('publishes APPROVED Telegram post and marks it PUBLISHED', async () => {
      const telegramPost = makeTelegramPost();

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(telegramPost),
          update: vi.fn().mockResolvedValue({ ...telegramPost, status: SocialPostStatus.PUBLISHED }),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = {
        postMessage: vi.fn().mockResolvedValue({ success: true, messageId: 42 }),
      };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishOne('post_telegram_1');

      expect(result.success).toBe(true);
      expect(result.platform).toBe('telegram');
      expect(result.externalId).toBe('42');
      expect(mockTelegram.postMessage).toHaveBeenCalledWith('Test telegram message text');
      expect(mockPrisma.socialPost.update).toHaveBeenCalledWith({
        where: { id: 'post_telegram_1' },
        data: expect.objectContaining({ status: SocialPostStatus.PUBLISHED }),
      });
    });

    it('marks Twitter post REJECTED when Twitter API fails', async () => {
      const twitterPost = makeTwitterPost();

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(twitterPost),
          update: vi.fn().mockResolvedValue({ ...twitterPost, status: SocialPostStatus.REJECTED }),
        },
      };

      const mockTwitter = {
        postThread: vi.fn().mockResolvedValue({ success: false, tweetIds: [], error: 'Rate limited' }),
      };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishOne('post_twitter_1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limited');
      expect(mockPrisma.socialPost.update).toHaveBeenCalledWith({
        where: { id: 'post_twitter_1' },
        data: expect.objectContaining({ status: SocialPostStatus.REJECTED }),
      });
    });

    it('marks Telegram post REJECTED when Telegram API fails', async () => {
      const telegramPost = makeTelegramPost();

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(telegramPost),
          update: vi.fn().mockResolvedValue({ ...telegramPost, status: SocialPostStatus.REJECTED }),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = {
        postMessage: vi.fn().mockResolvedValue({ success: false, error: 'Chat not found' }),
      };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishOne('post_telegram_1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Chat not found');
      expect(mockPrisma.socialPost.update).toHaveBeenCalledWith({
        where: { id: 'post_telegram_1' },
        data: expect.objectContaining({ status: SocialPostStatus.REJECTED }),
      });
    });

    it('throws BadRequestException when Twitter post has no tweets', async () => {
      const badPost = makeTwitterPost({ content: [] });

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(badPost),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await expect(controller.publishOne('post_twitter_1')).rejects.toThrow('No tweets to publish');
    });

    it('throws BadRequestException when Telegram post has no text content', async () => {
      const badPost = makeTelegramPost({ content: { text: '' } });

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(badPost),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await expect(controller.publishOne('post_telegram_1')).rejects.toThrow(
        'No text content to publish to Telegram',
      );
    });

    it('throws BadRequestException for unsupported platform', async () => {
      const badPost = makeTwitterPost({ platform: 'facebook' as any });

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(badPost),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await expect(controller.publishOne('post_twitter_1')).rejects.toThrow('Unsupported platform: facebook');
    });

    it('Telegram post with stale comments field publishes only content.text — comments are ignored', async () => {
      // Regression: Telegram content objects historically contained a `comments` array field
      // that was used in the now-removed thread-mode implementation. The controller must
      // publish ONLY content.text and must NOT pass comments to TelegramPublisherService.
      const telegramPostWithStaleComments = makeTelegramPost({
        id: 'post_telegram_stale_comments',
        content: {
          text: 'Primary message text',
          comments: ['Stale reply 1', 'Stale reply 2', 'Stale reply 3'],
        } as any,
      });

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(telegramPostWithStaleComments),
          update: vi.fn().mockResolvedValue({ ...telegramPostWithStaleComments, status: SocialPostStatus.PUBLISHED }),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = {
        postMessage: vi.fn().mockResolvedValue({ success: true, messageId: 123 }),
      };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishOne('post_telegram_stale_comments');

      expect(result.success).toBe(true);
      expect(result.platform).toBe('telegram');
      // Verify postMessage was called with ONLY the text content
      expect(mockTelegram.postMessage).toHaveBeenCalledTimes(1);
      expect(mockTelegram.postMessage).toHaveBeenCalledWith('Primary message text');
      // Verify postMessage was NOT called with an array or comments
      expect(mockTelegram.postMessage).not.toHaveBeenCalledWith(
        expect.arrayContaining(['Stale reply 1']),
      );
      // Twitter should never be called for a Telegram post
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
    });

    it('publishOne affects only the targeted post — other APPROVED post remains APPROVED', async () => {
      // Stateful mock: track multiple posts in a mutable store
      const postStore = new Map<string, SocialPost>([
        ['post_target', makeTwitterPost({ id: 'post_target' })],
        ['post_other', makeTwitterPost({ id: 'post_other', status: SocialPostStatus.APPROVED })],
      ]);

      const mockPrisma = {
        socialPost: {
          findUniqueOrThrow: vi.fn(async ({ where }: any) => {
            const post = postStore.get(where.id);
            if (!post) throw new Error('Post not found');
            return post;
          }),
          update: vi.fn(async ({ where, data }: any) => {
            const post = postStore.get(where.id);
            if (!post) throw new Error('Post not found');
            const updated = { ...post, ...data, updatedAt: new Date() };
            postStore.set(where.id, updated);
            return updated;
          }),
        },
      };

      const mockTwitter = {
        postThread: vi.fn().mockResolvedValue({ success: true, tweetIds: ['tweet_123'] }),
      };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      await controller.publishOne('post_target');

      // Target should be PUBLISHED
      expect(postStore.get('post_target')?.status).toBe(SocialPostStatus.PUBLISHED);

      // Other post should still be APPROVED
      expect(postStore.get('post_other')?.status).toBe(SocialPostStatus.APPROVED);

      // Only one update call (for target)
      expect(mockPrisma.socialPost.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.socialPost.findUniqueOrThrow).toHaveBeenCalledTimes(1);
      expect(mockTwitter.postThread).toHaveBeenCalledTimes(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // publishApproved — bulk publish all APPROVED posts
  // ══════════════════════════════════════════════════════════════════════════
  describe('publishApproved', () => {
    it('publishes all APPROVED posts across Twitter and Telegram', async () => {
      const approvedPosts = [
        makeTwitterPost({ id: 'tw_1', status: SocialPostStatus.APPROVED }),
        makeTelegramPost({ id: 'tg_1', status: SocialPostStatus.APPROVED }),
        makeTwitterPost({ id: 'tw_2', status: SocialPostStatus.APPROVED }),
      ];

      const mockPrisma = {
        socialPost: {
          findMany: vi.fn().mockResolvedValue(approvedPosts),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const mockTwitter = {
        postThread: vi.fn().mockResolvedValue({ success: true, tweetIds: ['tweet_x'] }),
      };
      const mockTelegram = {
        postMessage: vi.fn().mockResolvedValue({ success: true, messageId: 99 }),
      };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishApproved();

      expect(result.published).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.platformBreakdown.twitter).toBe(2);
      expect(result.platformBreakdown.telegram).toBe(1);
      expect(result.results).toHaveLength(3);
    });

    it('counts Twitter and Telegram publish failures separately', async () => {
      const approvedPosts = [
        makeTwitterPost({ id: 'tw_ok' }),
        makeTwitterPost({ id: 'tw_fail' }),
        makeTelegramPost({ id: 'tg_ok' }),
        makeTelegramPost({ id: 'tg_fail' }),
      ];

      const mockPrisma = {
        socialPost: {
          findMany: vi.fn().mockResolvedValue(approvedPosts),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const mockTwitter = {
        postThread: vi
          .fn()
          .mockResolvedValueOnce({ success: true, tweetIds: ['tweet_1'] })
          .mockResolvedValueOnce({ success: false, tweetIds: [], error: 'Auth error' }),
      };
      const mockTelegram = {
        postMessage: vi
          .fn()
          .mockResolvedValueOnce({ success: true, messageId: 1 })
          .mockResolvedValueOnce({ success: false, error: 'Blocked' }),
      };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishApproved();

      expect(result.published).toBe(2);
      expect(result.failed).toBe(2);
      expect(result.platformBreakdown.twitter).toBe(1);
      expect(result.platformBreakdown.telegram).toBe(1);

      const failedResults = result.results.filter((r) => !r.success);
      expect(failedResults).toHaveLength(2);
      expect(failedResults.find((r) => r.id === 'tw_fail')?.error).toBe('Auth error');
      expect(failedResults.find((r) => r.id === 'tg_fail')?.error).toBe('Blocked');
    });

    it('skips Twitter posts with no tweets and reports them as failed', async () => {
      const approvedPosts = [makeTwitterPost({ id: 'tw_empty', content: [] })];

      const mockPrisma = {
        socialPost: {
          findMany: vi.fn().mockResolvedValue(approvedPosts),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishApproved();

      expect(result.published).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBe('No tweets to publish');
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
    });

    it('skips Telegram posts with no text content and reports them as failed', async () => {
      const approvedPosts = [makeTelegramPost({ id: 'tg_empty', content: { text: '' } })];

      const mockPrisma = {
        socialPost: {
          findMany: vi.fn().mockResolvedValue(approvedPosts),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishApproved();

      expect(result.published).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBe('No text content to publish');
      expect(mockTelegram.postMessage).not.toHaveBeenCalled();
    });

    it('skips unsupported platforms and reports them as failed', async () => {
      const approvedPosts = [
        makeTwitterPost({ id: 'tw_ok' }),
        { ...makeTwitterPost(), id: 'fb_bad', platform: 'facebook' as any },
      ];

      const mockPrisma = {
        socialPost: {
          findMany: vi.fn().mockResolvedValue(approvedPosts),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const mockTwitter = {
        postThread: vi.fn().mockResolvedValue({ success: true, tweetIds: ['tweet_1'] }),
      };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishApproved();

      expect(result.published).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results.find((r) => r.id === 'fb_bad')?.error).toContain('Unsupported platform');
    });

    it('returns empty results when no APPROVED posts exist', async () => {
      const mockPrisma = {
        socialPost: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const mockTwitter = { postThread: vi.fn() };
      const mockTelegram = { postMessage: vi.fn() };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishApproved();

      expect(result.published).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(mockTwitter.postThread).not.toHaveBeenCalled();
      expect(mockTelegram.postMessage).not.toHaveBeenCalled();
    });

    it('does not touch non-APPROVED posts — only APPROVED posts are returned by findMany filter', async () => {
      // Stateful mock: mix of APPROVED and non-APPROVED posts
      const allPosts = [
        makeTwitterPost({ id: 'tw_approved', status: SocialPostStatus.APPROVED }),
        makeTwitterPost({ id: 'tw_pending', status: SocialPostStatus.PENDING_APPROVAL }),
        makeTelegramPost({ id: 'tg_rejected', status: SocialPostStatus.REJECTED }),
        makeTelegramPost({ id: 'tg_approved', status: SocialPostStatus.APPROVED }),
      ];

      const postStore = new Map<string, SocialPost>(allPosts.map((p) => [p.id, p]));

      const mockPrisma = {
        socialPost: {
          findMany: vi.fn(async ({ where }: any) => {
            // Simulate Prisma filter: only return APPROVED posts
            return allPosts.filter((p) => p.status === where?.status);
          }),
          update: vi.fn(async ({ where, data }: any) => {
            const post = postStore.get(where.id);
            if (!post) throw new Error('Post not found');
            const updated = { ...post, ...data, updatedAt: new Date() };
            postStore.set(where.id, updated);
            return updated;
          }),
        },
      };

      const mockTwitter = {
        postThread: vi.fn().mockResolvedValue({ success: true, tweetIds: ['tweet_x'] }),
      };
      const mockTelegram = {
        postMessage: vi.fn().mockResolvedValue({ success: true, messageId: 99 }),
      };

      controller = createController(mockPrisma, mockTwitter, mockTelegram);

      const result = await controller.publishApproved();

      // Only 2 APPROVED posts should be processed
      expect(result.published).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.platformBreakdown.twitter).toBe(1);
      expect(result.platformBreakdown.telegram).toBe(1);

      // APPROVED posts should now be PUBLISHED
      expect(postStore.get('tw_approved')?.status).toBe(SocialPostStatus.PUBLISHED);
      expect(postStore.get('tg_approved')?.status).toBe(SocialPostStatus.PUBLISHED);

      // Non-APPROVED posts should remain untouched
      expect(postStore.get('tw_pending')?.status).toBe(SocialPostStatus.PENDING_APPROVAL);
      expect(postStore.get('tg_rejected')?.status).toBe(SocialPostStatus.REJECTED);

      // Verify findMany was called with the APPROVED filter
      expect(mockPrisma.socialPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: SocialPostStatus.APPROVED }) }),
      );
    });
  });
});
