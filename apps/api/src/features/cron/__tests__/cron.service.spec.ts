import { describe, expect, it, vi } from 'vitest';
import { SocialPostStatus } from '@prisma/client';
import { CoordinatorService } from '../../../agents/coordinator/coordinator.service';
import { PublisherService } from '../../../agents/publisher/publisher.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SitemapService } from '../../../infrastructure/publishing/sitemap.service';
import { AiOsService } from '../../ai-os/ai-os.service';
import { CouponsService } from '../../coupons/coupons.service';
import { CronService } from '../cron.service';
import { SchedulerService } from '../scheduler.service';

describe('CronService social legacy publish hardening', () => {
  it('does not publish APPROVED social posts directly and delegates scheduled publishing', async () => {
    const prisma = {
      socialPost: { findMany: vi.fn() },
    };
    const aiOs = {
      startLegacyRun: vi.fn().mockResolvedValue('run_1'),
      addLegacyEvent: vi.fn().mockResolvedValue(undefined),
      completeLegacyRun: vi.fn().mockResolvedValue(undefined),
      failLegacyRun: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = {
      publishScheduledSocialPosts: vi.fn().mockResolvedValue({ published: 0, failed: 0, skippedUnapproved: 0 }),
    };
    const service = new CronService(
      prisma as unknown as PrismaService,
      {} as CoordinatorService,
      {} as CouponsService,
      {} as SitemapService,
      {} as PublisherService,
      aiOs as unknown as AiOsService,
      scheduler as unknown as SchedulerService,
      { ingestAnalytics: () => Promise.resolve({ buckets: 0, ingestedAt: "" }), generateRecommendations: () => Promise.resolve({ insightsCreated: 0, generatedAt: "" }) } as never,
      { executeScheduledPost: () => Promise.resolve({} as any) } as never,
    );

    await service.publishApprovedSocialPosts();

    expect(prisma.socialPost.findMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { status: SocialPostStatus.APPROVED },
    }));
    expect(scheduler.publishScheduledSocialPosts).toHaveBeenCalledOnce();
  });

  it('publishes scheduled content through PublisherService so claim/idempotency is centralized', async () => {
    const prisma = {
      contentPage: {
        findMany: vi.fn().mockResolvedValue([{ id: 'page_due', slug: 'due-content' }]),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      publishedPost: { create: vi.fn() },
    };
    const publisher = {
      approveAndPublish: vi.fn().mockResolvedValue({ published: true }),
    };
    const service = new CronService(
      prisma as unknown as PrismaService,
      {} as CoordinatorService,
      {} as CouponsService,
      {} as SitemapService,
      publisher as unknown as PublisherService,
      {} as AiOsService,
      {} as SchedulerService,
      { ingestAnalytics: () => Promise.resolve({ buckets: 0, ingestedAt: '' }), generateRecommendations: () => Promise.resolve({ insightsCreated: 0, generatedAt: '' }) } as never,
      { executeScheduledPost: () => Promise.resolve({} as any) } as never,
    );

    await service.publishScheduledContent();

    expect(prisma.contentPage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'SCHEDULED', isPublished: false }),
    }));
    expect(publisher.approveAndPublish).toHaveBeenCalledWith('page_due');
    expect(prisma.contentPage.update).not.toHaveBeenCalled();
    expect(prisma.contentPage.updateMany).not.toHaveBeenCalled();
    expect(prisma.publishedPost.create).not.toHaveBeenCalled();
  });
});
