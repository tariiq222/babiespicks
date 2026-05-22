import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
import { DiscoverySource } from '../../agents/discovery/discovery.service';
import { AiOsService } from '../ai-os/ai-os.service';
import { AiRunType } from '@prisma/client';
import { SchedulerRegistry } from '@nestjs/schedule';

export interface TriggerResult {
  runId: string;
  source: string;
  maxProducts: number;
  status: string;
}

export interface DiscoveryConfig {
  amazonCron: string;
  noonCron: string;
  maxProducts: number;
  enabled: boolean;
  amazonNextRun: string | null;
  noonNextRun: string | null;
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  // Configurable settings (in-memory, can be persisted to DB or env)
  private config: {
    amazonCron: string;
    noonCron: string;
    maxProducts: number;
    enabled: boolean;
  } = {
    amazonCron: '0 3 * * *', // 6 AM Saudi = 3 AM UTC
    noonCron: '0 10 * * *', // 1 PM Saudi = 10 AM UTC
    maxProducts: 10,
    enabled: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: CoordinatorService,
    private readonly aiOs: AiOsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /** Trigger discovery pipeline manually */
  async triggerDiscovery(source: 'amazon' | 'noon' | 'all', maxProducts: number): Promise<TriggerResult> {
    this.logger.log(`[DiscoveryService] Manual trigger: source=${source}, maxProducts=${maxProducts}`);

    const runId = await this.aiOs.startLegacyRun({
      type: AiRunType.DISCOVERY,
      name: `manual:${source}-discovery`,
      source: 'admin',
      input: { source, maxProducts },
    });

    try {
      const result = await this.coordinator.runDiscoveryPipeline(maxProducts, source as DiscoverySource);

      await this.aiOs.completeLegacyRun(runId, {
        discovered: result.discovered,
        succeeded: result.succeeded,
        failed: result.failed,
        total: result.total,
      });

      return {
        runId: runId ?? 'unknown',
        source,
        maxProducts,
        status: 'COMPLETED',
      };
    } catch (error) {
      await this.aiOs.failLegacyRun(runId, (error as Error).message);
      throw error;
    }
  }

  /** Get discovery runs from agent_jobs */
  async getRuns(params: { limit: number; offset: number; source?: string }) {
    const { limit, offset, source } = params;

    const where: Record<string, unknown> = {
      agentName: 'discovery',
    };

    if (source && source !== 'all') {
      where.input = { contains: source };
    }

    const [items, total] = await Promise.all([
      this.prisma.agentJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.agentJob.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /** Get trend signals from discovery */
  async getTrendSignals(params: { limit: number; offset: number; status?: string }) {
    const { limit, offset, status } = params;

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    // Filter to discovery sources only
    where.source = { startsWith: 'discovery' };

    const [items, total] = await Promise.all([
      this.prisma.trendSignal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.trendSignal.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /** Normalize a Prisma product into the DTO shape expected by the admin UI */
  private normalizeProduct(product: {
    id: string;
    name: string;
    slug: string | null;
    brand: string | null;
    imageUrl: string | null;
    status: string | null;
    sourceUrl: string | null;
    dataSource: string | null;
    confidence: unknown | null;
    isActive: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    store: { id: string; name: string; slug: string; url: string | null; affiliateNetwork: string | null } | null;
    category: { id: string; name: string; slug: string } | null;
    verdict: {
      type: string;
      overallScore: unknown | null;
      reasoningAr: string | null;
      reasoningEn: string | null;
      safetyScore: unknown | null;
      qualityScore: unknown | null;
      reviewsScore: unknown | null;
      priceScore: unknown | null;
      longTermScore: unknown | null;
      isPublished: boolean | null;
      createdAt: Date | null;
    } | null;
    reviewSummary: {
      averageRating: unknown | null;
      totalReviews: number | null;
      sentimentScore: unknown | null;
      prosAr: unknown | null;
      prosEn: unknown | null;
      consAr: unknown | null;
      consEn: unknown | null;
      redFlags: unknown | null;
      analyzedAt: Date | null;
    } | null;
    translations: Array<{ locale: string; name: string | null; description: string | null }>;
    prices: Array<{
      price: unknown;
      originalPrice: unknown | null;
      currency: string;
      url: string | null;
      inStock: boolean | null;
      scrapedAt: Date | null;
      store: { id: string; name: string; slug: string; url: string | null; affiliateNetwork: string | null };
    }>;
    agentJobs: Array<{
      id: string;
      agentName: string;
      status: string;
      createdAt: Date | null;
      completedAt: Date | null;
    }>;
  }) {
    // Convert Decimal prices to numbers
    const prices = product.prices.map((p) => ({
      price: typeof p.price === 'object' && p.price !== null ? Number(p.price) : (p.price as number),
      originalPrice:
        p.originalPrice != null
          ? typeof p.originalPrice === 'object'
            ? Number(p.originalPrice)
            : (p.originalPrice as number)
          : null,
      currency: p.currency,
      url: p.url,
      inStock: p.inStock,
      scrapedAt: p.scrapedAt?.toISOString() ?? null,
      store: p.store,
    }));

    // Normalize verdict fields
    const verdict = product.verdict
      ? {
          type: product.verdict.type,
          score:
            product.verdict.overallScore != null
              ? typeof product.verdict.overallScore === 'object'
                ? Number(product.verdict.overallScore)
                : (product.verdict.overallScore as number)
              : null,
          reasoningAr: product.verdict.reasoningAr,
          reasoningEn: product.verdict.reasoningEn,
          safetyScore:
            product.verdict.safetyScore != null
              ? typeof product.verdict.safetyScore === 'object'
                ? Number(product.verdict.safetyScore)
                : (product.verdict.safetyScore as number)
              : null,
          qualityScore:
            product.verdict.qualityScore != null
              ? typeof product.verdict.qualityScore === 'object'
                ? Number(product.verdict.qualityScore)
                : (product.verdict.qualityScore as number)
              : null,
          reviewsScore:
            product.verdict.reviewsScore != null
              ? typeof product.verdict.reviewsScore === 'object'
                ? Number(product.verdict.reviewsScore)
                : (product.verdict.reviewsScore as number)
              : null,
          priceScore:
            product.verdict.priceScore != null
              ? typeof product.verdict.priceScore === 'object'
                ? Number(product.verdict.priceScore)
                : (product.verdict.priceScore as number)
              : null,
          longTermScore:
            product.verdict.longTermScore != null
              ? typeof product.verdict.longTermScore === 'object'
                ? Number(product.verdict.longTermScore)
                : (product.verdict.longTermScore as number)
              : null,
          isPublished: product.verdict.isPublished,
          createdAt: product.verdict.createdAt?.toISOString() ?? null,
        }
      : null;

    // Normalize review summary
    const reviewSummary = product.reviewSummary
      ? {
          averageRating:
            product.reviewSummary.averageRating != null
              ? typeof product.reviewSummary.averageRating === 'object'
                ? Number(product.reviewSummary.averageRating)
                : (product.reviewSummary.averageRating as number)
              : null,
          totalReviews: product.reviewSummary.totalReviews,
          sentimentScore:
            product.reviewSummary.sentimentScore != null
              ? typeof product.reviewSummary.sentimentScore === 'object'
                ? Number(product.reviewSummary.sentimentScore)
                : (product.reviewSummary.sentimentScore as number)
              : null,
          prosAr:
            product.reviewSummary.prosAr != null
              ? typeof product.reviewSummary.prosAr === 'string'
                ? product.reviewSummary.prosAr
                : JSON.stringify(product.reviewSummary.prosAr)
              : null,
          prosEn:
            product.reviewSummary.prosEn != null
              ? typeof product.reviewSummary.prosEn === 'string'
                ? product.reviewSummary.prosEn
                : JSON.stringify(product.reviewSummary.prosEn)
              : null,
          consAr:
            product.reviewSummary.consAr != null
              ? typeof product.reviewSummary.consAr === 'string'
                ? product.reviewSummary.consAr
                : JSON.stringify(product.reviewSummary.consAr)
              : null,
          consEn:
            product.reviewSummary.consEn != null
              ? typeof product.reviewSummary.consEn === 'string'
                ? product.reviewSummary.consEn
                : JSON.stringify(product.reviewSummary.consEn)
              : null,
          redFlags:
            product.reviewSummary.redFlags != null
              ? typeof product.reviewSummary.redFlags === 'string'
                ? product.reviewSummary.redFlags
                : JSON.stringify(product.reviewSummary.redFlags)
              : null,
          analyzedAt: product.reviewSummary.analyzedAt?.toISOString() ?? null,
        }
      : null;

    // Normalize translations: name -> title
    const translations = product.translations.map((tr) => ({
      locale: tr.locale,
      title: tr.name,
      description: tr.description,
    }));

    return {
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      slug: product.slug,
      brand: product.brand,
      status: product.status ?? 'UNKNOWN',
      sourceUrl: product.sourceUrl,
      dataSource: product.dataSource,
      confidence:
        product.confidence != null
          ? typeof product.confidence === 'object'
            ? Number(product.confidence)
            : (product.confidence as number)
          : null,
      isActive: product.isActive,
      createdAt: product.createdAt?.toISOString() ?? null,
      updatedAt: product.updatedAt?.toISOString() ?? null,
      store: product.store,
      category: product.category,
      verdict,
      reviewSummary,
      translations,
      prices,
      agentJobs: product.agentJobs,
    };
  }

  /** Get products that came from discovery pipeline */
  async getProducts(params: { limit: number; offset: number; status?: string }) {
    const { limit, offset, status } = params;

    const where: Record<string, unknown> = {
      sourceUrl: { not: null },
    };

    if (status && status !== 'all') {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          store: true,
          category: true,
          verdict: true,
          reviewSummary: true,
          translations: true,
          prices: {
            orderBy: { scrapedAt: 'desc' },
            take: 10,
            include: { store: true },
          },
          agentJobs: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              agentName: true,
              status: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const normalizedItems = items.map((p) => this.normalizeProduct(p));

    return { items: normalizedItems, total, limit, offset };
  }

  /** Get discovery statistics */
  async getStats() {
    const [
      totalProducts,
      activeProducts,
      totalVerdicts,
      trendSignals,
      aiRunCount,
      legacyRunCount,
      recentAiRuns,
      recentLegacyRuns,
    ] = await Promise.all([
      this.prisma.product.count({ where: { sourceUrl: { not: null } } }),
      this.prisma.product.count({ where: { status: 'ACTIVE', sourceUrl: { not: null } } }),
      this.prisma.verdict.count(),
      this.prisma.trendSignal.count({ where: { source: { startsWith: 'discovery' } } }),
      this.prisma.aiRun.count({ where: { type: AiRunType.DISCOVERY } }),
      this.prisma.agentJob.count({ where: { agentName: 'discovery' } }),
      this.prisma.aiRun.findMany({
        where: { type: AiRunType.DISCOVERY },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          input: true,
          output: true,
          error: true,
          _count: {
            select: {
              steps: true,
              events: true,
              artifacts: true,
            },
          },
        },
      }),
      this.prisma.agentJob.findMany({
        where: { agentName: 'discovery' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          agentName: true,
          status: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          input: true,
          output: true,
          error: true,
        },
      }),
    ]);

    const recentRuns = [
      ...recentAiRuns,
      ...recentLegacyRuns.map((run) => ({
        id: run.id,
        name: run.agentName || 'legacy:discovery',
        status: run.status,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        input: run.input,
        output: run.output,
        error: run.error,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    // Get verdict breakdown
    const verdictBreakdown = await this.prisma.verdict.groupBy({
      by: ['type'],
      _count: true,
    });

    return {
      totalProducts,
      activeProducts,
      totalVerdicts,
      trendSignals,
      discoveryRuns: aiRunCount + legacyRunCount,
      recentRuns,
      verdictBreakdown: verdictBreakdown.map((v) => ({
        type: v.type,
        count: v._count,
      })),
    };
  }

  /** Get current cron config */
  async getConfig(): Promise<DiscoveryConfig> {
    // Try to get next run times from the scheduler
    let amazonNextRun: string | null = null;
    let noonNextRun: string | null = null;

    try {
      const jobs = this.schedulerRegistry.getCronJobs();
      jobs.forEach((job) => {
        const next = job.nextDate();
        if (next) {
          if (job.name === 'discoverAmazonProducts') {
            amazonNextRun = next.toISO() ?? null;
          }
          if (job.name === 'discoverNoonProducts') {
            noonNextRun = next.toISO() ?? null;
          }
        }
      });
    } catch {
      // Scheduler not available
    }

    return {
      amazonCron: this.config.amazonCron,
      noonCron: this.config.noonCron,
      maxProducts: this.config.maxProducts,
      enabled: this.config.enabled,
      amazonNextRun,
      noonNextRun,
    };
  }

  /** Update discovery config */
  async updateConfig(
    updates: Partial<{
      amazonCron: string;
      noonCron: string;
      maxProducts: number;
      enabled: boolean;
    }>,
  ) {
    const old = { ...this.config };
    this.config = { ...this.config, ...updates };
    this.logger.log(`[DiscoveryService] Config updated: ${JSON.stringify(old)} → ${JSON.stringify(this.config)}`);
    return { success: true, config: this.config };
  }
}
