import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ArabClicksService } from './networks/arabclicks.service';
import { AdmitadService } from './networks/admitad.service';
import { AmazonAssociatesService } from './networks/amazon.service';
import { NoonAffiliateService } from './networks/noon.service';

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
    private readonly amazon: AmazonAssociatesService,
    private readonly noon: NoonAffiliateService,
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

  /**
   * Persists affiliate-wrapped URLs for all ProductPrice rows of a product.
   * Wraps raw URLs with the appropriate network deep-link wrapper.
   * Idempotent: already-wrapped URLs are skipped.
   * Networks: Noon (s.noon.com), ArabClicks (arabclicks.com/click), Admitad (ad.admitad.com/g).
   *
   * @param db - Optional transaction-capable Prisma client (e.g. tx from $transaction).
   *             Defaults to this.prisma when omitted.
   */
  async persistAffiliateUrlsForProduct(
    productId: string,
    db?: Pick<PrismaService, 'productPrice'>,
  ): Promise<number> {
    const client = db ?? this.prisma;
    const prices = await client.productPrice.findMany({
      where: { productId, url: { not: null } },
      include: { store: { select: { affiliateNetwork: true, slug: true } } },
    });

    const updates: Promise<unknown>[] = [];

    for (const price of prices) {
      const rawUrl = price.url;
      if (!rawUrl) continue;

      const wrappedUrl = this.wrapAffiliateUrl(rawUrl, price.store);
      if (wrappedUrl !== rawUrl) {
        updates.push(
          client.productPrice.update({
            where: { id: price.id },
            data: { url: wrappedUrl },
          }),
        );
      }
    }

    if (updates.length === 0) return 0;
    await Promise.all(updates);
    return updates.length;
  }

  /**
   * Wraps a raw product URL with the appropriate affiliate network deep-link.
   * Idempotent: returns the URL unchanged if already wrapped.
   */
  private wrapAffiliateUrl(
    rawUrl: string,
    store: { affiliateNetwork: string | null; slug?: string | null },
  ): string {
    // Noon: skip if already wrapped (s.noon.com)
    if (rawUrl.includes('s.noon.com')) return rawUrl;
    if (this.noon.isNoonStore({ ...store, slug: store.slug ?? undefined }) || this.noon.isNoonUrl(rawUrl)) {
      return this.noon.generateAffiliateUrl(rawUrl);
    }

    // ArabClicks: skip if already wrapped (arabclicks.com/click)
    if (rawUrl.includes('arabclicks.com/click')) return rawUrl;
    if (this.arabClicks.isArabClicksStore(store)) {
      return this.arabClicks.generateDeepLink(rawUrl);
    }

    // Admitad: skip if already wrapped (ad.admitad.com/g)
    if (rawUrl.includes('ad.admitad.com/g')) return rawUrl;
    if (this.admitad.isAdmitadStore(store)) {
      return this.admitad.generateDeepLink(rawUrl);
    }

    // Amazon
    if (this.amazon.isAmazonStore(store) || this.amazon.isAmazonUrl(rawUrl)) {
      return this.amazon.generateAffiliateUrl(rawUrl);
    }

    return rawUrl;
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
      });

      if (price?.url) {
        return {
          url: price.url,
          storeId: price.storeId,
          price: price.price.toNumber(),
          currency: price.currency,
        };
      }

      // storeId was explicitly requested — do NOT fall back to best price
      throw new NotFoundException(
        `No affiliate URL found for product ${productId} at store ${storeId}`,
      );
    }

    // No storeId → use best price (legacy /best/:productId path)
    const best = await this.getBestPrice(productId);
    if (best) {
      return best;
    }

    throw new NotFoundException(
      `No affiliate URL found for product ${productId}`,
    );
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
