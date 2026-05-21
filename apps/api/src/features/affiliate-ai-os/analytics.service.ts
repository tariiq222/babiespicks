import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface AnalyticsOverview {
  totalClicks: number;
  clicksToday: number;
  clicksThisWeek: number;
  totalConversions: number;
  conversionsToday: number;
  topProducts: Array<{ productId: string; productName: string; clicks: number; conversions: number }>;
  clicksByDay: Array<{ date: string; count: number }>;
  conversionsByDay: Array<{ date: string; count: number }>;
  eventsByType: Array<{ type: string; count: number }>;
  offersPublished: number;
  socialPostsPublished: number;
}

export interface OfferAnalytics {
  offerId: string;
  offerTitle: string;
  totalClicks: number;
  totalConversions: number;
  conversionRate: number;
  clicksByDay: Array<{ date: string; count: number }>;
  topTrafficSources: Array<{ source: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

export interface SocialAnalytics {
  socialPostId: string;
  platform: string;
  totalImpressions: number;
  totalClicks: number;
  engagementRate: number;
  clicksByDay: Array<{ date: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/analytics/overview */
  async getOverview(): Promise<AnalyticsOverview> {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalClicks,
      clicksToday,
      clicksThisWeek,
      clicksByDay,
      topProducts,
      eventsByType,
      offersPublished,
      socialPostsPublished,
    ] = await Promise.all([
      this.prisma.affiliateClick.count(),
      this.prisma.affiliateClick.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.affiliateClick.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM affiliate_clicks
        WHERE created_at >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        GROUP BY DATE(created_at)
        ORDER BY date`,

      this.prisma.affiliateClick.groupBy({
        by: ['productId'],
        _count: { productId: true },
        orderBy: { _count: { productId: 'desc' } },
        take: 5,
      }),

      this.prisma.analyticsEvent.groupBy({
        by: ['eventType'],
        _count: { eventType: true },
      }),

      this.prisma.publicOffer.count({ where: { publishedAt: { not: null } } }),
      this.prisma.socialPost.count({ where: { publishedAt: { not: null } } }),
    ]);

    return {
      totalClicks,
      clicksToday,
      clicksThisWeek,
      totalConversions: 0,
      conversionsToday: 0,
      clicksByDay: clicksByDay.map((r) => ({ date: r.date, count: Number(r.count) })),
      conversionsByDay: [],
      topProducts: topProducts.map((r) => ({
        productId: r.productId,
        productName: 'Product',
        clicks: r._count.productId,
        conversions: 0,
      })),
      eventsByType: eventsByType.map((r: { eventType: string; _count: { eventType: number } }) => ({
        type: r.eventType,
        count: r._count.eventType,
      })),
      offersPublished,
      socialPostsPublished,
    };
  }

  /** GET /admin/analytics/offers/:id */
  async getOfferAnalytics(offerId: string): Promise<OfferAnalytics> {
    const clicks = await this.prisma.affiliateClick.groupBy({
      by: ['productId'],
      _count: { productId: true },
      where: { productId: offerId },
    });

    const totalClicks = clicks.reduce((sum, r) => sum + r._count.productId, 0);

    return {
      offerId,
      offerTitle: 'Offer',
      totalClicks,
      totalConversions: 0,
      conversionRate: totalClicks > 0 ? 0 : 0,
      clicksByDay: [],
      topTrafficSources: [],
      topCountries: [],
    };
  }

  /** GET /admin/analytics/social/:id */
  async getSocialAnalytics(socialPostId: string): Promise<SocialAnalytics | null> {
    const post = await this.prisma.socialPost.findUnique({ where: { id: socialPostId } });
    if (!post) return null;

    return {
      socialPostId,
      platform: post.platform,
      totalImpressions: 0,
      totalClicks: 0,
      engagementRate: 0,
      clicksByDay: [],
      topCountries: [],
    };
  }
}
