import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Price check every 6 hours
   * In production: scrape prices from stores
   */
  @Cron('0 */6 * * *')
  async checkPrices() {
    this.logger.log('Cron: Price check started');
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sourceUrl: true },
    });
    this.logger.log(`Cron: ${products.length} products to check`);
    // TODO: Run DataAcquisitionService for each product
  }

  /**
   * Daily sitemap regeneration at 5 AM
   */
  @Cron('0 5 * * *')
  async regenerateSitemap() {
    this.logger.log('Cron: Sitemap regeneration triggered');
    // Next.js ISR handles this via revalidation
    // This cron just logs for monitoring
  }

  /**
   * Weekly cleanup of old affiliate clicks (>90 days)
   */
  @Cron('0 3 * * 1') // Monday 3 AM
  async cleanupOldClicks() {
    this.logger.log('Cron: Cleaning old affiliate clicks');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const result = await this.prisma.affiliateClick.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(`Cron: Deleted ${result.count} old clicks`);
  }

  /**
   * Daily stats log at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyStats() {
    const [products, verdicts, clicks, jobs] = await Promise.all([
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.verdict.count({ where: { isPublished: true } }),
      this.prisma.affiliateClick.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      this.prisma.agentJob.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
    ]);
    this.logger.log(`Daily Stats: ${products} products, ${verdicts} verdicts, ${clicks} clicks today, ${jobs} agent jobs today`);
  }
}
