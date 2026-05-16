import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { fetchAndExtract, extractFromSchemaOrg, type ExtractionResult } from './layers/schema-org';
import { extractWithAI, type AIExtractionResult } from './layers/ai-extraction';

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
    this.logger.log(`Starting acquisition cascade for: ${url}`);

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
    this.logger.warn(`All layers failed for ${url}. Marking for manual review.`);
    return {
      success: false,
      data: null,
      confidence: 0,
      source: 'manual',
    };
  }

  /**
   * Layer 1: Extract product data from Schema.org markup
   */
  async extractSchemaOrg(url: string): Promise<ExtractionResult> {
    this.logger.log(`Schema.org extraction: ${url}`);
    const result = await fetchAndExtract(url);
    if (result.success) {
      this.logger.log(`Schema.org: Found "${result.data?.name}" (confidence: ${result.confidence})`);
    }
    return result;
  }

  /**
   * Layer 2: AI-based extraction from raw HTML
   */
  async extractAI(html: string, url: string): Promise<AIExtractionResult> {
    this.logger.log(`AI extraction: ${url}`);
    return extractWithAI(html, url);
  }

  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BabiesPicks/1.0; +https://babiespicks.com)',
          'Accept': 'text/html',
          'Accept-Language': 'ar,en;q=0.9',
        },
      });
      if (!response.ok) return null;
      return response.text();
    } catch {
      return null;
    }
  }

  /**
   * Save extracted product to database
   */
  async saveProduct(url: string, result: ExtractionResult, storeSlug?: string) {
    if (!result.success || !result.data) {
      throw new Error('Cannot save: no product data');
    }

    const data = result.data;
    const slug = this.generateSlug(data.name || 'product');

    // Find or create store
    let store = storeSlug
      ? await this.prisma.store.findUnique({ where: { slug: storeSlug } })
      : null;

    const product = await this.prisma.product.create({
      data: {
        name: data.name || 'Unknown Product',
        slug,
        brand: data.brand,
        imageUrl: data.image,
        sourceUrl: url,
        dataSource: 'SCHEMA_ORG',
        confidence: result.confidence,
        storeId: store?.id,
        updatedAt: new Date(),
        translations: {
          create: [
            {
              locale: 'ar',
              name: data.name || 'منتج',
              description: data.description,
              slug,
            },
            {
              locale: 'en',
              name: data.name || 'Product',
              description: data.description,
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
                  originalPrice: data.originalPrice,
                  currency: data.currency || 'SAR',
                  url,
                },
              },
            }
          : {}),
      },
      include: {
        translations: true,
        prices: true,
      },
    });

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
