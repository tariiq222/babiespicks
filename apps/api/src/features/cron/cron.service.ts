import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SocialPostStatus, AiRunType } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
import { CouponsService } from '../coupons/coupons.service';
import { SitemapService } from '../../infrastructure/publishing/sitemap.service';
import { PublisherService } from '../../agents/publisher/publisher.service';
import { TwitterPublisherService, TweetContent } from '../../infrastructure/publishing/twitter-publisher.service';
import { AiOsService } from '../ai-os/ai-os.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: CoordinatorService,
    private readonly couponsService: CouponsService,
    private readonly sitemapService: SitemapService,
    private readonly publisher: PublisherService,
    private readonly twitter: TwitterPublisherService,
    private readonly aiOs: AiOsService,
  ) {}

  // Re-scrape prices and data for products with sourceUrl every 6 hours
  @Cron(CronExpression.EVERY_6_HOURS)
  async checkPrices() {
    const runId = await this.aiOs.startLegacyRun({
      type: AiRunType.PRODUCT_PIPELINE,
      name: 'cron:check-prices',
      source: 'cron',
      input: {},
    });
    await this.aiOs.addLegacyEvent(runId, 'INFO', 'Scheduled price check started');

    this.logger.log('Starting scheduled price check...');

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        sourceUrl: { not: null },
      },
      include: {
        verdict: true,
        prices: { orderBy: { scrapedAt: 'desc' }, take: 1 },
      },
    });

    this.logger.log(`Found ${products.length} products with sourceUrl to check`);

    let updated = 0;
    let failed = 0;

    for (const product of products) {
      try {
        // Re-run pipeline to update prices/data
        await this.coordinator.runProductPipeline(
          product.sourceUrl!,
          undefined,
        );
        this.logger.log(`Updated: ${product.name}`);
        updated++;
      } catch (error) {
        this.logger.error(`Failed to update ${product.name}: ${(error as Error).message}`);
        failed++;
        await this.aiOs.addLegacyEvent(runId, 'ERROR', `Failed: ${product.name} — ${(error as Error).message}`);
      }

      // Rate limit: wait 5 seconds between products
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    this.logger.log('Price check completed');
    await this.aiOs.completeLegacyRun(runId, { total: products.length, updated, failed });
  }

  // Regenerate sitemap daily at 5 AM
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async regenerateSitemap() {
    this.logger.log('Regenerating sitemap...');
    try {
      const xml = await this.sitemapService.regenerate();
      this.logger.log(`Sitemap regenerated successfully (${xml.length} bytes)`);
    } catch (error) {
      this.logger.error(`Sitemap regeneration failed: ${(error as Error).message}`);
    }
  }

  // Publish scheduled content — every 15 minutes
  @Cron('*/15 * * * *')
  async publishScheduledContent() {
    const now = new Date();

    const scheduled = await this.prisma.contentPage.findMany({
      where: {
        status: 'SCHEDULED',
        isPublished: false,
        scheduledAt: { lte: now },
      },
      select: { id: true, slug: true },
    });

    if (scheduled.length === 0) {
      return;
    }

    this.logger.log(`Found ${scheduled.length} scheduled content page(s) ready to publish`);

    for (const page of scheduled) {
      try {
        const result = await this.publisher.approveAndPublish(page.id);
        if (result.published) {
          this.logger.log(`Scheduled publish succeeded: ${page.slug}`);
        } else {
          this.logger.warn(`Scheduled publish skipped for ${page.slug}: ${result.reason}`);
        }
      } catch (error) {
        this.logger.error(`Scheduled publish failed for ${page.slug}: ${(error as Error).message}`);
      }
    }
  }

  // Publish approved social posts — every 30 minutes
  @Cron('*/30 * * * *')
  async publishApprovedSocialPosts() {
    const runId = await this.aiOs.startLegacyRun({
      type: AiRunType.MANUAL,
      name: 'cron:publish-social',
      source: 'cron',
      input: {},
    });
    await this.aiOs.addLegacyEvent(runId, 'INFO', 'Social publish job started');

    const approved = await this.prisma.socialPost.findMany({
      where: { status: SocialPostStatus.APPROVED },
    });

    if (approved.length === 0) {
      await this.aiOs.completeLegacyRun(runId, { published: 0, failed: 0, skipped: 0 });
      return;
    }

    this.logger.log(`Found ${approved.length} approved social post(s) to publish`);

    let published = 0;
    let failed = 0;
    let skipped = 0;

    for (const post of approved) {
      const tweets = (post.content ?? []) as unknown as TweetContent[];

      if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
        this.logger.warn(`SocialPost ${post.id} has no tweets — skipping`);
        skipped++;
        continue;
      }

      try {
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
          published++;
          await this.aiOs.addLegacyEvent(runId, 'INFO', `Published SocialPost ${post.id}`);
          this.logger.log(`SocialPost ${post.id} published — tweetId: ${result.tweetIds?.[0]}`);
        } else {
          await this.prisma.socialPost.update({
            where: { id: post.id },
            data: {
              status: SocialPostStatus.REJECTED,
              metadata: { error: result.error } as any,
            },
          });
          failed++;
          await this.aiOs.addLegacyEvent(runId, 'ERROR', `Failed SocialPost ${post.id}: ${result.error}`);
          this.logger.warn(`SocialPost ${post.id} failed to publish: ${result.error}`);
        }
      } catch (error) {
        failed++;
        await this.aiOs.addLegacyEvent(runId, 'ERROR', `SocialPost ${post.id} error: ${(error as Error).message}`);
        this.logger.error(`SocialPost ${post.id} publish error: ${(error as Error).message}`);
      }
    }

    this.logger.log(`publishApprovedSocialPosts: ${published} published, ${failed} failed, ${skipped} skipped`);
    await this.aiOs.completeLegacyRun(runId, { published, failed, skipped });
  }

  // Clean up old affiliate clicks (>90 days)
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldClicks() {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await this.prisma.affiliateClick.deleteMany({
      where: { createdAt: { lt: ninetyDaysAgo } },
    });

    this.logger.log(`Cleaned up ${result.count} old affiliate clicks`);
  }

  // Expire coupons whose validUntil has passed — runs daily at 1 AM
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireOldCoupons() {
    this.logger.log('Running coupon expiration job...');
    try {
      const result = await this.couponsService.expireOldCoupons();
      this.logger.log(`Coupon expiration complete — expired: ${result.expiredCount}`);
    } catch (error) {
      this.logger.error(`Coupon expiration job failed: ${(error as Error).message}`);
    }
  }

  // Discover Amazon SA products daily at 6 AM Saudi time (03:00 UTC)
  @Cron('0 3 * * *')
  async discoverAmazonProducts() {
    const runId = await this.aiOs.startLegacyRun({
      type: AiRunType.DISCOVERY,
      name: 'cron:discover-amazon',
      source: 'cron',
      input: { source: 'amazon', maxProducts: 10 },
    });
    await this.aiOs.addLegacyEvent(runId, 'INFO', 'Amazon SA discovery started');

    this.logger.log('Running Amazon SA product discovery...');
    try {
      const result = await this.coordinator.runDiscoveryPipeline(10, 'amazon');
      this.logger.log(`Amazon discovery: ${result.succeeded}/${result.total} processed`);
      await this.aiOs.completeLegacyRun(runId, { discovered: result.discovered, succeeded: result.succeeded, failed: result.failed });
    } catch (error) {
      await this.aiOs.failLegacyRun(runId, (error as Error).message);
      this.logger.error(`Amazon discovery failed: ${(error as Error).message}`);
    }
  }

  // Discover Noon SA products daily at 1 PM Saudi time (10:00 UTC)
  @Cron('0 10 * * *')
  async discoverNoonProducts() {
    const runId = await this.aiOs.startLegacyRun({
      type: AiRunType.DISCOVERY,
      name: 'cron:discover-noon',
      source: 'cron',
      input: { source: 'noon', maxProducts: 10 },
    });
    await this.aiOs.addLegacyEvent(runId, 'INFO', 'Noon SA discovery started');

    this.logger.log('Running Noon SA product discovery...');
    try {
      const result = await this.coordinator.runDiscoveryPipeline(10, 'noon');
      this.logger.log(`Noon discovery: ${result.succeeded}/${result.total} processed`);
      await this.aiOs.completeLegacyRun(runId, { discovered: result.discovered, succeeded: result.succeeded, failed: result.failed });
    } catch (error) {
      await this.aiOs.failLegacyRun(runId, (error as Error).message);
      this.logger.error(`Noon discovery failed: ${(error as Error).message}`);
    }
  }

  // Daily stats at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyStats() {
    const [products, verdicts, clicks, jobs] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.verdict.count(),
      this.prisma.affiliateClick.count(),
      this.prisma.agentJob.count(),
    ]);

    this.logger.log(`📊 Daily Stats — Products: ${products}, Verdicts: ${verdicts}, Clicks: ${clicks}, Agent Jobs: ${jobs}`);
  }
}
