import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SocialCoordinatorService, SocialPipelineResult } from '../social-coordinator.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TweetCrafterService } from '../tweet-crafter.service';
import { HashtagMinerService } from '../hashtag-miner.service';
import { SocialGuardService } from '../social-guard.service';
import { VisualMakerService } from '../visual-maker.service';

type Post = SocialPipelineResult['posts'][number];

describe('SocialCoordinatorService', () => {
  let service: SocialCoordinatorService;

  const mockPrisma = {
    contentPage: { findUnique: vi.fn() },
    product: { findFirst: vi.fn(), findUnique: vi.fn() },
    socialPost: { create: vi.fn() },
    agentJob: { create: vi.fn() },
  };

  const mockTweetCrafter = { craftTweets: vi.fn() };
  const mockHashtagMiner = { mineHashtags: vi.fn() };
  const mockSocialGuard = { checkCompliance: vi.fn() };
  const mockVisualMaker = { generateVerdictCard: vi.fn() };

  const mockContentPage = {
    id: 'page_1',
    slug: 'best-diapers-2026',
    type: 'BEST_LIST',
    status: 'DRAFT',
    translations: [
      { locale: 'ar', title: 'أفضل الحفاضات' },
      { locale: 'en', title: 'Best Diapers 2026' },
    ],
    category: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocialCoordinatorService(
      mockPrisma as unknown as PrismaService,
      mockTweetCrafter as unknown as TweetCrafterService,
      mockHashtagMiner as unknown as HashtagMinerService,
      mockSocialGuard as unknown as SocialGuardService,
      mockVisualMaker as unknown as VisualMakerService,
    );

    mockPrisma.contentPage.findUnique.mockResolvedValue(mockContentPage);
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.product.findUnique.mockResolvedValue(null);
    mockPrisma.agentJob.create.mockResolvedValue({});

    mockTweetCrafter.craftTweets.mockResolvedValue({
      tweets: [{ text: 'Test tweet 1', order: 1 }],
      singleTweet: 'Single tweet content',
      format: 'thread',
    });
    mockHashtagMiner.mineHashtags.mockResolvedValue(['baby', 'diapers']);
    mockSocialGuard.checkCompliance.mockResolvedValue({ passed: true, score: 90, issues: [] });
    mockVisualMaker.generateVerdictCard.mockResolvedValue(null);

    let callCount = 0;
    mockPrisma.socialPost.create.mockImplementation(() => {
      callCount++;
      return Promise.resolve({ id: `post_${callCount}`, platform: 'twitter', status: 'PENDING_APPROVAL' });
    });
  });

  describe('runSocialPipeline platform validation', () => {
    it('defaults to twitter only when platforms is omitted', async () => {
      const result = await service.runSocialPipeline('page_1');
      expect(result.posts.length).toBeGreaterThan(0);
      expect(result.posts.every((p: Post) => p.platform === 'twitter')).toBe(true);
    });

    it('accepts twitter only', async () => {
      const result = await service.runSocialPipeline('page_1', ['twitter']);
      expect(result.posts.length).toBeGreaterThan(0);
      expect(result.posts.every((p: Post) => p.platform === 'twitter')).toBe(true);
    });

    it('accepts both twitter and telegram', async () => {
      const result = await service.runSocialPipeline('page_1', ['twitter', 'telegram']);
      expect(result.posts.filter((p: Post) => p.platform === 'twitter').length).toBeGreaterThan(0);
      expect(result.posts.filter((p: Post) => p.platform === 'telegram').length).toBeGreaterThan(0);
    });

    it('rejects empty platform array', async () => {
      await expect(service.runSocialPipeline('page_1', [])).rejects.toThrow(
        /platforms must be a non-empty array/i,
      );
    });

    it('rejects unsupported platform values', async () => {
      await expect(service.runSocialPipeline('page_1', ['facebook'])).rejects.toThrow(
        /Unsupported platform\(s\): facebook/i,
      );
    });

    it('rejects mixed valid and unsupported platforms', async () => {
      await expect(service.runSocialPipeline('page_1', ['twitter', 'facebook', 'instagram'])).rejects.toThrow(
        /Unsupported platform\(s\): facebook, instagram/i,
      );
    });

    it('rejects empty string in platforms array', async () => {
      await expect(service.runSocialPipeline('page_1', [''])).rejects.toThrow();
    });

    it('accepts telegram only', async () => {
      const result = await service.runSocialPipeline('page_1', ['telegram']);
      expect(result.posts.length).toBeGreaterThan(0);
      expect(result.posts.every((p: Post) => p.platform === 'telegram')).toBe(true);
    });
  });
});
