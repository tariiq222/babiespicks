import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
import { CouponsService } from '../coupons/coupons.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: CoordinatorService,
    private readonly couponsService: CouponsService,
  ) {}

  // Re-scrape prices and data for products with sourceUrl every 6 hours
  @Cron(CronExpression.EVERY_6_HOURS)
  async checkPrices() {
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

    for (const product of products) {
      try {
        // Re-run pipeline to update prices/data
        await this.coordinator.runProductPipeline(
          product.sourceUrl!,
          undefined,
        );
        this.logger.log(`Updated: ${product.name}`);
      } catch (error) {
        this.logger.error(`Failed to update ${product.name}: ${(error as Error).message}`);
      }
      
      // Rate limit: wait 5 seconds between products
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    this.logger.log('Price check completed');
  }

  // Regenerate sitemap daily
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async regenerateSitemap() {
    this.logger.log('Regenerating sitemap...');
    // TODO: Implement sitemap regeneration
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

  // Discover new products daily at 6 AM (Saudi time — UTC+3, so 03:00 UTC)
  @Cron('0 3 * * *')
  async discoverNewProducts() {
    this.logger.log('Running daily product discovery...');
    try {
      const result = await this.coordinator.runDiscoveryPipeline();
      this.logger.log(
        `Discovery complete: ${result.succeeded}/${result.total} products processed`,
      );
    } catch (error) {
      this.logger.error(`Discovery failed: ${(error as Error).message}`);
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
