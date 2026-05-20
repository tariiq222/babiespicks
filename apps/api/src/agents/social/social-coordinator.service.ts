import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TweetCrafterService } from './tweet-crafter.service';
import { HashtagMinerService } from './hashtag-miner.service';
import { SocialGuardService } from './social-guard.service';
import { VisualMakerService } from './visual-maker.service';

export interface SocialPipelineResult {
  contentPageId: string;
  postsCreated: number;
  posts: Array<{
    id: string;
    locale: 'ar' | 'en';
    platform: string;
    format: string;
    status: string;
    tweetCount: number;
    hashtagCount: number;
    complianceScore: number | null;
  }>;
  totalTimeMs: number;
}

@Injectable()
export class SocialCoordinatorService {
  private readonly logger = new Logger(SocialCoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tweetCrafter: TweetCrafterService,
    private readonly hashtagMiner: HashtagMinerService,
    private readonly socialGuard: SocialGuardService,
    private readonly visualMaker: VisualMakerService,
  ) {}

  /**
   * Run the social content pipeline for a ContentPage.
   * @param contentPageId The ContentPage to generate social posts for
   * @param platforms Optional array of platforms to generate for. Defaults to ['twitter'].
   *                  Supported: 'twitter', 'telegram'. Empty or fully-unrecognized arrays reject with 400.
   * @throws BadRequestException if platforms contains unsupported values or an empty array.
   */
  async runSocialPipeline(
    contentPageId: string,
    platforms?: string[],
  ): Promise<SocialPipelineResult> {
    const start = Date.now();

    const SUPPORTED = ['twitter', 'telegram'] as const;

    // Fail-closed: reject unsupported platform values
    if (platforms !== undefined) {
      if (!Array.isArray(platforms) || platforms.length === 0) {
        throw new Error('platforms must be a non-empty array of supported values: twitter, telegram');
      }
      const unsupported = platforms.filter((p) => !(SUPPORTED as readonly string[]).includes(p));
      if (unsupported.length > 0) {
        throw new Error(`Unsupported platform(s): ${unsupported.join(', ')}. Supported: ${SUPPORTED.join(', ')}`);
      }
    }

    const requestedPlatforms = (platforms ?? ['twitter']).filter(
      (p) => (SUPPORTED as readonly string[]).includes(p),
    );
    const createTwitter = requestedPlatforms.includes('twitter');
    const createTelegram = requestedPlatforms.includes('telegram');

    this.logger.log(
      `=== Social Pipeline START: ${contentPageId}, platforms=${requestedPlatforms.join(',')} ===`,
    );

    // Load ContentPage + related product info
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

    // Determine related product (if this is a PRODUCT_REVIEW page, look for a matching product)
    let productId: string | null = null;
    if (contentPage.type === 'PRODUCT_REVIEW') {
      const arTranslation = contentPage.translations.find((t) => t.locale === 'ar');
      const enTranslation = contentPage.translations.find((t) => t.locale === 'en');
      const slugParts = contentPage.slug.split('/');
      const productSlug = slugParts[slugParts.length - 1];

      const product = await this.prisma.product.findFirst({
        where: { slug: productSlug },
        select: { id: true, verdict: { select: { type: true } } },
      });
      productId = product?.id ?? null;
      void arTranslation;
      void enTranslation;
    }

    const createdPosts: SocialPipelineResult['posts'] = [];
    const locales: Array<'ar' | 'en'> = ['ar', 'en'];

    // Collect all tweet texts for compliance check
    const allTweetTexts: string[] = [];
    const allHashtags: string[] = [];

    // Per-locale data collected before saving
    const localeResults: Array<{
      locale: 'ar' | 'en';
      thread: Awaited<ReturnType<TweetCrafterService['craftTweets']>>;
      hashtags: string[];
    }> = [];

    // Step 1 & 2: For each locale — craft tweets + mine hashtags
    for (const locale of locales) {
      this.logger.log(`Step 1-2 [${locale}]: Crafting tweets and mining hashtags...`);

      const translation = contentPage.translations.find((t) => t.locale === locale);
      const topic = translation?.title ?? contentPage.slug;

      // Get verdict type for context (if product linked)
      let verdictType: string | undefined;
      if (productId) {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          select: { verdict: { select: { type: true } } },
        });
        verdictType = product?.verdict?.type ?? undefined;
      }

      const [thread, hashtags] = await Promise.all([
        this.tweetCrafter.craftTweets(contentPageId, locale),
        this.hashtagMiner.mineHashtags(topic, locale, verdictType),
      ]);

