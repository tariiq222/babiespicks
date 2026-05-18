import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DataAcquisitionService } from '../data-acquisition/data-acquisition.service';
import { ReviewAnalyzerService, type ReviewData } from '../review-analyzer/review-analyzer.service';
import { VerdictEngineService } from '../verdict-engine/verdict-engine.service';
import { ContentWriterService } from '../content-writer/content-writer.service';
import { PublisherService } from '../publisher/publisher.service';
import { scrapeReviews } from '../data-acquisition/layers/review-scraper';

export interface PipelineResult {
  productId: string;
  productName: string;
  steps: {
    acquisition: 'success' | 'failed';
    reviews: 'success' | 'skipped' | 'failed';
    verdict: 'success' | 'failed';
    publish: 'success' | 'failed';
  };
  totalTimeMs: number;
}

@Injectable()
export class CoordinatorService {
  private readonly logger = new Logger(CoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataAcquisition: DataAcquisitionService,
    private readonly reviewAnalyzer: ReviewAnalyzerService,
    private readonly verdictEngine: VerdictEngineService,
    private readonly contentWriter: ContentWriterService,
    private readonly publisher: PublisherService,
  ) {}

  /**
   * Full pipeline: URL -> Product -> Reviews -> Verdict -> Publish
   */
  async runProductPipeline(url: string, storeSlug?: string, reviews?: ReviewData[]): Promise<PipelineResult> {
    const start = Date.now();
    this.logger.log(`=== Pipeline START: ${url} ===`);

    const result: PipelineResult = {
      productId: '',
      productName: '',
      steps: {
        acquisition: 'failed',
        reviews: 'skipped',
        verdict: 'failed',
        publish: 'failed',
      },
      totalTimeMs: 0,
    };

    // Step 1: Acquire product data
    try {
      const acquisition = await this.dataAcquisition.acquireProductData(url);
      if (!acquisition.success) {
        this.logger.error('Pipeline ABORT: acquisition failed');
        result.totalTimeMs = Date.now() - start;
        return result;
      }

      const product = await this.dataAcquisition.saveProduct(url, {
        success: true,
        data: acquisition.data,
        confidence: acquisition.confidence,
        source: 'schema_org',
        rawSchemas: [],
      }, storeSlug);

      result.productId = product.id;
      result.productName = product.name;
      result.steps.acquisition = 'success';
      this.logger.log(`Step 1 DONE: ${product.name} (${product.id})`);
    } catch (error) {
      this.logger.error(`Step 1 FAILED: ${(error as Error).message}`);
      result.totalTimeMs = Date.now() - start;
      return result;
    }

    // Step 2: Analyze reviews (scrape if not provided)
    try {
      let reviewData = reviews;
      if (!reviewData || reviewData.length === 0) {
        this.logger.log('No reviews provided, attempting to scrape...');
        reviewData = await scrapeReviews(url);
      }

      if (reviewData && reviewData.length > 0) {
        await this.reviewAnalyzer.analyzeReviews(result.productId, reviewData);
        result.steps.reviews = 'success';
        this.logger.log(`Step 2 DONE: ${reviewData.length} reviews analyzed`);
      } else {
        result.steps.reviews = 'skipped';
        this.logger.log('Step 2 SKIPPED: no reviews found');
      }
    } catch (error) {
      this.logger.error(`Step 2 FAILED: ${(error as Error).message}`);
      result.steps.reviews = 'failed';
    }

    // Step 3: Generate verdict
    try {
      await this.verdictEngine.generateVerdict(result.productId);
      result.steps.verdict = 'success';
      this.logger.log('Step 3 DONE: verdict generated');
    } catch (error) {
      this.logger.error(`Step 3 FAILED: ${(error as Error).message}`);
    }

    // Step 4: Publish verdict
    try {
      if (result.steps.verdict === 'success') {
        await this.publisher.publishVerdict(result.productId);
        result.steps.publish = 'success';
        this.logger.log('Step 4 DONE: verdict published');
      }
    } catch (error) {
      this.logger.error(`Step 4 FAILED: ${(error as Error).message}`);
    }

    result.totalTimeMs = Date.now() - start;
    this.logger.log(`=== Pipeline END: ${result.productName} (${result.totalTimeMs}ms) ===`);
    return result;
  }

  /**
   * Content pipeline: Write + Quality Check + Publish
   */
  async runContentPipeline(
    type: 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE',
    topic: string,
    slug: string,
    productIds: string[],
    categoryId?: string,
  ) {
    this.logger.log(`=== Content Pipeline: ${topic} ===`);

    const content = await this.contentWriter.writeContent(type, topic, productIds);
    const page = await this.contentWriter.saveContentPage(type, slug, content, categoryId);
    const published = await this.publisher.publishContentPage(page.id);

    this.logger.log(`Content pipeline: ${published.published ? 'PUBLISHED' : `FAILED: ${published.reason}`}`);
    return { page, published };
  }
}
