import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat, AIModel, parseJsonResponse } from '../../infrastructure/openrouter';
import { SettingsService } from '../../features/settings/settings.service';

export type ContentPageType = 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE';

export interface SEOBrief {
  primaryKeyword: string;
  lsiKeywords: string[];
  searchIntent: 'informational' | 'transactional' | 'comparison';
  serpAnalysis: {
    topCompetitors: string[];
    contentGaps: string[];
    avgWordCount: number;
  };
  targetWordCount: { ar: number; en: number };
  outline: {
    h1: string;
    sections: Array<{
      heading: string;
      subheadings?: string[];
      keyPoints: string[];
      targetKeywords: string[];
    }>;
  };
  internalLinkSuggestions: string[];
  faqSuggestions: Array<{ question: string; answerHint: string }>;
}

@Injectable()
export class SEOPlannerService {
  private readonly logger = new Logger(SEOPlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async planContent(
    type: ContentPageType,
    topic: string,
    productIds: string[],
    locale: string = 'ar',
  ): Promise<SEOBrief> {
    this.logger.log(`SEO Planning: "${topic}" (${type})`);

    const agentConfig = this.settingsService.getConfig('seo-planner');
    if (agentConfig && !agentConfig.enabled) {
      this.logger.warn('SEO Planner is disabled via settings');
      throw new Error('Agent disabled');
    }
    const model = (agentConfig?.model ?? 'anthropic/claude-haiku-3.5') as AIModel;
    const temperature = agentConfig?.temperature ?? 0.3;
    const maxTokens = agentConfig?.maxTokens ?? 2000;

    // Gather context: products
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        translations: true,
        verdict: true,
        category: true,
        prices: { orderBy: { scrapedAt: 'desc' }, take: 1 },
      },
    });

    const productsContext = products
      .map((p) => {
        const arT = p.translations.find((t) => t.locale === 'ar');
        const enT = p.translations.find((t) => t.locale === 'en');
        return `- ${enT?.name || p.name} (${arT?.name || p.name}): verdict=${p.verdict?.type || 'none'}, score=${p.verdict?.overallScore || 'N/A'}, category=${p.category?.name || 'uncategorized'}, price=${p.prices[0]?.price || 'N/A'} SAR`;
      })
      .join('\n');

    // Gather existing content slugs for internal link suggestions
    const existingContent = await this.prisma.contentPage.findMany({
      where: { isPublished: true },
      select: { slug: true, type: true },
      take: 50,
    });
    const existingSlugs = existingContent.map((c) => `${c.slug} (${c.type})`).join(', ');

    const contentTypeLabel = {
      BEST_LIST: 'best-of list / قائمة أفضل',
      PRODUCT_REVIEW: 'product review / مراجعة منتج',
      BUYING_GUIDE: 'buying guide / دليل شراء',
    }[type];

    const result = await chat({
      model,
      jsonMode: true,
      maxTokens,
      temperature,
      messages: [
        {
          role: 'system',
          content: `You are an SEO strategist for BabiesPicks (babiespicks.com), a Saudi baby product review platform.
Your job is to create a comprehensive SEO brief BEFORE content is written.

Target market: Saudi Arabia (Arabic primary, English secondary).
Content type: ${contentTypeLabel}

Analyze the topic and products, then return a JSON SEO brief with:
1. Primary keyword (Arabic) + 5 LSI keywords (Arabic)
2. Search intent classification
3. SERP analysis: what top competitors would write, content gaps they miss, average word count
4. Target word count for Arabic and English versions
5. Detailed content outline with H1, H2 sections, H3 subheadings, key points per section, target keywords per section
6. Internal link suggestions from existing content: ${existingSlugs || 'none yet'}
7. FAQ suggestions (5-8 questions with answer hints) — these become FAQPage schema

Return JSON matching this exact structure:
{
  "primaryKeyword": "الكلمة المفتاحية الرئيسية بالعربي",
  "lsiKeywords": ["كلمة 1", "كلمة 2", "كلمة 3", "كلمة 4", "كلمة 5"],
  "searchIntent": "informational|transactional|comparison",
  "serpAnalysis": {
    "topCompetitors": ["competitor title 1", "competitor title 2", "competitor title 3", "competitor title 4", "competitor title 5"],
    "contentGaps": ["gap 1", "gap 2", "gap 3"],
    "avgWordCount": 2000
  },
  "targetWordCount": { "ar": 2000, "en": 1800 },
  "outline": {
    "h1": "العنوان الرئيسي المحسّن للـ SEO",
    "sections": [
      {
        "heading": "عنوان H2",
        "subheadings": ["عنوان H3 فرعي"],
        "keyPoints": ["نقطة 1", "نقطة 2"],
        "targetKeywords": ["كلمة مستهدفة"]
      }
    ]
  },
  "internalLinkSuggestions": ["slug-1", "slug-2"],
  "faqSuggestions": [
    { "question": "سؤال شائع؟", "answerHint": "إشارة للإجابة" }
  ]
}`,
        },
        {
          role: 'user',
          content: `Create SEO brief for: "${topic}"\n\nContent type: ${type}\n\nProducts:\n${productsContext}`,
        },
      ],
    });

    const parsed = parseJsonResponse<SEOBrief>(result.content);

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'seo-planner',
        status: 'COMPLETED',
        input: { type, topic, productIds, locale } as any,
        output: {
          primaryKeyword: parsed.primaryKeyword,
          lsiKeywords: parsed.lsiKeywords,
          searchIntent: parsed.searchIntent,
          sectionCount: parsed.outline.sections.length,
          faqCount: parsed.faqSuggestions.length,
        } as any,
        tokensUsed: result.cost.totalTokens,
        costUsd: result.cost.costUsd,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `SEO Brief ready: keyword="${parsed.primaryKeyword}", ${parsed.outline.sections.length} sections, ${parsed.faqSuggestions.length} FAQs`,
    );
    return parsed;
  }
}
