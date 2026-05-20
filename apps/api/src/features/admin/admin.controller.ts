import { Controller, Post, Delete, Get, UseGuards, HttpCode, Param } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { CircuitBreakerService } from '../../infrastructure/circuit-breaker/circuit-breaker.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

const WEB_REVALIDATE_URL =
  process.env.WEB_REVALIDATE_URL ||
  `http://localhost:3000/api/revalidate`;

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly cache: CacheService,
  ) {}

  // Get circuit breaker status for all breakers
  @Get('circuit-breakers')
  async getCircuitBreakers() {
    return this.circuitBreaker.getStatus();
  }

  // Reset a specific circuit breaker by name
  @Post('circuit-breakers/:name/reset')
  @HttpCode(200)
  async resetCircuitBreaker(@Param('name') name: string) {
    await this.circuitBreaker.resetBreaker(name);
    return { success: true, breaker: name, action: 'reset' };
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

    // Invalidate in-memory API cache so homepage reflects empty DB
    this.cache.invalidate();

    // Purge stale Next.js Data Cache entries for public product surfaces.
    // Uses bearer-token auth (REVALIDATE_SECRET). Fails silently — stale
    // entries will expire naturally via revalidate time-to-live.
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(WEB_REVALIDATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(REVALIDATE_SECRET ? { Authorization: `Bearer ${REVALIDATE_SECRET}` } : {}),
        },
        body: JSON.stringify({
          // Revalidate actual locale root paths so the homepage refreshes
          paths: ['/ar', '/en', '/ar/categories', '/en/categories'],
          // Revalidate by tag — more reliable than path-based revalidation for
          // data caches; covers all product and content-page fetches
          tags: ['products', 'content-pages'],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`[admin] revalidate failed (${res.status}): ${await res.text()}`);
      }
    } catch (err) {
      // Non-fatal: stale entries will expire naturally via TTL
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[admin] revalidate error: ${msg}`);
    }

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
      this.prisma.$queryRaw<{ agentName: string; tokens: bigint; cost: string; jobCount: bigint }[]>`
        SELECT
          "agentName",
          COALESCE(SUM("tokensUsed"), 0)::bigint AS tokens,
          COALESCE(SUM("costUsd"), 0)::text AS cost,
          COUNT(*)::bigint AS "jobCount"
        FROM "agent_jobs"
        WHERE status = 'COMPLETED'
        GROUP BY "agentName"
        ORDER BY tokens DESC
      `,
      this.prisma.$queryRaw<{ date: string; tokens: bigint; cost: string }[]>`
        SELECT
          DATE_TRUNC('day', "createdAt")::date AS date,
          COALESCE(SUM("tokensUsed"), 0)::bigint AS tokens,
          COALESCE(SUM("costUsd"), 0)::text AS cost
        FROM "agent_jobs"
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
      agentName: row.agentName,
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
