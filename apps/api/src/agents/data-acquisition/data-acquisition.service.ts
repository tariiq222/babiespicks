import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { getTestSafeFetchOptions, getUrlLogTarget, isSafeHttpUrl, safeFetch } from '../../infrastructure/safety/url-safety';
import { extractFromSchemaOrg, type ExtractionResult } from './layers/schema-org';
import { extractWithAI, type AIExtractionResult } from './layers/ai-extraction';
import { readBoundedHtmlResponse } from './html-response';

export type AcquisitionResult = {
  success: boolean;
  data: any;
  confidence: number;
  source: 'schema_org' | 'ai_extraction' | 'manual';
  cost?: any;
};

@Injectable()
export class DataAcquisitionService {
  private readonly logger = new Logger(DataAcquisitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Main cascade: Schema.org -> AI Extraction -> Manual
   */
  async acquireProductData(url: string): Promise<AcquisitionResult> {
    if (!isSafeHttpUrl(url)) {
      this.logger.warn('Rejected unsafe product acquisition URL');
      return this.manualReviewResult();
    }

    this.logger.log(`Starting acquisition cascade for origin: ${getUrlLogTarget(url)}`);

    // Layer 1: Schema.org
    const schemaResult = await this.extractSchemaOrg(url);
    if (schemaResult.success && schemaResult.confidence >= 0.5) {
      this.logger.log(`Layer 1 (Schema.org) succeeded: "${schemaResult.data?.name}" (${schemaResult.confidence})`);
      return {
        success: true,
        data: schemaResult.data,
        confidence: schemaResult.confidence,
        source: 'schema_org',
      };
    }

    // Layer 2: AI Extraction
    this.logger.log('Layer 1 failed or low confidence, trying Layer 2 (AI)...');
    const html = await this.fetchHtml(url);
    if (html) {
      const aiResult = await this.extractAI(html, url);
      if (aiResult.success) {
        this.logger.log(`Layer 2 (AI) succeeded: "${aiResult.data?.name}" (${aiResult.confidence})`);
        return {
          success: true,
          data: aiResult.data,
          confidence: aiResult.confidence,
          source: 'ai_extraction',
          cost: aiResult.cost,
        };
      }
    }

    // Layer 3: Mark for manual review
    this.logger.warn(`All layers failed for origin ${getUrlLogTarget(url)}. Marking for manual review.`);
    return this.manualReviewResult();
  }

  /**
   * Layer 1: Extract product data from Schema.org markup
   */
  async extractSchemaOrg(url: string): Promise<ExtractionResult> {
    if (!isSafeHttpUrl(url)) {
      this.logger.warn('Rejected unsafe Schema.org extraction URL');
      return { success: false, data: null, confidence: 0, source: 'schema_org', rawSchemas: [] };
    }

    this.logger.log(`Schema.org extraction for origin: ${getUrlLogTarget(url)}`);
    const html = await this.fetchHtml(url);
    if (!html) {
      return { success: false, data: null, confidence: 0, source: 'schema_org', rawSchemas: [] };
    }

    const result = await extractFromSchemaOrg(html, url);
    if (result.success) {
      this.logger.log(`Schema.org: Found "${result.data?.name}" (confidence: ${result.confidence})`);
    }
    return result;
  }

  /**
   * Layer 2: AI-based extraction from raw HTML
   */
  async extractAI(html: string, url: string): Promise<AIExtractionResult> {
    this.logger.log(`AI extraction for origin: ${getUrlLogTarget(url)}`);
    return extractWithAI(html, url);
  }

  private async fetchHtml(url: string): Promise<string | null> {
    if (!isSafeHttpUrl(url)) {
      this.logger.warn('Rejected unsafe HTML fetch URL');
      return null;
    }

    try {
      const response = await safeFetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
      }, {
        maxRedirects: 5,
        ...getTestSafeFetchOptions(),
      });
      return readBoundedHtmlResponse(response);
    } catch {
      return null;
    }
  }

  private manualReviewResult(): AcquisitionResult {
    return {
      success: false,
      data: null,
      confidence: 0,
      source: 'manual',
    };
  }

  /**
   * Save extracted product to database
   */
  async saveProduct(url: string, result: AcquisitionResult, storeSlug?: string) {
    if (!result.success || !result.data) {
      throw new Error('Cannot save: no product data');
    }

    const data = result.data;
    // Guard against missing/empty names — never allow null into DB
    const name = (data.name || '').trim() || 'Unknown Product';
    const description = (data.description || '').trim() || null;
    const slug = this.generateSlug(name);

    // Find or create store
    const store = storeSlug
      ? await this.prisma.store.findUnique({ where: { slug: storeSlug } })
      : null;

    const dataSource = result.source === 'schema_org' ? 'SCHEMA_ORG' : 'AI_EXTRACTION';

    const product = await this.prisma.product.upsert({
      where: { sourceUrl: url },
      create: {
        name,
        slug,
        brand: data.brand || null,
        imageUrl: data.image || null,
        sourceUrl: url,
        dataSource,
        confidence: result.confidence,
        storeId: store?.id ?? null,
        updatedAt: new Date(),
        translations: {
          create: [
            {
              locale: 'ar',
              name,
              description,
              slug,
            },
            {
              locale: 'en',
              name,
              description,
              slug,
            },
          ],
        },
        ...(data.price && store
          ? {
              prices: {
                create: {
                  storeId: store.id,
                  price: data.price,
                  originalPrice: data.originalPrice ?? null,
                  currency: data.currency || 'SAR',
                  url,
                },
              },
            }
          : {}),
      },
      update: {
        name,                       // never undefined — always set
        brand: data.brand || null,
        imageUrl: data.image || null,
        dataSource,
        confidence: result.confidence,
        ...(store ? { storeId: store.id } : {}),
        updatedAt: new Date(),
      },
      include: {
        translations: true,
        prices: true,
      },
    });

    // Sync translations on update (upsert block above only creates on insert)
    await this.prisma.$transaction([
      this.prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale: 'ar' } },
        create: { productId: product.id, locale: 'ar', name, description, slug },
        update: { name, description, slug },
      }),
      this.prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale: 'en' } },
        create: { productId: product.id, locale: 'en', name, description, slug },
        update: { name, description, slug },
      }),
    ]);

    this.logger.log(`Saved product: ${product.name} (${product.id})`);
    return product;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 100)
      + '-' + Date.now().toString(36);
  }
}
