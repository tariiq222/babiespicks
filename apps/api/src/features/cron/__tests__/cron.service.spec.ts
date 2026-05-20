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
    );

    await service.publishApprovedSocialPosts();

    expect(prisma.socialPost.findMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { status: SocialPostStatus.APPROVED },
    }));
    expect(scheduler.publishScheduledSocialPosts).toHaveBeenCalledOnce();
  });
});
