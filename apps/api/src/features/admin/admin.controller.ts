import { Controller, Post, Body, Delete, Get, UseGuards, HttpCode } from '@nestjs/common';
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly coordinator: CoordinatorService,
    private readonly prisma: PrismaService,
  ) {}

  // Run product pipeline for a single URL
  @Post('pipeline/product')
  @HttpCode(200)
  async runProductPipeline(
    @Body() body: { url: string; storeSlug?: string; reviews?: any[] },
  ) {
    const result = await this.coordinator.runProductPipeline(
      body.url,
      body.storeSlug,
      body.reviews,
    );
    return result;
  }

  // Run product pipeline for multiple URLs (batch)
  @Post('pipeline/batch')
  @HttpCode(200)
  async runBatchPipeline(
    @Body() body: { urls: { url: string; storeSlug?: string }[] },
  ) {
    const results = [];
    for (const item of body.urls) {
      try {
        const result = await this.coordinator.runProductPipeline(item.url, item.storeSlug);
        results.push({ url: item.url, success: true, result });
      } catch (error) {
        results.push({ url: item.url, success: false, error: (error as Error).message });
      }
    }
    return { total: body.urls.length, results };
  }

  // Run content pipeline
  @Post('pipeline/content')
  @HttpCode(200)
  async runContentPipeline(
    @Body() body: { type: string; topic: string; slug: string; productIds: string[]; categoryId?: string },
  ) {
    const result = await this.coordinator.runContentPipeline(
      body.type as 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE',
      body.topic,
      body.slug,
      body.productIds,
      body.categoryId,
    );
    return result;
  }

  // Clear all mock/seed data
  @Delete('data/reset')
  async resetData() {
    // Delete in order respecting foreign keys
    await this.prisma.publishedPost.deleteMany();
    await this.prisma.contentPageTranslation.deleteMany();
    await this.prisma.contentPage.deleteMany();
    await this.prisma.agentJob.deleteMany();
    await this.prisma.affiliateClick.deleteMany();
    await this.prisma.verdict.deleteMany();
    await this.prisma.productReviewSummary.deleteMany();
    await this.prisma.productSpec.deleteMany();
    await this.prisma.productPrice.deleteMany();
    await this.prisma.productTranslation.deleteMany();
    await this.prisma.product.deleteMany();
    
    return { success: true, message: 'All product data cleared' };
  }

  // Get pipeline status / stats
  @Get('stats')
  async getStats() {
    const [products, verdicts, contentPages, agentJobs] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.verdict.count(),
      this.prisma.contentPage.count(),
      this.prisma.agentJob.count(),
    ]);
    return { products, verdicts, contentPages, agentJobs };
  }

  // Cost aggregation stats
  @Get('costs')
  async getCosts() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Totals across all jobs + status breakdown
    const [totalAgg, statusCounts, byAgentRaw, last7DaysRaw] = await Promise.all([
      this.prisma.agentJob.aggregate({
        _sum: { tokensUsed: true, costUsd: true },
      }),
      this.prisma.agentJob.groupBy({ by: ['status'], _count: true }),
      this.prisma.$queryRaw<{ agentType: string; tokens: bigint; cost: string; jobCount: bigint }[]>`
        SELECT
          "agentType",
          COALESCE(SUM("tokensUsed"), 0)::bigint AS tokens,
          COALESCE(SUM("costUsd"), 0)::text AS cost,
          COUNT(*)::bigint AS "jobCount"
        FROM "AgentJob"
        WHERE status = 'COMPLETED'
        GROUP BY "agentType"
        ORDER BY tokens DESC
      `,
      this.prisma.$queryRaw<{ date: string; tokens: bigint; cost: string }[]>`
        SELECT
          DATE_TRUNC('day', "createdAt")::date AS date,
          COALESCE(SUM("tokensUsed"), 0)::bigint AS tokens,
          COALESCE(SUM("costUsd"), 0)::text AS cost
        FROM "AgentJob"
        WHERE "createdAt" >= ${sevenDaysAgo}
        GROUP BY DATE_TRUNC('day', "createdAt")::date
        ORDER BY date ASC
      `,
    ]);

    const totalTokens = Number(totalAgg._sum.tokensUsed ?? 0);
    const totalCostUsd = Number(totalAgg._sum.costUsd ?? 0);

    const totalJobs = statusCounts.reduce((sum, s) => sum + s._count, 0);
    const completedJobs = statusCounts.find((s) => s.status === 'COMPLETED')?._count ?? 0;
    const failedJobs = statusCounts.find((s) => s.status === 'FAILED')?._count ?? 0;

    const byAgent = byAgentRaw.map((row) => ({
      agentType: row.agentType,
      tokens: Number(row.tokens),
      costUsd: parseFloat(row.cost),
      jobCount: Number(row.jobCount),
    }));

    const last7Days = last7DaysRaw.map((row) => ({
      date: row.date,
      tokens: Number(row.tokens),
      costUsd: parseFloat(row.cost),
    }));

    return { totalTokens, totalCostUsd, byAgent, last7Days, totalJobs, completedJobs, failedJobs };
  }
}
