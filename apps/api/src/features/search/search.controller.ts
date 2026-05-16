import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(
    @Query('q') query: string,
    @Query('locale') locale: string = 'ar',
    @Query('limit') limit: string = '10',
  ) {
    if (!query || query.length < 2) {
      return { data: [], query };
    }

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
          { translations: { some: { locale, name: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: {
        translations: { where: { locale } },
        verdict: { select: { type: true, overallScore: true } },
        prices: { orderBy: { scrapedAt: 'desc' }, take: 1 },
        category: true,
      },
      take: parseInt(limit) || 10,
      orderBy: { createdAt: 'desc' },
    });

    return { data: products, query, total: products.length };
  }
}
