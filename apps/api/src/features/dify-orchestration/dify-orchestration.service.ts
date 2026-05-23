import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DiscoveryService } from '../../agents/discovery/discovery.service';
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
import {
  MarketplaceSearchDto,
  MarketplaceSearchResult,
} from './dto/marketplace-search.dto';
import { ProcessProductDto, ProcessProductResult } from './dto/process-product.dto';

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
}
