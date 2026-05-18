import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat, AIModel } from '../../infrastructure/openrouter';
import { SettingsService } from '../../features/settings/settings.service';

export interface TweetItem {
  text: string;
  order: number;
}

export interface TweetThread {
  format: 'thread_ar' | 'thread_en' | 'single_ar' | 'single_en';
  tweets: TweetItem[];
  singleTweet: string;
}

@Injectable()
export class TweetCrafterService {
  private readonly logger = new Logger(TweetCrafterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async craftTweets(contentPageId: string, locale: 'ar' | 'en'): Promise<TweetThread> {
    this.logger.log(`Crafting ${locale} tweets for contentPage: ${contentPageId}`);

    const agentConfig = this.settingsService.getConfig('tweet-crafter');
    if (agentConfig && !agentConfig.enabled) {
      this.logger.warn('Tweet crafter is disabled via settings');
      throw new Error('Agent disabled');
    }
    const model = (agentConfig?.model ?? 'anthropic/claude-sonnet-4') as AIModel;
    const temperature = agentConfig?.temperature ?? 0.7;
    const maxTokens = agentConfig?.maxTokens ?? 2000;

    // Load ContentPage with translations, verdict, and product data
    const contentPage = await this.prisma.contentPage.findUnique({
      where: { id: contentPageId },
      include: {
        translations: true,
        category: true,
      },
    });

    if (!contentPage) {
      throw new Error(`ContentPage not found: ${contentPageId}`);
    }

    const translation = contentPage.translations.find((t) => t.locale === locale);
    const title = translation?.title ?? '';
    const excerpt = translation?.excerpt ?? '';

    const isArabic = locale === 'ar';
    const format = isArabic ? 'thread_ar' : 'thread_en';

    const systemPrompt = isArabic
      ? `أنت متخصص في كتابة تغريدات تسويقية لمنصة BabiesPicks السعودية لمراجعة منتجات الأطفال.
اكتب ثريد تويتر (5-8 تغريدات) وتغريدة واحدة مختصرة.
كل تغريدة يجب أن تكون أقل من 280 حرف.
استخدم لهجة ودية وموثوقة. تجنب الادعاءات الطبية.
أضف إيموجي مناسبة.

أرجع JSON بهذا الشكل:
{
  "tweets": [{"text": "نص التغريدة", "order": 1}, ...],
  "singleTweet": "تغريدة واحدة مختصرة"
}`
      : `You are a social media specialist for BabiesPicks, a Saudi baby product review platform.
Write a Twitter thread (5-8 tweets) and a single summary tweet.
Each tweet must be under 280 characters.
Use a friendly, trustworthy tone. Avoid medical claims.
Add relevant emojis.

Return JSON in this format:
{
  "tweets": [{"text": "Tweet text", "order": 1}, ...],
  "singleTweet": "A single concise tweet"
}`;

    const userPrompt = isArabic
      ? `اكتب ثريد عن: "${title}"\n\nملخص: ${excerpt}`
      : `Write a thread about: "${title}"\n\nSummary: ${excerpt}`;

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

    const parsed: { tweets: TweetItem[]; singleTweet: string } = JSON.parse(result.content);

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'tweet-crafter',
        status: 'COMPLETED',
        input: { contentPageId, locale },
        output: { tweetCount: parsed.tweets.length, format } as any,
        tokensUsed: result.cost.totalTokens,
        costUsd: result.cost.costUsd,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(`Crafted ${parsed.tweets.length} tweets (${format})`);

    return {
      format,
      tweets: parsed.tweets,
      singleTweet: parsed.singleTweet,
    };
  }
}
