import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { safeFetch, type SafeFetchOptions } from '../safety/url-safety';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

export type ImageSize = 'thumb' | 'card' | 'full';

const SIZE_MAP: Record<ImageSize, number> = {
  thumb: 200,
  card: 400,
  full: 800,
};

const RESOLVED_UPLOAD_IMAGES_DIR = path.resolve(process.cwd(), 'uploads', 'images');
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const IMAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateImageSlug(slug: string): boolean {
  return typeof slug === 'string' && IMAGE_SLUG_PATTERN.test(slug);
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processImage(sourceUrl: string, productSlug: string): Promise<Record<ImageSize, string>> {
    let logProductSlug = '[invalid-slug]';

    try {
      const safeProductSlug = assertValidImageSlug(productSlug);
      logProductSlug = safeProductSlug;
      const productDir = resolveUploadImagePath(safeProductSlug);
      await fs.mkdir(productDir, { recursive: true });

      const buffer = await downloadSourceImage(sourceUrl);

      const results = {} as Record<ImageSize, string>;

      for (const [sizeName, width] of Object.entries(SIZE_MAP)) {
        const outputPath = resolveUploadImagePath(safeProductSlug, `${sizeName}.webp`);

        await sharp(buffer)
          .resize(width, undefined, { withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(outputPath);

        results[sizeName as ImageSize] = outputPath;
        this.logger.log(`Generated ${sizeName} (${width}px) for ${safeProductSlug}`);
      }

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to process image for ${logProductSlug}: ${error.message}`, error.stack);
      throw error;
    }
  }

  getImagePath(productSlug: string, size: ImageSize): string {
    const safeProductSlug = assertValidImageSlug(productSlug);
    return resolveUploadImagePath(safeProductSlug, `${size}.webp`);
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

function assertValidImageSlug(slug: string): string {
  if (!validateImageSlug(slug)) {
    throw new BadRequestException('productSlug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$');
  }

  return slug;
}

function resolveUploadImagePath(...segments: string[]): string {
  const resolvedPath = path.resolve(RESOLVED_UPLOAD_IMAGES_DIR, ...segments);
  const relativePath = path.relative(RESOLVED_UPLOAD_IMAGES_DIR, resolvedPath);

  if (relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
    return resolvedPath;
  }

  throw new BadRequestException('Resolved image path escapes the upload image directory');
}

/**
 * Downloads an externally hosted product image through the SSRF-safe fetch path
 * and reads at most MAX_SOURCE_IMAGE_BYTES before handing bytes to sharp.
 */
export async function downloadSourceImage(
  sourceUrl: string,
  safeFetchOptions: SafeFetchOptions = {},
): Promise<Buffer> {
  const response = await safeFetch(
    sourceUrl,
    {
      headers: {
        Accept: 'image/*',
        'User-Agent': 'BabiesPicksImageProcessor/1.0',
      },
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    },
    safeFetchOptions,
  );

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Downloaded resource is not an image');
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const declaredSize = Number(contentLength);
    if (!Number.isFinite(declaredSize) || declaredSize < 0) {
      throw new Error('Downloaded image has an invalid content length');
    }

    if (declaredSize > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error('Downloaded image exceeds the maximum allowed size');
    }
  }

  return readBodyWithinLimit(response, MAX_SOURCE_IMAGE_BYTES);
}

async function readBodyWithinLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error('Downloaded image exceeds the maximum allowed size');
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}
