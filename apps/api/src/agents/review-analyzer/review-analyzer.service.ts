import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat, AIModel, parseJsonResponse } from '../../infrastructure/openrouter';
import { SettingsService } from '../../features/settings/settings.service';

export interface ReviewData {
  text: string;
  rating?: number;
  date?: string;
  source?: string;
}

export interface ReviewAnalysis {
  averageRating: number;
  totalReviews: number;
  sentimentScore: number; // -1 to 1
  prosAr: string[];
  prosEn: string[];
  consAr: string[];
  consEn: string[];
  redFlags: string[];
}

@Injectable()
export class ReviewAnalyzerService {
  private readonly logger = new Logger(ReviewAnalyzerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async analyzeReviews(productId: string, reviews: ReviewData[]): Promise<ReviewAnalysis> {
    this.logger.log(`Analyzing ${reviews.length} reviews for product ${productId}`);

    const agentConfig = this.settingsService.getConfig('review-analyzer');
    if (agentConfig && !agentConfig.enabled) {
      this.logger.warn('Review analyzer is disabled via settings');
      throw new Error('Agent disabled');
    }
    const model = (agentConfig?.model ?? 'google/gemini-2.5-flash') as AIModel;
    const temperature = agentConfig?.temperature ?? 0.2;
    const maxTokens = agentConfig?.maxTokens ?? 1500;

    if (reviews.length === 0) {
      return this.emptyAnalysis();
    }

    // Prepare reviews text (max 50 reviews, recent first)
    const reviewsText = reviews
      .slice(0, 50)
      .map((r, i) => `[${i + 1}] ${r.rating ? `${r.rating}/5` : ''} ${r.text}`)
      .join('\n');

    const result = await chat({
      model,
      jsonMode: true,
      maxTokens,
      temperature,
      messages: [
        {
          role: 'system',
          content: `You analyze product reviews for a Saudi baby product platform. Return JSON:
{
  "sentimentScore": number (-1 to 1, where 1 is very positive),
  "prosAr": ["ميزة 1", "ميزة 2", ...] (top 5 pros in Arabic),
  "prosEn": ["Pro 1", "Pro 2", ...] (top 5 pros in English),
  "consAr": ["عيب 1", "عيب 2", ...] (top 5 cons in Arabic),
  "consEn": ["Con 1", "Con 2", ...] (top 5 cons in English),
  "redFlags": ["any safety concerns in English"] (empty if none)
}
Focus on: safety, quality, value for money. Give more weight to recent reviews.
Red flags: anything about baby safety, choking hazards, toxic materials, allergic reactions.`,
        },
        {
          role: 'user',
          content: `Analyze these reviews:\n\n${reviewsText}`,
        },
      ],
    });

    const parsed = parseJsonResponse<any>(result.content);

    const avgRating = reviews
      .filter((r) => r.rating)
      .reduce((sum, r, _, arr) => sum + (r.rating || 0) / arr.length, 0);

    const analysis: ReviewAnalysis = {
      averageRating: Math.round(avgRating * 10) / 10 || 0,
      totalReviews: reviews.length,
      sentimentScore: parsed.sentimentScore ?? 0,
      prosAr: parsed.prosAr || [],
      prosEn: parsed.prosEn || [],
      consAr: parsed.consAr || [],
      consEn: parsed.consEn || [],
      redFlags: parsed.redFlags || [],
    };

    // Save to DB
    await this.prisma.productReviewSummary.upsert({
      where: { productId },
      create: {
        productId,
        ...analysis,
      },
      update: {
        ...analysis,
        analyzedAt: new Date(),
      },
    });

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'review-analyzer',
        productId,
        status: 'COMPLETED',
        input: { reviewCount: reviews.length },
        output: analysis as any,
        tokensUsed: result.cost.totalTokens,
        costUsd: result.cost.costUsd,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(`Analysis complete: sentiment=${analysis.sentimentScore}, pros=${analysis.prosAr.length}, cons=${analysis.consAr.length}`);
    return analysis;
  }

  private emptyAnalysis(): ReviewAnalysis {
    return {
      averageRating: 0,
      totalReviews: 0,
      sentimentScore: 0,
      prosAr: [],
      prosEn: [],
      consAr: [],
      consEn: [],
      redFlags: [],
    };
  }
}
