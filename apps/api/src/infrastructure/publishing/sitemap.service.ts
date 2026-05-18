import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SitemapService {
  private readonly logger = new Logger(SitemapService.name);

  private get siteUrl(): string {
    return process.env.SITE_URL ?? 'https://babiespicks.com';
  }

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Regenerate the full sitemap XML and return the string.
   * Includes products, content pages, and category pages.
   */
  async regenerate(): Promise<string> {
    this.logger.log('Starting sitemap regeneration...');

    const [products, contentPages, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.contentPage.findMany({
        where: { isPublished: true },
        select: { slug: true, type: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.category.findMany({
        select: { slug: true, createdAt: true },
        orderBy: { order: 'asc' },
      }),
    ]);

    const urls: string[] = [];

    // Products — priority 0.8, weekly
    for (const product of products) {
      urls.push(this.buildUrl(`/products/${product.slug}`, product.updatedAt, 'weekly', '0.8'));
    }

    // Content pages — priority 0.9, monthly
    for (const page of contentPages) {
      const segment = this.contentTypeToSegment(page.type);
      urls.push(this.buildUrl(`/${segment}/${page.slug}`, page.updatedAt, 'monthly', '0.9'));
    }

    // Category pages — priority 0.7, weekly
    for (const category of categories) {
      urls.push(this.buildUrl(`/categories/${category.slug}`, category.createdAt, 'weekly', '0.7'));
    }

    const urlCount = urls.length;
    const xml = this.wrapSitemap(urls);

    this.logger.log(`Sitemap regenerated — ${urlCount} URLs (${products.length} products, ${contentPages.length} content, ${categories.length} categories)`);

    return xml;
  }

  private contentTypeToSegment(type: string): string {
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

  private buildUrl(path: string, lastmod: Date, changefreq: string, priority: string): string {
    const loc = `${this.siteUrl}${path}`;
    const lastmodStr = lastmod.toISOString().split('T')[0];
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${lastmodStr}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  }

  private wrapSitemap(urls: string[]): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      '</urlset>',
    ].join('\n');
  }
}
