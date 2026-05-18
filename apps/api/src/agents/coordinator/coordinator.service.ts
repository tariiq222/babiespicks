import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DataAcquisitionService } from '../data-acquisition/data-acquisition.service';
import { ReviewAnalyzerService, type ReviewData } from '../review-analyzer/review-analyzer.service';
import { VerdictEngineService } from '../verdict-engine/verdict-engine.service';
import { ContentWriterService } from '../content-writer/content-writer.service';
import { PublisherService } from '../publisher/publisher.service';
import { DiscoveryService, type DiscoverySource } from '../discovery/discovery.service';
import { scrapeReviews } from '../data-acquisition/layers/review-scraper';
import { SEOPlannerService } from '../seo-planner/seo-planner.service';
import { SEOAuditorService } from '../seo-auditor/seo-auditor.service';
import { QualityGuardService } from '../quality-guard/quality-guard.service';
import { CircuitBreakerService } from '../../infrastructure/circuit-breaker/circuit-breaker.service';

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

export interface DiscoveryPipelineResult {
  discovered: number;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ url: string; name: string; success: boolean; error?: string }>;
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
    private readonly discovery: DiscoveryService,
    private readonly seoPlanner: SEOPlannerService,
    private readonly seoAuditor: SEOAuditorService,
    private readonly qualityGuard: QualityGuardService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * Full pipeline: URL -> Product -> Reviews -> Verdict -> Publish
   */
  async runProductPipeline(url: string, storeSlug?: string, reviews?: ReviewData[]): Promise<PipelineResult> {
    const start = Date.now();
    this.logger.log(`=== Pipeline START: ${url} ===`);

    // Pre-flight: check all circuit breakers before proceeding
    await this.circuitBreaker.checkAll();

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
   * Discovery pipeline: Find new products → run full product pipeline for each
   */
  async runDiscoveryPipeline(maxProducts = 10, source: DiscoverySource = 'all'): Promise<DiscoveryPipelineResult> {
    this.logger.log(`=== Discovery Pipeline START (source: ${source}) ===`);

    // Pre-flight: check all circuit breakers before proceeding
    await this.circuitBreaker.checkAll();

    const { discovered, newCandidates, candidates } =
      await this.discovery.discoverProducts(maxProducts, source);

    const results: DiscoveryPipelineResult['results'] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      this.logger.log(
        `Processing candidate ${i + 1}/${candidates.length}: ${candidate.name} (${candidate.url})`,
      );

      try {
        await this.runProductPipeline(candidate.url);
        results.push({ url: candidate.url, name: candidate.name, success: true });
        succeeded++;
      } catch (error) {
        const message = (error as Error).message;
        this.logger.error(`Failed to process ${candidate.url}: ${message}`);
        results.push({ url: candidate.url, name: candidate.name, success: false, error: message });
        failed++;
      }

      // Rate-limit between products
      if (i < candidates.length - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    this.logger.log(
      `=== Discovery Pipeline END: ${succeeded}/${candidates.length} succeeded ===`,
    );

    return {
      discovered,
      total: newCandidates,
      succeeded,
      failed,
      results,
    };
  }

  /**
   * Content pipeline: SEOPlanner → ContentWriter → SEOAuditor (retry ≤2) → QualityGuard → PENDING_APPROVAL
   */
  async runContentPipeline(
    type: 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE',
    topic: string,
    slug: string,
    productIds: string[],
    categoryId?: string,
  ) {
    this.logger.log(`=== Content Pipeline: ${topic} ===`);

    // Pre-flight: check all circuit breakers before proceeding
    await this.circuitBreaker.checkAll();

    // Step 1: SEO Planning
    this.logger.log('Step 1: SEO Planning...');
    const seoBrief = await this.seoPlanner.planContent(type, topic, productIds);
    this.logger.log(`SEO Brief ready: keyword="${seoBrief.primaryKeyword}"`);

    // Step 2: Content Writing (with SEO brief)
    this.logger.log('Step 2: Content Writing...');
    let content = await this.contentWriter.writeContent(type, topic, productIds, seoBrief);
    const page = await this.contentWriter.saveContentPage(type, slug, content, categoryId);

    // Step 3: SEO Audit with retry loop (max 2 retries)
    const MAX_SEO_RETRIES = 2;
    let seoResult = null;
    for (let attempt = 0; attempt <= MAX_SEO_RETRIES; attempt++) {
      this.logger.log(`Step 3: SEO Audit (attempt ${attempt + 1}/${MAX_SEO_RETRIES + 1})...`);
      seoResult = await this.seoAuditor.auditContent({
        titleAr: content.titleAr,
        titleEn: content.titleEn,
        contentAr: content.contentAr,
        contentEn: content.contentEn,
        metaTitleAr: content.metaTitleAr,
        metaTitleEn: content.metaTitleEn,
        metaDescAr: content.metaDescAr,
        metaDescEn: content.metaDescEn,
        slug,
      });

      if (seoResult.passed) {
        this.logger.log(`SEO Audit PASSED: ${seoResult.overallScore}/100`);
        break;
      }

      if (attempt < MAX_SEO_RETRIES) {
        this.logger.warn(`SEO Audit FAILED (${seoResult.overallScore}/100), rewriting content...`);
        // Rewrite with SEO feedback
        content = await this.contentWriter.writeContent(type, topic, productIds, seoBrief, seoResult.suggestions);
        // Update the saved page translations
        await this.prisma.contentPageTranslation.updateMany({
          where: { contentPageId: page.id, locale: 'ar' },
          data: { title: content.titleAr, content: content.contentAr, metaTitle: content.metaTitleAr, metaDescription: content.metaDescAr, excerpt: content.excerptAr },
        });
        await this.prisma.contentPageTranslation.updateMany({
          where: { contentPageId: page.id, locale: 'en' },
          data: { title: content.titleEn, content: content.contentEn, metaTitle: content.metaTitleEn, metaDescription: content.metaDescEn, excerpt: content.excerptEn },
        });
      } else {
        this.logger.warn(`SEO Audit FAILED after ${MAX_SEO_RETRIES + 1} attempts (${seoResult.overallScore}/100)`);
      }
    }

    // Update ContentPage with SEO scores and status
    await this.prisma.contentPage.update({
      where: { id: page.id },
      data: {
        seoScore: seoResult?.overallScore ?? null,
        seoScoreAr: seoResult?.scoreAr ?? null,
        seoScoreEn: seoResult?.scoreEn ?? null,
        status: 'SEO_CHECK',
      },
    });

    // Step 4: Quality Guard
    this.logger.log('Step 4: Quality Guard...');
    const quality = await this.qualityGuard.checkContent({
      titleAr: content.titleAr,
      titleEn: content.titleEn,
      contentAr: content.contentAr,
      contentEn: content.contentEn,
    });

    // Update status based on quality result
    const finalStatus = quality.passed ? 'PENDING_APPROVAL' : 'QUALITY_CHECK';
    await this.prisma.contentPage.update({
      where: { id: page.id },
      data: {
        qualityScore: quality.score,
        status: finalStatus,
      },
    });

    this.logger.log(`Content pipeline: status=${finalStatus}, SEO=${seoResult?.overallScore}/100, Quality=${quality.score}/100`);
    return {
      page,
      seoBrief,
      seoAudit: seoResult,
      qualityCheck: quality,
      status: finalStatus,
    };
  }
}
