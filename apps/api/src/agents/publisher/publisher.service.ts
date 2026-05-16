import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { QualityGuardService } from '../quality-guard/quality-guard.service';

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qualityGuard: QualityGuardService,
  ) {}

  /**
   * Publish a content page after quality check
   */
  async publishContentPage(contentPageId: string): Promise<{ published: boolean; reason?: string }> {
    const page = await this.prisma.contentPage.findUniqueOrThrow({
      where: { id: contentPageId },
      include: { translations: true },
    });

    const arTranslation = page.translations.find((t) => t.locale === 'ar');
    const enTranslation = page.translations.find((t) => t.locale === 'en');

    if (!arTranslation || !enTranslation) {
      return { published: false, reason: 'Missing translations (need both AR and EN)' };
    }

    // Quality check
    const quality = await this.qualityGuard.checkContent({
      titleAr: arTranslation.title,
      titleEn: enTranslation.title,
      contentAr: arTranslation.content,
      contentEn: enTranslation.content,
    });

    if (!quality.passed) {
      this.logger.warn(`Quality check FAILED for ${page.slug}: ${quality.issues.map((i) => i.message).join(', ')}`);
      return {
        published: false,
        reason: `Quality check failed (${quality.score}/100): ${quality.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`,
      };
    }

    // Publish
    await this.prisma.contentPage.update({
      where: { id: contentPageId },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    // Log to PublishedPost
    await this.prisma.publishedPost.create({
      data: {
        contentPageId,
        channel: 'website',
        metadata: {
          qualityScore: quality.score,
          issueCount: quality.issues.length,
        },
      },
    });

    this.logger.log(`Published: ${page.slug} (quality: ${quality.score}/100)`);
    return { published: true };
  }

  /**
   * Publish a product verdict
   */
  async publishVerdict(productId: string): Promise<{ published: boolean }> {
    const verdict = await this.prisma.verdict.findUnique({ where: { productId } });
    if (!verdict) {
      return { published: false };
    }

    await this.prisma.verdict.update({
      where: { productId },
      data: { isPublished: true },
    });

    this.logger.log(`Verdict published for product ${productId}: ${verdict.type}`);
    return { published: true };
  }
}
