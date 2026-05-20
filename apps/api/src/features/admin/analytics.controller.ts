import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  // Analytics data: products, content pages, affiliate clicks
  @Get('analytics')
  async getAnalytics() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Product stats
    const [
      totalProducts,
      productsWithVerdict,
      contentTypeCounts,
      totalClicks,
      clicksLast7Days,
      topProductsByClicks,
      publishedContentCount,
    ] = await Promise.all([
      // Total products
      this.prisma.product.count(),
      // Products that have at least one verdict
      this.prisma.verdict.count(),
      // Content pages by type
      this.prisma.contentPage.groupBy({
        by: ['type'],
        _count: true,
      }),
      // Total affiliate clicks
      this.prisma.affiliateClick.count(),
      // Clicks in last 7 days
      this.prisma.affiliateClick.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      // Top 5 products by clicks (raw SQL for ordering)
      this.prisma.$queryRaw<{ productId: string; clickCount: bigint }[]>`
        SELECT "productId", COUNT(*)::bigint AS "clickCount"
        FROM "affiliate_clicks"
        GROUP BY "productId"
        ORDER BY "clickCount" DESC
        LIMIT 5
      `,
      // Total published content pages
      this.prisma.contentPage.count({ where: { isPublished: true } }),
    ]);

    const totalContentPages = contentTypeCounts.reduce((sum, c) => sum + c._count, 0);
    const bestListsCount = contentTypeCounts.find((c) => c.type === 'BEST_LIST')?._count ?? 0;
    const productReviewsCount = contentTypeCounts.find((c) => c.type === 'PRODUCT_REVIEW')?._count ?? 0;
    const buyingGuidesCount = contentTypeCounts.find((c) => c.type === 'BUYING_GUIDE')?._count ?? 0;

    const topProducts = await Promise.all(
      topProductsByClicks.map(async (row) => {
        const product = await this.prisma.product.findUnique({
          where: { id: row.productId },
          include: { translations: { where: { locale: 'ar' }, take: 1 } },
        });
        return {
          productId: row.productId,
          clickCount: Number(row.clickCount),
          productName: product?.translations[0]?.name ?? row.productId,
        };
      }),
    );

    // SEO proxy stats (approximate — static analysis based on content pages)
    // Products with meta descriptions = products that have translations with metaDescription set
    const productsWithMeta = await this.prisma.productTranslation.count({
      where: { metaDescription: { not: null } },
    });

    return {
      products: {
        total: totalProducts,
        withVerdict: productsWithVerdict,
        withoutVerdict: totalProducts - productsWithVerdict,
        coveragePercent:
          totalProducts > 0 ? Math.round((productsWithVerdict / totalProducts) * 100) : 0,
      },
      content: {
        total: totalContentPages,
        published: publishedContentCount,
        byType: {
          BEST_LIST: bestListsCount,
          PRODUCT_REVIEW: productReviewsCount,
          BUYING_GUIDE: buyingGuidesCount,
        },
      },
      affiliate: {
        totalClicks: totalClicks,
        clicksLast7Days: clicksLast7Days,
        topProducts,
      },
      seo: {
        productsWithMeta,
        productsMissingMeta: totalProducts - productsWithMeta,
      },
    };
  }
}
