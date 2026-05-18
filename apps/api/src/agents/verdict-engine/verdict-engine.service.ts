import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat, AIModel } from '../../infrastructure/openrouter';
import { SettingsService } from '../../features/settings/settings.service';

export interface VerdictResult {
  type: 'WORTH_IT' | 'WORTH_IT_WITH' | 'WAIT' | 'NOT_WORTH_IT';
  overallScore: number;
  safetyScore: number;
  qualityScore: number;
  reviewsScore: number;
  priceScore: number;
  longTermScore: number;
  reasoningAr: string;
  reasoningEn: string;
  conditionsAr?: string[];
  conditionsEn?: string[];
}

@Injectable()
export class VerdictEngineService {
  private readonly logger = new Logger(VerdictEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async generateVerdict(productId: string): Promise<VerdictResult> {
    this.logger.log(`Generating verdict for product ${productId}`);

    const agentConfig = this.settingsService.getConfig('verdict-engine');
    if (agentConfig && !agentConfig.enabled) {
      this.logger.warn('Verdict engine is disabled via settings');
      throw new Error('Agent disabled');
    }
    const model = (agentConfig?.model ?? 'anthropic/claude-sonnet-4') as AIModel;
    const temperature = agentConfig?.temperature ?? 0.3;
    const maxTokens = agentConfig?.maxTokens ?? 2000;

    // Check for cached verdict (within 24 hours)
    const cached = await this.prisma.verdict.findUnique({
      where: { productId },
    });

    if (cached) {
      const hoursSinceUpdate =
        (Date.now() - cached.updatedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 24) {
        this.logger.log(`Returning cached verdict for ${productId}`);
        return {
          type: cached.type,
          overallScore: cached.overallScore,
          safetyScore: cached.safetyScore,
          qualityScore: cached.qualityScore,
          reviewsScore: cached.reviewsScore,
          priceScore: cached.priceScore,
          longTermScore: cached.longTermScore,
          reasoningAr: cached.reasoningAr,
          reasoningEn: cached.reasoningEn,
          conditionsAr: (cached.conditionsAr as string[] | null) || undefined,
          conditionsEn: (cached.conditionsEn as string[] | null) || undefined,
        };
      }
    }

    // Gather all data
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: {
        translations: true,
        prices: { orderBy: { scrapedAt: 'desc' }, take: 14 },
        reviewSummary: true,
        specs: true,
        category: true,
        store: true,
      },
    });

    const reviewSummary = product.reviewSummary;

    // Build context for Claude
    const context = `
Product: ${product.name}
Brand: ${product.brand || 'Unknown'}
Category: ${product.category?.name || 'Unknown'}
Current Price: ${product.prices[0]?.price || 'Unknown'} ${product.prices[0]?.currency || 'SAR'}
Price History (14 days): ${product.prices.map((p) => `${p.price} SAR on ${p.scrapedAt.toISOString().split('T')[0]}`).join(', ') || 'No history'}
Average Rating: ${reviewSummary?.averageRating || 'N/A'}/5 (${reviewSummary?.totalReviews || 0} reviews)
Sentiment: ${reviewSummary?.sentimentScore || 'N/A'}
Pros: ${JSON.stringify(reviewSummary?.prosEn || [])}
Cons: ${JSON.stringify(reviewSummary?.consEn || [])}
Red Flags: ${JSON.stringify(reviewSummary?.redFlags || [])}
Specs: ${product.specs.map((s) => `${s.key}: ${s.value}`).join(', ') || 'None'}
`;

    const result = await chat({
      model,
      jsonMode: true,
      maxTokens,
      temperature,
      messages: [
        {
          role: 'system',
          content: `You are the verdict engine for BabiesPicks, a Saudi baby product review platform.
Score each axis 0-10 and provide an overall weighted verdict.

Think step by step before scoring each axis. Consider the evidence carefully and justify your scores.

Axes & Weights:
- Safety (25%): hazards, certifications, red flags, material safety
- Quality (25%): build quality, durability, brand reputation
- Reviews (20%): user sentiment, common issues, rating
- Price (15%): value vs competitors, price stability (14-day check), deals
- Long-term Value (15%): resale, multi-child use, growth adaptability

Verdict Types:
- WORTH_IT: overall >= 7.5
- WORTH_IT_WITH: overall 6.0-7.4 (include conditions)
- WAIT: overall 4.5-5.9 (price may drop, better alternatives coming)
- NOT_WORTH_IT: overall < 4.5

Example of good output:
{
  "type": "WORTH_IT",
  "overallScore": 8.2,
  "safetyScore": 9.0,
  "qualityScore": 8.5,
  "reviewsScore": 8.0,
  "priceScore": 7.5,
  "longTermScore": 7.0,
  "reasoningAr": "منتج آمن وموثوق مع تقييمات إيجابية من الأمهات. الجودة ممتازة والسعر مناسب مقارنة بالمنافسين.",
  "reasoningEn": "A safe and reliable product with positive reviews from mothers. Excellent quality and fairly priced compared to competitors.",
  "conditionsAr": null,
  "conditionsEn": null
}

Return JSON:
{
  "type": "WORTH_IT|WORTH_IT_WITH|WAIT|NOT_WORTH_IT",
  "overallScore": number (0-10),
  "safetyScore": number (0-10),
  "qualityScore": number (0-10),
  "reviewsScore": number (0-10),
  "priceScore": number (0-10),
  "longTermScore": number (0-10),
  "reasoningAr": "تعليل بالعربي (2-3 جمل)",
  "reasoningEn": "Reasoning in English (2-3 sentences)",
  "conditionsAr": ["شرط 1", "شرط 2"] or null,
  "conditionsEn": ["Condition 1", "Condition 2"] or null
}`,
        },
        {
          role: 'user',
          content: `Generate verdict for:\n${context}`,
        },
      ],
    });

    const cleanedContent = result.content
      .replace(/^```json\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
    const parsed = JSON.parse(cleanedContent);

    const verdict: VerdictResult = {
      type: parsed.type,
      overallScore: parsed.overallScore,
      safetyScore: parsed.safetyScore,
      qualityScore: parsed.qualityScore,
      reviewsScore: parsed.reviewsScore,
      priceScore: parsed.priceScore,
      longTermScore: parsed.longTermScore,
      reasoningAr: parsed.reasoningAr,
      reasoningEn: parsed.reasoningEn,
      conditionsAr: parsed.conditionsAr || undefined,
      conditionsEn: parsed.conditionsEn || undefined,
    };

    // Save to DB
    await this.prisma.verdict.upsert({
      where: { productId },
      create: {
        productId,
        ...verdict,
      },
      update: {
        ...verdict,
        updatedAt: new Date(),
      },
    });

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'verdict-engine',
        productId,
        status: 'COMPLETED',
        output: verdict as any,
        tokensUsed: result.cost.totalTokens,
        costUsd: result.cost.costUsd,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(`Verdict: ${verdict.type} (${verdict.overallScore}/10) for ${product.name}`);
    return verdict;
  }
}
