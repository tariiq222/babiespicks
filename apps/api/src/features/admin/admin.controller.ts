import { Controller, Post, Body, Delete, Get, UseGuards, HttpCode, Param } from '@nestjs/common';
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
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
    private readonly coordinator: CoordinatorService,
    private readonly prisma: PrismaService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly cache: CacheService,
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

  // Trigger product discovery manually
  @Post('pipeline/discover')
  @HttpCode(200)
  async runDiscoveryPipeline(
    @Body() body: { maxProducts?: number; source?: 'amazon' | 'noon' | 'all' },
  ) {
    const result = await this.coordinator.runDiscoveryPipeline(
      body.maxProducts ?? 10,
      body.source ?? 'all',
    );
    return result;
  }

  // Run content sprint — auto-generate best lists, reviews, buying guides
  @Post('pipeline/content-sprint')
  @HttpCode(200)
  async runContentSprint(
    @Body()
    body: {
      type?: 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE' | 'ALL';
      categorySlug?: string;
      dryRun?: boolean;
    },
  ) {
    const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
      formula:  { ar: 'حليب الأطفال',     en: 'Baby Formula' },
      diapers:  { ar: 'الحفاضات',         en: 'Diapers' },
      carseats: { ar: 'كراسي السيارة',    en: 'Car Seats' },
      bottles:  { ar: 'الرضاعات',         en: 'Bottles' },
      toys:     { ar: 'الألعاب التعليمية', en: 'Educational Toys' },
      care:     { ar: 'العناية بالطفل',   en: 'Baby Care' },
    };
    const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

    const requestedType = body.type ?? 'ALL';
    const requestedCategory = body.categorySlug ?? 'all';
    const dryRun = body.dryRun ?? false;

    const wantedTypes: Array<'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE'> =
      requestedType === 'ALL'
        ? ['BEST_LIST', 'PRODUCT_REVIEW', 'BUYING_GUIDE']
        : [requestedType as 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE'];

    const categories =
      requestedCategory === 'all' ? ALL_CATEGORIES : [requestedCategory];

    // Load products grouped by category
    const products = await this.prisma.product.findMany({
      where: { category: { slug: { in: categories } } },
      include: {
        category: true,
        translations: { where: { locale: 'en' }, take: 1 },
      },
    });

    const byCategory: Record<string, typeof products> = {};
    for (const p of products) {
      const s = p.category?.slug;
      if (!s) continue;
      if (!byCategory[s]) byCategory[s] = [];
      byCategory[s].push(p);
    }

    // Load existing slugs
    const existingPages = await this.prisma.contentPage.findMany({ select: { slug: true } });
    const existingSlugs = new Set(existingPages.map((p) => p.slug));

    const slugify = (name: string) =>
      name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);

    // Build plan
    const plan: Array<{
      type: 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE';
      slug: string;
      topic: string;
      productIds: string[];
      categoryId: string | null;
      skip: boolean;
      skipReason: string | null;
    }> = [];

    for (const catSlug of categories) {
      const catProducts = byCategory[catSlug] ?? [];
      const catLabel = CATEGORY_LABELS[catSlug] ?? { ar: catSlug, en: catSlug };
      const catId = catProducts[0]?.categoryId ?? null;

      if (wantedTypes.includes('BEST_LIST')) {
        const slug = `best-${catSlug}-2026`;
        const skip = catProducts.length < 2 || existingSlugs.has(slug);
        plan.push({
          type: 'BEST_LIST',
          slug,
          topic: `أفضل ${catLabel.ar} للأطفال في السعودية 2026`,
          productIds: catProducts.map((p) => p.id),
          categoryId: catId,
          skip,
          skipReason: skip
            ? existingSlugs.has(slug)
              ? 'slug already exists'
              : `only ${catProducts.length} product(s) — need 2+`
            : null,
        });
      }

      if (wantedTypes.includes('PRODUCT_REVIEW')) {
        for (const product of catProducts) {
          const enName = product.translations?.[0]?.name ?? product.name ?? `product-${product.id}`;
          const slug = `review-${slugify(enName)}`;
          const skip = existingSlugs.has(slug);
          plan.push({
            type: 'PRODUCT_REVIEW',
            slug,
            topic: `مراجعة ${product.name ?? enName}`,
            productIds: [product.id],
            categoryId: catId,
            skip,
            skipReason: skip ? 'slug already exists' : null,
          });
        }
      }

      if (wantedTypes.includes('BUYING_GUIDE')) {
        const slug = `guide-${catSlug}-buying`;
        const skip = catProducts.length < 1 || existingSlugs.has(slug);
        plan.push({
          type: 'BUYING_GUIDE',
          slug,
          topic: `دليل شراء ${catLabel.ar} للمواليد`,
          productIds: catProducts.map((p) => p.id),
          categoryId: catId,
          skip,
          skipReason: skip
            ? existingSlugs.has(slug)
              ? 'slug already exists'
              : 'no products in category'
            : null,
        });
      }
    }

    const toRun = plan.filter((p) => !p.skip);
    const skipped = plan.filter((p) => p.skip).map((p) => ({ slug: p.slug, type: p.type, reason: p.skipReason }));

    if (dryRun) {
      return {
        dryRun: true,
        planned: toRun.map((p) => ({ slug: p.slug, type: p.type, topic: p.topic, productCount: p.productIds.length })),
        skipped,
        executed: [],
        errors: [],
      };
    }

    // Execute
    const executed: Array<{ slug: string; type: string; status: string }> = [];
    const errors: Array<{ slug: string; type: string; error: string }> = [];

    for (let i = 0; i < toRun.length; i++) {
      const item = toRun[i];
      try {
        const result = await this.coordinator.runContentPipeline(
          item.type,
          item.topic,
          item.slug,
          item.productIds,
          item.categoryId ?? undefined,
        );
        executed.push({ slug: item.slug, type: item.type, status: result?.status ?? 'unknown' });
      } catch (error) {
        errors.push({ slug: item.slug, type: item.type, error: (error as Error).message });
      }
      // Delay between calls to avoid rate limits
      if (i < toRun.length - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    return {
      dryRun: false,
      planned: toRun.map((p) => ({ slug: p.slug, type: p.type, topic: p.topic, productCount: p.productIds.length })),
      executed,
      skipped,
      errors,
    };
  }

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
