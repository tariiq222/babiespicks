import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DiscoveryService } from '../../agents/discovery/discovery.service';
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
import {
  MarketplaceSearchDto,
  MarketplaceSearchResult,
} from './dto/marketplace-search.dto';
import { ProcessProductDto, ProcessProductResult } from './dto/process-product.dto';
import {
  RunStartDto,
  RunFinishDto,
  RunStartResult,
  RunFinishResult,
} from './dto/run-lifecycle.dto';

@Injectable()
export class DifyOrchestrationService {
  private readonly logger = new Logger(DifyOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly coordinator: CoordinatorService,
  ) {}

  async searchMarketplace(dto: MarketplaceSearchDto): Promise<MarketplaceSearchResult> {
    const normalized = dto.name.toLowerCase().trim();

    let existing = await this.prisma.product.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true, sourceUrl: true, store: { select: { slug: true } } },
    });

    if (!existing && normalized.length >= 10) {
      existing = await this.prisma.product.findFirst({
        where: { name: { contains: normalized, mode: 'insensitive' } },
        select: { id: true, sourceUrl: true, store: { select: { slug: true } } },
      });
    }

    if (existing) {
      this.logger.log(`Marketplace search hit existing product ${existing.id}`);
      return {
        url: existing.sourceUrl ?? '',
        platform: (existing.store?.slug === 'amazon' ? 'amazon' : 'noon') as 'noon' | 'amazon',
        sku: null,
        available: true,
        existing_product_id: existing.id,
      };
    }

    const found = await this.discovery.findOnMarketplace(dto.name, dto.category);
    if (!found) {
      return { url: '', platform: 'noon', sku: null, available: false };
    }
    return { ...found, available: true };
  }

  /**
   * Run the existing product pipeline (acquisition → reviews → verdict → publish)
   * and tag any ContentPage produced for this product with Dify discovery metadata.
   *
   * NOTE on the ContentPage<->Product relation: ContentPage has no foreign key to
   * Product in the current Prisma schema; products are wired in through the content
   * writer's productIds input but not persisted on the page row. Until a join is
   * added, we locate the page by taking the most-recent PRODUCT_REVIEW page created
   * after the pipeline started. This is best-effort and may match nothing if the
   * pipeline didn't create a page (which is the current default for runProductPipeline).
   */
  async processProduct(dto: ProcessProductDto): Promise<ProcessProductResult> {
    const pipelineStartedAt = new Date();
    const result = await this.coordinator.runProductPipeline(dto.url, dto.platform, undefined);

    const allSuccess =
      result.steps.acquisition === 'success' &&
      result.steps.verdict === 'success' &&
      result.steps.publish === 'success';

    let contentPageId: string | null = null;

    if (allSuccess && result.productId) {
      const page = await this.prisma.contentPage.findFirst({
        where: {
          type: 'PRODUCT_REVIEW',
          createdAt: { gte: pipelineStartedAt },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (page) {
        contentPageId = page.id;
        await this.prisma.contentPage.update({
          where: { id: page.id },
          data: {
            discoverySource: 'dify-workflow',
            trendScore: dto.trend_score ?? null,
            difyRunId: dto.dify_run_id ?? null,
          },
        });
      } else {
        this.logger.warn(
          `processProduct: no PRODUCT_REVIEW ContentPage found for product ${result.productId}; skipping metadata tag`,
        );
      }
    }

    return {
      product_id: result.productId,
      content_page_id: contentPageId,
      status: allSuccess ? 'PENDING_APPROVAL' : 'FAILED',
      summary: {
        acquisition: result.steps.acquisition,
        reviews: result.steps.reviews,
        verdict: result.steps.verdict,
        publish: result.steps.publish,
        time_ms: result.totalTimeMs,
      },
    };
  }

  async startRun(dto: RunStartDto): Promise<RunStartResult> {
    const run = await this.prisma.difyRun.create({
      data: {
        triggeredBy: dto.triggered_by,
        totalCandidates: dto.total_candidates ?? 0,
      },
      select: { id: true },
    });
    this.logger.log(`Dify run started: ${run.id} (triggered_by=${dto.triggered_by})`);
    return { dify_run_id: run.id };
  }

  /**
   * Admin endpoint: list the most recent Dify runs.
   * Returned shape uses snake_case for direct UI consumption.
   */
  async listRuns(limit: number): Promise<
    Array<{
      id: string;
      started_at: string;
      finished_at: string | null;
      triggered_by: string;
      total_candidates: number;
      succeeded: number;
      failed: number;
      status: 'running' | 'completed' | 'failed';
    }>
  > {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 20), 100);
    const runs = await this.prisma.difyRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: safeLimit,
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        triggeredBy: true,
        totalCandidates: true,
        succeeded: true,
        failed: true,
        error: true,
      },
    });
    return runs.map((run) => ({
      id: run.id,
      started_at: run.startedAt.toISOString(),
      finished_at: run.finishedAt ? run.finishedAt.toISOString() : null,
      triggered_by: run.triggeredBy,
      total_candidates: run.totalCandidates,
      succeeded: run.succeeded,
      failed: run.failed,
      status: !run.finishedAt
        ? ('running' as const)
        : run.error
        ? ('failed' as const)
        : ('completed' as const),
    }));
  }

  /**
   * Admin endpoint: list products associated with a run.
   * Strategy: prefer direct ContentPage.difyRunId link; if none found,
   * fall back to a timestamp window [started_at, finished_at + 1min].
   */
  async getRunProducts(runId: string): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      source: string | null;
      trend_score: number | null;
      created_at: string;
      content_page_id: string | null;
    }>
  > {
    const run = await this.prisma.difyRun.findUnique({
      where: { id: runId },
      select: { startedAt: true, finishedAt: true },
    });
    if (!run) return [];

    // First try: pages with explicit relation to this run
    const linkedPages = await this.prisma.contentPage.findMany({
      where: { difyRunId: runId },
      select: { id: true, trendScore: true, discoverySource: true, createdAt: true },
    });

    const windowEnd = run.finishedAt
      ? new Date(run.finishedAt.getTime() + 60_000)
      : new Date();

    // Fetch products created within the run window.
    const products = await this.prisma.product.findMany({
      where: {
        createdAt: { gte: run.startedAt, lte: windowEnd },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        dataSource: true,
      },
    });

    return products.map((product) => {
      // Best-effort association: pick any linked page (we can't FK products
      // to runs in the current schema; this is for UX hinting only).
      const linked = linkedPages[0];
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        source: linked?.discoverySource ?? String(product.dataSource ?? ''),
        trend_score: linked?.trendScore ?? null,
        created_at: product.createdAt.toISOString(),
        content_page_id: linked?.id ?? null,
      };
    });
  }

  /**
   * Admin endpoint: kick off the Dify discovery workflow.
   * Reads DIFY_BASE_URL, DIFY_WORKFLOW_API_KEY, DIFY_DISCOVERY_WORKFLOW_ID
   * from env. Returns the Dify workflow_run_id + status.
   */
  async triggerWorkflow(): Promise<{ workflow_run_id: string; status: string }> {
    const base = process.env.DIFY_BASE_URL;
    const key = process.env.DIFY_WORKFLOW_API_KEY;
    const workflowId = process.env.DIFY_DISCOVERY_WORKFLOW_ID;

    if (!base || !key || !workflowId) {
      throw new Error(
        'Dify env not configured (DIFY_BASE_URL, DIFY_WORKFLOW_API_KEY, DIFY_DISCOVERY_WORKFLOW_ID)',
      );
    }

    const response = await fetch(`${base}/v1/workflows/${workflowId}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: { max_products: 10, triggered_by: 'admin' },
        user: 'admin-ui',
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '<no body>');
      throw new Error(`Dify trigger failed: HTTP ${response.status} ${detail}`);
    }
    const data = (await response.json()) as {
      workflow_run_id?: string;
      status?: string;
    };
    this.logger.log(`Dify workflow triggered: ${data.workflow_run_id}`);
    return {
      workflow_run_id: data.workflow_run_id ?? '',
      status: data.status ?? 'started',
    };
  }

  async finishRun(dto: RunFinishDto): Promise<RunFinishResult> {
    const run = await this.prisma.difyRun.update({
      where: { id: dto.dify_run_id },
      data: {
        finishedAt: new Date(),
        succeeded: dto.succeeded,
        failed: dto.failed,
        error: dto.error
          ? typeof dto.error === 'string'
            ? { message: dto.error }
            : (dto.error as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
      select: {
        id: true,
        totalCandidates: true,
        succeeded: true,
        failed: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    this.logger.log(
      `Dify run finished: ${run.id} succeeded=${run.succeeded} failed=${run.failed}`,
    );
    return {
      dify_run_id: run.id,
      total_candidates: run.totalCandidates,
      succeeded: run.succeeded,
      failed: run.failed,
      started_at: run.startedAt.toISOString(),
      finished_at: run.finishedAt!.toISOString(),
    };
  }
}
