import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublishedPages(locale: string = 'ar') {
    const pages = await this.prisma.contentPage.findMany({
      where: { isPublished: true },
      include: {
        translations: { where: { locale } },
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return pages.map(page => {
      const t = page.translations[0];
      return {
        id: page.id,
        type: page.type,
        slug: page.slug,
        title: t?.title || page.slug,
        description: t?.metaDescription || null,
        imageUrl: null,
        categorySlug: page.category?.slug || null,
        locale,
        publishedAt: page.publishedAt?.toISOString() || null,
      };
    });
  }

  async getPageBySlug(slug: string, locale: string = 'ar') {
    const page = await this.prisma.contentPage.findUnique({
      where: { slug },
      include: {
        translations: { where: { locale } },
        category: true,
      },
    });
    if (!page) return null;

    const t = page.translations[0];
    return {
      id: page.id,
      type: page.type,
      slug: page.slug,
      title: t?.title || page.slug,
      content: t?.content || '',
      metaTitle: t?.metaTitle || t?.title || '',
      metaDescription: t?.metaDescription || '',
      excerpt: t?.excerpt || '',
      description: t?.metaDescription || null,
      imageUrl: null,
      categorySlug: page.category?.slug || null,
      locale,
      publishedAt: page.publishedAt?.toISOString() || null,
    };
  }
}
