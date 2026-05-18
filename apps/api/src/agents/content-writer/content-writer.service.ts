import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat, AIModel } from '../../infrastructure/openrouter';
import { SettingsService } from '../../features/settings/settings.service';

export type ContentPageType = 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE';

export interface ContentResult {
  titleAr: string;
  titleEn: string;
  contentAr: string;
  contentEn: string;
  metaTitleAr: string;
  metaTitleEn: string;
  metaDescAr: string;
  metaDescEn: string;
  excerptAr: string;
  excerptEn: string;
}

@Injectable()
export class ContentWriterService {
  private readonly logger = new Logger(ContentWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async writeContent(
    type: ContentPageType,
    topic: string,
    productIds: string[],
  ): Promise<ContentResult> {
    this.logger.log(`Writing ${type} content: "${topic}"`);

    const agentConfig = this.settingsService.getConfig('content-writer');
    if (agentConfig && !agentConfig.enabled) {
      this.logger.warn('Content writer is disabled via settings');
      throw new Error('Agent disabled');
    }
    const model = (agentConfig?.model ?? 'anthropic/claude-sonnet-4') as AIModel;
    const temperature = agentConfig?.temperature ?? 0.7;
    const maxTokens = agentConfig?.maxTokens ?? 4000;

    // Get products data
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        translations: true,
        verdict: true,
        reviewSummary: true,
        prices: { orderBy: { scrapedAt: 'desc' }, take: 1 },
      },
    });

    const productsContext = products
      .map((p) => {
        const arT = p.translations.find((t) => t.locale === 'ar');
        const enT = p.translations.find((t) => t.locale === 'en');
        return `- ${enT?.name || p.name} (${arT?.name || p.name}): ${p.verdict?.type || 'No verdict'}, Score: ${p.verdict?.overallScore || 'N/A'}/10, Price: ${p.prices[0]?.price || 'N/A'} SAR`;
      })
      .join('\n');

    const result = await chat({
      model,
      jsonMode: true,
      maxTokens,
      temperature,
      messages: [
        {
          role: 'system',
          content: `You write SEO-optimized bilingual content for BabiesPicks, a Saudi baby product review platform.
Write content in BOTH Arabic and English in a single response.
Arabic should be natural Saudi dialect-friendly (فصحى بسيطة).
Target: 1500-2500 words per language.
Include affiliate disclosure at the end.
Use markdown formatting (##, ###, -, **bold**).

Brand Voice:
Write in a friendly, knowledgeable mom-to-mom tone. Be direct but warm. Avoid generic filler. Every paragraph should add value.
Do NOT start with 'في عالم...' or 'مع تزايد...' or generic introductions.

Return JSON:
{
  "titleAr": "العنوان بالعربي",
  "titleEn": "Title in English",
  "contentAr": "المحتوى الكامل بالعربي (markdown)",
  "contentEn": "Full content in English (markdown)",
  "metaTitleAr": "عنوان SEO < 60 حرف",
  "metaTitleEn": "SEO title < 60 chars",
  "metaDescAr": "وصف SEO < 160 حرف",
  "metaDescEn": "SEO description < 160 chars",
  "excerptAr": "ملخص قصير",
  "excerptEn": "Short excerpt"
}`,
        },
        {
          role: 'user',
          content: `Write a ${type.replace('_', ' ').toLowerCase()} about: "${topic}"\n\nProducts:\n${productsContext}`,
        },
      ],
    });

    const parsed: ContentResult = JSON.parse(result.content);

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'content-writer',
        status: 'COMPLETED',
        input: { type, topic, productIds },
        output: { titleAr: parsed.titleAr, titleEn: parsed.titleEn },
        tokensUsed: result.cost.totalTokens,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(`Content written: "${parsed.titleEn}"`);
    return parsed;
  }

  async saveContentPage(
    type: ContentPageType,
    slug: string,
    content: ContentResult,
    categoryId?: string,
  ) {
    const page = await this.prisma.contentPage.create({
      data: {
        type,
        slug,
        categoryId,
        translations: {
          create: [
            {
              locale: 'ar',
              title: content.titleAr,
              content: content.contentAr,
              metaTitle: content.metaTitleAr,
              metaDescription: content.metaDescAr,
              excerpt: content.excerptAr,
            },
            {
              locale: 'en',
              title: content.titleEn,
              content: content.contentEn,
              metaTitle: content.metaTitleEn,
              metaDescription: content.metaDescEn,
              excerpt: content.excerptEn,
            },
          ],
        },
      },
      include: { translations: true },
    });

    this.logger.log(`Content page saved: ${page.slug} (${page.id})`);
    return page;
  }
}
