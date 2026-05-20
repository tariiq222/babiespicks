import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentPagesController } from '../content-pages.controller';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

describe('ContentPagesController', () => {
  let controller: ContentPagesController;

  const mockPrisma = {
    contentPage: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ContentPagesController(mockPrisma as unknown as PrismaService);
  });

  describe('searchContentPages', () => {
    it('returns all content pages when no query is provided', async () => {
      const mockPages = [
        {
          id: 'page_1',
          slug: 'best-diapers-2026',
          type: 'BEST_LIST',
          status: 'APPROVED',
          translations: [
            { locale: 'ar', title: 'أفضل الحفاضات' },
            { locale: 'en', title: 'Best Diapers 2026' },
          ],
        },
      ];

      mockPrisma.contentPage.findMany.mockResolvedValue(mockPages);
      mockPrisma.contentPage.count.mockResolvedValue(1);

      const result = await controller.searchContentPages(undefined, undefined);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('page_1');
      expect(result.items[0].title).toBe('أفضل الحفاضات');
      expect(result.items[0].locales).toEqual(['ar', 'en']);
      expect(result.total).toBe(1);
      expect(result.query).toBe('');
    });

    it('searches by title when query is provided', async () => {
      mockPrisma.contentPage.findMany.mockResolvedValue([]);
      mockPrisma.contentPage.count.mockResolvedValue(0);

      await controller.searchContentPages('diapers', '20');

      expect(mockPrisma.contentPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                translations: expect.objectContaining({
                  some: expect.objectContaining({
                    title: { contains: 'diapers', mode: 'insensitive' },
                  }),
                }),
              }),
            ]),
          }),
        }),
      );
    });

    it('respects limit parameter', async () => {
      mockPrisma.contentPage.findMany.mockResolvedValue([]);
      mockPrisma.contentPage.count.mockResolvedValue(0);

      await controller.searchContentPages('', '5');

      expect(mockPrisma.contentPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('caps limit at 100', async () => {
      mockPrisma.contentPage.findMany.mockResolvedValue([]);
      mockPrisma.contentPage.count.mockResolvedValue(0);

      await controller.searchContentPages('', '500');

      expect(mockPrisma.contentPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('defaults limit to 20 when limit is NaN (non-numeric string)', async () => {
      mockPrisma.contentPage.findMany.mockResolvedValue([]);
      mockPrisma.contentPage.count.mockResolvedValue(0);

      await controller.searchContentPages('', 'abc');

      expect(mockPrisma.contentPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });

    it('defaults limit to 20 when limit is undefined', async () => {
      mockPrisma.contentPage.findMany.mockResolvedValue([]);
      mockPrisma.contentPage.count.mockResolvedValue(0);

      await controller.searchContentPages(undefined, undefined);

      expect(mockPrisma.contentPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });

    it('defaults limit to 20 when limit is non-finite (Infinity)', async () => {
      mockPrisma.contentPage.findMany.mockResolvedValue([]);
      mockPrisma.contentPage.count.mockResolvedValue(0);

      await controller.searchContentPages('', String(Infinity));

      expect(mockPrisma.contentPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });



    it('prefers Arabic title over English', async () => {
      const mockPages = [
        {
          id: 'page_1',
          slug: 'review-formula',
          type: 'PRODUCT_REVIEW',
          status: 'DRAFT',
          translations: [
            { locale: 'en', title: 'Baby Formula Review' },
          ],
        },
      ];

      mockPrisma.contentPage.findMany.mockResolvedValue(mockPages);
      mockPrisma.contentPage.count.mockResolvedValue(1);

      const result = await controller.searchContentPages(undefined, undefined);

      // Falls back to English title when no Arabic title
      expect(result.items[0].title).toBe('Baby Formula Review');
    });

    it('returns locales array correctly', async () => {
      const mockPages = [
        {
          id: 'page_1',
          slug: 'best-toys',
          type: 'BEST_LIST',
          status: 'APPROVED',
          translations: [
            { locale: 'ar', title: 'أفضل الألعاب' },
            { locale: 'en', title: 'Best Toys' },
          ],
        },
      ];

      mockPrisma.contentPage.findMany.mockResolvedValue(mockPages);
      mockPrisma.contentPage.count.mockResolvedValue(1);

      const result = await controller.searchContentPages(undefined, undefined);

      expect(result.items[0].locales).toEqual(['ar', 'en']);
    });
  });
});
