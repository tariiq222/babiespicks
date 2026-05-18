import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { FindProductsDto } from './dto/find-products.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindProductsDto) {
    const { limit = 20, cursor, locale = 'ar', categorySlug } = dto;

    const where: any = { isActive: true };

    if (categorySlug) {
      where.category = { slug: categorySlug };
    }

    const products = await this.prisma.product.findMany({
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      where,
      include: {
        translations: { where: { locale } },
        category: { select: { id: true, name: true, slug: true } },
        verdict: { select: { type: true, overallScore: true } },
        prices: {
          orderBy: { scrapedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const nextCursor = products.length === limit ? products[products.length - 1].id : null;

    return {
      data: products,
      nextCursor,
    };
  }

  async findBySlug(slug: string, locale: string = 'ar') {
    return this.prisma.product.findUnique({
      where: { slug },
      include: {
        translations: { where: { locale } },
        category: { select: { id: true, name: true, slug: true } },
        store: { select: { id: true, name: true, slug: true } },
        verdict: true,
        reviewSummary: true,
        specs: { where: { locale } },
        prices: {
          orderBy: { scrapedAt: 'desc' },
          take: 14,
          include: { store: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
  }

  async findByCategory(categorySlug: string, locale: string = 'ar') {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        category: { slug: categorySlug },
      },
      include: {
        translations: { where: { locale } },
        category: { select: { id: true, name: true, slug: true } },
        verdict: { select: { type: true, overallScore: true } },
        prices: {
          orderBy: { scrapedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
