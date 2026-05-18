import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { QualityGuardService } from '../quality-guard/quality-guard.service';
import { IndexNowService } from '../../infrastructure/publishing/indexnow.service';
import { GscIndexingService } from '../../infrastructure/publishing/gsc-indexing.service';
import { SocialCoordinatorService } from '../social/social-coordinator.service';

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  private get siteUrl(): string {
    return process.env.SITE_URL ?? 'https://babiespicks.com';
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly qualityGuard: QualityGuardService,
    private readonly indexNow: IndexNowService,
    private readonly gscIndexing: GscIndexingService,
    private readonly socialCoordinator: SocialCoordinatorService,
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
    await this.postPublishActions(page.slug, page.type);

    // Auto-trigger social pipeline (P4) — fire and forget
    this.socialCoordinator.runSocialPipeline(contentPageId).catch((err: Error) => {
      this.logger.warn(`Social pipeline failed for ${contentPageId}: ${err.message}`);
    });

    return { published: true };
  }

  /**
   * Approve and publish a content page that has been through the full pipeline.
   * Only pages with status APPROVED or SCHEDULED can be published via this method.
   */
  async approveAndPublish(contentPageId: string): Promise<{ published: boolean; reason?: string }> {
    const page = await this.prisma.contentPage.findUniqueOrThrow({
      where: { id: contentPageId },
    });

    if (page.status !== 'APPROVED' && page.status !== 'SCHEDULED') {
      return {
        published: false,
        reason: `Cannot publish: status is ${page.status}, expected APPROVED or SCHEDULED`,
      };
    }

    await this.prisma.contentPage.update({
      where: { id: contentPageId },
      data: {
        isPublished: true,
        publishedAt: new Date(),
        status: 'PUBLISHED',
      },
    });

    await this.prisma.publishedPost.create({
      data: {
        contentPageId,
        channel: 'website',
        metadata: {
          seoScore: page.seoScore,
          qualityScore: page.qualityScore,
        },
      },
    });

    this.logger.log(`Published via approval: ${page.slug}`);
    await this.postPublishActions(page.slug, page.type);

    // Auto-trigger social pipeline (P4) — fire and forget
    this.socialCoordinator.runSocialPipeline(contentPageId).catch((err: Error) => {
      this.logger.warn(`Social pipeline failed for ${contentPageId}: ${err.message}`);
    });

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

  /**
   * Fire-and-forget post-publish actions: IndexNow + Google Indexing API.
   * Sitemap regen is handled separately by the cron job.
   */
  private async postPublishActions(slug: string, type: string): Promise<void> {
    const segment = this.contentTypeToUrlSegment(type);
    const fullUrl = `${this.siteUrl}/${segment}/${slug}`;

    // Run both notifications concurrently; errors are swallowed inside each service
    await Promise.allSettled([
      this.indexNow.notifyAll([fullUrl]),
      this.gscIndexing.requestIndexing(fullUrl),
    ]);
  }

  private contentTypeToUrlSegment(type: string): string {
    switch (type) {
      case 'BEST_LIST':
        return 'best';
      case 'PRODUCT_REVIEW':
        return 'reviews';
      case 'BUYING_GUIDE':
        return 'guides';
      default:
        return 'content';
    }
  }
}
