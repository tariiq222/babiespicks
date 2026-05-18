import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

export type ImageSize = 'thumb' | 'card' | 'full';

const SIZE_MAP: Record<ImageSize, number> = {
  thumb: 200,
  card: 400,
  full: 800,
};

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'images');

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processImage(sourceUrl: string, productSlug: string): Promise<Record<ImageSize, string>> {
    try {
      const productDir = path.join(UPLOAD_DIR, productSlug);
      await fs.mkdir(productDir, { recursive: true });

      const response = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      const results = {} as Record<ImageSize, string>;

      for (const [sizeName, width] of Object.entries(SIZE_MAP)) {
        const outputPath = path.join(productDir, `${sizeName}.webp`);

        await sharp(buffer)
          .resize(width, undefined, { withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(outputPath);

        results[sizeName as ImageSize] = outputPath;
        this.logger.log(`Generated ${sizeName} (${width}px) for ${productSlug}`);
      }

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to process image for ${productSlug}: ${error.message}`, error.stack);
      throw error;
    }
  }

  getImagePath(productSlug: string, size: ImageSize): string {
    return path.join(UPLOAD_DIR, productSlug, `${size}.webp`);
  }

  async processAllProducts(): Promise<{ processed: number; failed: number; errors: string[] }> {
    const products = await this.prisma.product.findMany({
      where: { imageUrl: { not: null } },
      select: { slug: true, imageUrl: true },
    });

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const product of products) {
      if (!product.imageUrl) continue;

      try {
        await this.processImage(product.imageUrl, product.slug);
        results.processed++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${product.slug}: ${error.message}`);
        this.logger.error(`Batch processing failed for ${product.slug}`, error.message);
      }
    }

    return results;
  }
}