      allTweetTexts.push(...thread.tweets.map((t) => t.text), thread.singleTweet);
      allHashtags.push(...hashtags);
      localeResults.push({ locale, thread, hashtags });
    }

    // Step 3: VisualMaker — generate verdict card data (if product linked)
    let visualUrl: string | null = null;
    if (productId) {
      this.logger.log('Step 3: Generating verdict card data...');
      const cardData = await this.visualMaker.generateVerdictCard(productId);
      if (cardData) {
        // Store as JSON string reference — actual image URL would be generated by frontend
        visualUrl = JSON.stringify(cardData);
      }
    }

    // Step 4: SocialGuard — compliance check on all tweets
    this.logger.log('Step 4: Social Guard compliance check...');
    const complianceResult = await this.socialGuard.checkCompliance(
      allTweetTexts,
      [...new Set(allHashtags)],
    );

    // Step 5: Save SocialPost records
    this.logger.log('Step 5: Saving SocialPost records...');
    const finalStatus = complianceResult.passed ? 'PENDING_APPROVAL' : 'DRAFT';
    const complianceNotes = complianceResult.issues.length > 0
      ? JSON.stringify(complianceResult.issues)
      : null;

    for (const { locale, thread, hashtags } of localeResults) {
      const trans = contentPage.translations.find((t) => t.locale === locale);
      const title = trans?.title ?? contentPage.slug;

      // ── Twitter posts ──────────────────────────────────────────────────────
      if (createTwitter) {
        // Thread post
        const threadPost = await this.prisma.socialPost.create({
          data: {
            contentPageId,
            productId,
            status: finalStatus as any,
            platform: 'twitter',
            format: thread.format,
            content: thread.tweets as any,
            hashtags,
            visualUrl,
            complianceScore: complianceResult.score,
            complianceNotes,
          },
        });

        createdPosts.push({
          id: threadPost.id,
          locale,
          platform: 'twitter',
          format: thread.format,
          status: finalStatus,
          tweetCount: thread.tweets.length,
          hashtagCount: hashtags.length,
          complianceScore: complianceResult.score,
        });

        // Single tweet post
        const singleFormat = locale === 'ar' ? 'single_ar' : 'single_en';
        const singlePost = await this.prisma.socialPost.create({
          data: {
            contentPageId,
            productId,
            status: finalStatus as any,
            platform: 'twitter',
            format: singleFormat,
            content: [{ text: thread.singleTweet, order: 1 }] as any,
            hashtags,
            visualUrl,
            complianceScore: complianceResult.score,
            complianceNotes,
          },
        });

        createdPosts.push({
          id: singlePost.id,
          locale,
          platform: 'twitter',
          format: singleFormat,
          status: finalStatus,
          tweetCount: 1,
          hashtagCount: hashtags.length,
          complianceScore: complianceResult.score,
        });
      }

      // ── Telegram posts ──────────────────────────────────────────────────────
      if (createTelegram) {
        const telegramContent = this.formatTelegramPost(title, thread, hashtags, locale);
        const telegramFormat = locale === 'ar' ? 'telegram_ar' : 'telegram_en';

        const telegramPost = await this.prisma.socialPost.create({
          data: {
            contentPageId,
            productId,
            status: finalStatus as any,
            platform: 'telegram',
            format: telegramFormat,
            content: telegramContent as any,
            hashtags,
            visualUrl,
            complianceScore: complianceResult.score,
            complianceNotes,
          },
        });

        createdPosts.push({
          id: telegramPost.id,
          locale,
          platform: 'telegram',
          format: telegramFormat,
          status: finalStatus,
          tweetCount: 1,
          hashtagCount: hashtags.length,
          complianceScore: complianceResult.score,
        });
      }
    }

    // Log coordinator agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'social-coordinator',
        status: 'COMPLETED',
        input: { contentPageId } as any,
        output: {
          postsCreated: createdPosts.length,
          compliancePassed: complianceResult.passed,
          finalStatus,
        } as any,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const totalTimeMs = Date.now() - start;
    this.logger.log(
      `=== Social Pipeline END: ${createdPosts.length} posts, status=${finalStatus}, compliance=${complianceResult.score}/100 (${totalTimeMs}ms) ===`,
    );

    return {
      contentPageId,
      postsCreated: createdPosts.length,
      posts: createdPosts,
      totalTimeMs,
    };
  }

  /**
   * Format a Telegram post from Twitter thread content.
   * Adapts the Twitter thread content for Telegram's format and limits.
   */
  private formatTelegramPost(
    title: string,
    thread: { singleTweet: string; tweets: Array<{ text: string }> },
    hashtags: string[],
    locale: 'ar' | 'en',
  ): { text: string } {
    const hashtagStr = hashtags.length > 0 ? '\n\n' + hashtags.map((h) => `#${h.replace('#', '')}`).join(' ') : '';

    // Use the single tweet as the main content — it's already concise
    const content = thread.singleTweet;

    const disclosure = locale === 'ar'
      ? '\n\n⚠️ هذا المحتوى من BabiesPicks — نتائجنا مستقلة.'
      : '\n\n⚠️ This content is from BabiesPicks — our results are independent.';

    // Telegram messages should be under 4096 chars. The single tweet is already short,
    // but we guard anyway.
    const fullText = `${title}\n\n${content}${hashtagStr}${disclosure}`;
    const truncated = fullText.length > 4096 ? fullText.slice(0, 4093) + '...' : fullText;

    return { text: truncated };
  }
}
