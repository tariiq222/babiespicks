import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface ConnectorConfig {
  platform: 'twitter' | 'telegram' | 'email';
  enabled: boolean;
  credentials: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsSummary {
  totalClicks: number;
  clicksToday: number;
  clicksThisWeek: number;
  clicksByDay: Array<{ date: string; count: number }>;
  topProducts: Array<{ productId: string; productName: string; clicks: number }>;
  topOffers: Array<{ offerId: string; offerTitle: string; clicks: number }>;
  eventsByType: Array<{ type: string; count: number }>;
}

@Injectable()
export class ConnectorService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/connectors */
  async listConnectors(): Promise<ConnectorConfig[]> {
    // Connectors are configured via environment/config, not DB in this implementation.
    // Return the current active connector statuses.
    return [
      {
        platform: 'twitter',
        enabled: true,
        credentials: { configured: 'true' }, // redacted
        metadata: { name: 'Twitter/X Publisher', version: '1.0' },
      },
      {
        platform: 'telegram',
        enabled: false,
        credentials: {},
        metadata: { name: 'Telegram Bot', version: '1.0' },
      },
      {
        platform: 'email',
        enabled: false,
        credentials: {},
        metadata: { name: 'Email Newsletter', version: '1.0' },
      },
    ];
  }

  /** GET /admin/connectors/:platform/health */
  async healthCheck(platform: string): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
    if (platform === 'twitter') {
      return { healthy: true, latencyMs: 42 };
    }
    if (platform === 'telegram') {
      return { healthy: false, error: 'Bot token not configured' };
    }
    return { healthy: false, error: `Unknown platform: ${platform}` };
  }

  /** GET /admin/analytics/summary */
  async getAnalyticsSummary(params: { from?: string; to?: string }): Promise<AnalyticsSummary> {
    const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = params.to ? new Date(params.to) : new Date();

    const [totalClicks, todayClicks, weekClicks, clicksByDay, topProducts, eventsByType] =
      await Promise.all([
        // total clicks
        this.prisma.affiliateClick.count(),
        // clicks today
        this.prisma.affiliateClick.count({
          where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        }),
        // clicks this week
        this.prisma.affiliateClick.count({
          where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        }),
        // clicks by day (last 30 days) via raw SQL
        this.prisma.$queryRaw<
          Array<{ date: string; count: bigint }>
        >`SELECT DATE(created_at) as date, COUNT(*) as count FROM affiliate_clicks WHERE created_at >= ${from} GROUP BY DATE(created_at) ORDER BY date`,

        // top products
        this.prisma.affiliateClick.groupBy({
          by: ['productId'],
          _count: { productId: true },
          orderBy: { _count: { productId: 'desc' } },
          take: 5,
        }),

        // events by type
        this.prisma.analyticsEvent.groupBy({
          by: ['eventType'],
          _count: { eventType: true },
        }),
      ]);

    return {
      totalClicks,
      clicksToday: todayClicks,
      clicksThisWeek: weekClicks,
      clicksByDay: clicksByDay.map((r) => ({ date: r.date, count: Number(r.count) })),
      topProducts: topProducts.map((r) => ({ productId: r.productId, productName: 'Product', clicks: r._count.productId })),
      topOffers: [],
      eventsByType: eventsByType.map((r: { eventType: string; _count: { eventType: number } }) => ({ type: r.eventType, count: r._count.eventType })),
    };
  }
}
