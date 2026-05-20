import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';

interface ContentPageSummary {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  locales: string[];
}

interface ContentPageSearchResult {
  items: ContentPageSummary[];
  total: number;
  query: string;
  limit: number;
}

@Controller('admin/content-pages')
@UseGuards(AdminApiKeyGuard)
export class ContentPagesController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /admin/content-pages
   * Searchable content page picker for AI OS social runs.
   *
   * Query params:
   *   - query (string, optional): search in title and slug
   *   - limit (number, default 20, max 100): max results to return
   *
   * Returns lightweight summary: id, title, slug, type, status, locales.
   */
  @Get()
  async searchContentPages(
    @Query('query') query?: string,
    @Query('limit') limitStr?: string,
  ): Promise<ContentPageSearchResult> {
    const rawLimit = parseInt(limitStr ?? '20', 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(1, rawLimit), 100)
      : 20;
    const queryTrimmed = query?.trim() ?? '';
    const showAll = !queryTrimmed;

    const where = showAll
      ? {}
      : {
          OR: [
            { translations: { some: { title: { contains: queryTrimmed, mode: 'insensitive' as const } } } },
            { slug: { contains: queryTrimmed, mode: 'insensitive' as const } },
          ],
        };

    const [pages, total] = await Promise.all([
      this.prisma.contentPage.findMany({
        where,
        include: {
          translations: {
            select: { locale: true, title: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.contentPage.count({ where }),
    ]);

    const items: ContentPageSummary[] = pages.map((page) => {
      // Prefer Arabic title, fall back to English or slug
      const arTrans = page.translations.find((t) => t.locale === 'ar');
      const enTrans = page.translations.find((t) => t.locale === 'en');
      const title = arTrans?.title ?? enTrans?.title ?? page.slug;

      return {
        id: page.id,
        title,
        slug: page.slug,
        type: page.type,
        status: page.status,
        locales: page.translations.map((t) => t.locale),
      };
    });

    return { items, total, query: queryTrimmed, limit };
  }
}
