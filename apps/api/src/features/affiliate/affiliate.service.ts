import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ArabClicksService } from './networks/arabclicks.service';
import { AdmitadService } from './networks/admitad.service';

export interface ClickStatsDto {
  totalClicks: number;
  byStore: Array<{ storeId: string; storeName: string; count: number }>;
  byDay: Array<{ date: string; count: number }>;
  byProduct: Array<{ productId: string; productName: string; count: number }>;
}

@Injectable()
export class AffiliateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arabClicks: ArabClicksService,
    private readonly admitad: AdmitadService,
  ) {}

  async getBestPrice(
    productId: string,
  ): Promise<{
    storeId: string;
    price: number;
    url: string;
    currency: string;
  } | null> {
    const price = await this.prisma.productPrice.findFirst({
      where: {
        productId,
        url: { not: null },
      },
      orderBy: { price: 'asc' },
    });

    if (!price?.url) {
      return null;
    }

    return {
      storeId: price.storeId,
      price: price.price.toNumber(),
      url: price.url,
      currency: price.currency,
    };
  }

  async getSmartRedirectUrl(
    productId: string,
    storeId?: string,
    _country?: string,
  ): Promise<{
    url: string;
    storeId: string;
    price: number;
    currency: string;
  }> {
    if (storeId) {
      const price = await this.prisma.productPrice.findFirst({
        where: { productId, storeId, url: { not: null } },
        orderBy: { scrapedAt: 'desc' },
        include: { store: { select: { affiliateNetwork: true } } },
      });

      if (price?.url) {
        const resolvedUrl = this.resolveAffiliateUrl(price.url, price.store);
        return {
          url: resolvedUrl,
          storeId: price.storeId,
          price: price.price.toNumber(),
          currency: price.currency,
        };
      }
    }

    const best = await this.getBestPrice(productId);
    if (best) {
      // Re-fetch store network for best-price result to apply affiliate wrapping if needed
      const store = await this.prisma.store.findUnique({
        where: { id: best.storeId },
        select: { affiliateNetwork: true },
      });
      if (store) {
        best.url = this.resolveAffiliateUrl(best.url, store);
      }
      return best;
    }

    throw new NotFoundException(
      `No affiliate URL found for product ${productId}`,
    );
  }

  /**
   * Resolves the final affiliate URL for a given raw product URL and store.
   * Applies network-specific deep link wrapping based on the store's affiliateNetwork.
   */
  private resolveAffiliateUrl(
    rawUrl: string,
    store: { affiliateNetwork: string | null },
  ): string {
    if (this.arabClicks.isArabClicksStore(store)) {
      return this.arabClicks.generateDeepLink(rawUrl);
    }
    if (this.admitad.isAdmitadStore(store)) {
      return this.admitad.generateDeepLink(rawUrl);
    }
    return rawUrl;
  }

  async getClickStats(
    productId?: string,
    days = 7,
  ): Promise<ClickStatsDto> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const where = {
      createdAt: { gte: since },
      ...(productId ? { productId } : {}),
    };

    const [totalClicks, byStoreRaw, byProductRaw, byDayRaw] = await Promise.all([
      this.prisma.affiliateClick.count({ where }),

      this.prisma.affiliateClick.groupBy({
        by: ['storeId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      this.prisma.affiliateClick.groupBy({
        by: ['productId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 50,
      }),

      this.prisma.affiliateClick.findMany({
        where,
        select: { createdAt: true },
      }),
    ]);

    const storeIds = byStoreRaw.map((s) => s.storeId);
    const stores =
      storeIds.length > 0
        ? await this.prisma.store.findMany({
            where: { id: { in: storeIds } },
            select: { id: true, name: true },
          })
        : [];
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));

    const productIds = byProductRaw.map((p) => p.productId);
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    // Group by day in memory
    const dayMap = new Map<string, number>();
    for (const click of byDayRaw) {
      const dateKey = click.createdAt.toISOString().split('T')[0];
      dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + 1);
    }
    const byDay = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalClicks,
      byStore: byStoreRaw.map((s) => ({
        storeId: s.storeId,
        storeName: storeMap.get(s.storeId) || s.storeId,
        count: s._count.id,
      })),
      byProduct: byProductRaw.map((p) => ({
        productId: p.productId,
        productName: productMap.get(p.productId) || p.productId,
        count: p._count.id,
      })),
      byDay,
    };
  }

  async getTopProducts(
    limit = 10,
  ): Promise<
    Array<{ productId: string; productName: string; clickCount: number }>
  > {
    const raw = await this.prisma.affiliateClick.groupBy({
      by: ['productId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    const productIds = raw.map((r) => r.productId);
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    return raw.map((r) => ({
      productId: r.productId,
      productName: productMap.get(r.productId) || r.productId,
      clickCount: r._count.id,
    }));
  }
}
