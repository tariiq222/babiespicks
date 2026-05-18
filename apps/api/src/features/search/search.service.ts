import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhereClause(dto: SearchQueryDto): Prisma.ProductWhereInput {
    const { q, categoryId, minPrice, maxPrice, verdictType } = dto;

    const where: Prisma.ProductWhereInput = { isActive: true };

    // Text search across name, brand, and translations
    if (q && q.length >= 2) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        {
          translations: {
            some: {
              locale: dto.locale,
              name: { contains: q, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    // Category filter
    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Verdict type filter
    if (verdictType) {
      where.verdict = { type: verdictType as any };
    }

    // Price range filter (halalas → SAR, Decimal)
    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceCondition: any = {};
      if (minPrice !== undefined) {
        priceCondition.gte = new Prisma.Decimal(minPrice / 100);
      }
      if (maxPrice !== undefined) {
        priceCondition.lte = new Prisma.Decimal(maxPrice / 100);
      }
      where.prices = { some: { price: priceCondition } };
    }

    // inStock filter — merges with any existing price condition
    if (dto.inStock) {
      where.prices = { some: { ...(where.prices as any)?.some, inStock: true } };
    }

    return where;
  }

  private buildOrderBy(
    sort?: string,
  ): Prisma.ProductOrderByWithRelationInput {
    switch (sort) {
      case 'score_desc':
        return { verdict: { overallScore: 'desc' } };
      case 'price_asc':
        return { prices: { _min: { price: 'asc' } } } as any;
      case 'price_desc':
        return { prices: { _max: { price: 'desc' } } } as any;
      case 'newest':
      default:
        return { createdAt: 'desc' };
    }
  }

  async search(dto: SearchQueryDto) {
    const { limit = 20, cursor, locale = 'ar' } = dto;
    const where = this.buildWhereClause(dto);

    const products = await this.prisma.product.findMany({
      where,
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      include: {
        translations: { where: { locale } },
        verdict: { select: { type: true, overallScore: true } },
        prices: { orderBy: { scrapedAt: 'desc' }, take: 1 },
        category: true,
      },
      orderBy: this.buildOrderBy(dto.sort),
    });

    const total = await this.prisma.product.count({ where });
    const nextCursor = products.length === limit ? products[products.length - 1].id : null;

    return { data: products, total, nextCursor };
  }

  async getFacets(dto: SearchQueryDto) {
    const where = this.buildWhereClause(dto);

    // Category facets
    const categoryCounts = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { ...where, categoryId: { not: null } },
      _count: { categoryId: true },
    });

    const categoryIds = categoryCounts.map((c) => c.categoryId!);
    const categories =
      categoryIds.length > 0
        ? await this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true },
          })
        : [];

    const categoryFacets = categoryCounts.map((c) => ({
      id: c.categoryId!,
      name: categories.find((cat) => cat.id === c.categoryId)?.name || '',
      count: c._count.categoryId,
    }));

    // Verdict type facets
    const verdictCounts = await this.prisma.verdict.groupBy({
      by: ['type'],
      where: {
        product: where as Prisma.ProductWhereInput,
      },
      _count: { type: true },
    });

    const verdictTypeFacets = verdictCounts.map((v) => ({
      type: v.type,
      count: v._count.type,
    }));

    // Price range facets (in SAR buckets)
    const priceRanges = [
      { range: '0-100', min: 0, max: 100 },
      { range: '100-300', min: 100, max: 300 },
      { range: '300-500', min: 300, max: 500 },
      { range: '500-1000', min: 500, max: 1000 },
      { range: '1000+', min: 1000, max: null },
    ];

    const priceRangeFacets = await Promise.all(
      priceRanges.map(async (range) => {
        const rangeWhere: Prisma.ProductWhereInput = { ...where };
        const priceCondition: any = {};

        if (range.min !== null) {
          priceCondition.gte = new Prisma.Decimal(range.min);
        }
        if (range.max !== null) {
          priceCondition.lte = new Prisma.Decimal(range.max);
        }

        // Only apply price range if there isn't already a price filter
        // or if the ranges overlap. For simplicity, we run the count
        // against the base where + this range.
        rangeWhere.prices = { some: { price: priceCondition } };

        const count = await this.prisma.product.count({ where: rangeWhere });
        return { range: range.range, count };
      }),
    );

    // Total matching products
    const total = await this.prisma.product.count({ where });

    // TODO: ProductPrice lacks inStock field — return 0 until schema updated
    const inStockCount = 0;

    return {
      categories: categoryFacets,
      verdictTypes: verdictTypeFacets,
      priceRanges: priceRangeFacets,
      inStockCount,
      total,
    };
  }

  async getSuggestions(dto: SearchQueryDto) {
    const { q, locale = 'ar' } = dto;

    if (!q || q.length < 2) {
      return { suggestions: [] };
    }

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { startsWith: q, mode: 'insensitive' } },
          { brand: { startsWith: q, mode: 'insensitive' } },
          {
            translations: {
              some: {
                locale,
                name: { startsWith: q, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      select: { name: true, brand: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    const suggestions = products.map((p) => ({
      name: p.name,
      brand: p.brand,
    }));

    return { suggestions };
  }
}
