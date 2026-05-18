import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat, AIModel } from '../../infrastructure/openrouter';
import { SettingsService } from '../../features/settings/settings.service';

@Injectable()
export class HashtagMinerService {
  private readonly logger = new Logger(HashtagMinerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async mineHashtags(
    topic: string,
    locale: 'ar' | 'en',
    verdictType?: string,
  ): Promise<string[]> {
    this.logger.log(`Mining ${locale} hashtags for: "${topic}"`);

    const agentConfig = this.settingsService.getConfig('hashtag-miner');
    if (agentConfig && !agentConfig.enabled) {
      this.logger.warn('Hashtag miner is disabled via settings');
      throw new Error('Agent disabled');
    }
    const model = (agentConfig?.model ?? 'anthropic/claude-haiku-3.5') as AIModel;
    const temperature = agentConfig?.temperature ?? 0.3;
    const maxTokens = agentConfig?.maxTokens ?? 500;

    const isArabic = locale === 'ar';

    const systemPrompt = isArabic
      ? `أنت متخصص في تحسين الهاشتاقات لمنصة BabiesPicks السعودية.
اختر 5-8 هاشتاقات مثالية للسوق السعودي لمنتجات الأطفال.
اجمع بين الهاشتاقات العربية والإنجليزية.
ركز على الوصول والتفاعل في السوق الخليجي.

أرجع JSON: {"hashtags": ["منتجات_أطفال", "babiespicks", ...]}`
      : `You are a hashtag optimization specialist for BabiesPicks, a Saudi baby product review platform.
Select 5-8 optimal hashtags for the Saudi/GCC baby market.
Mix Arabic and English hashtags for maximum reach.
Focus on engagement in the Gulf market.

Return JSON: {"hashtags": ["baby_products", "babiespicks", ...]}`;

    const verdictContext = verdictType ? ` (Verdict: ${verdictType})` : '';
    const userPrompt = isArabic
      ? `اختر هاشتاقات لـ: "${topic}"${verdictContext}`
      : `Select hashtags for: "${topic}"${verdictContext}`;

    const result = await chat({
      model,
      jsonMode: true,
      maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const parsed: { hashtags: string[] } = JSON.parse(result.content);

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'hashtag-miner',
        status: 'COMPLETED',
        input: { topic, locale, verdictType } as any,
        output: { hashtags: parsed.hashtags, count: parsed.hashtags.length } as any,
        tokensUsed: result.cost.totalTokens,
        costUsd: result.cost.costUsd,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(`Mined ${parsed.hashtags.length} hashtags`);
    return parsed.hashtags;
  }
}
