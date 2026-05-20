import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ApprovalAuditAction, ApprovalAuditActorType, ApprovalAuditEntityType, Prisma, SocialPostStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TelegramPublisherService } from '../../infrastructure/publishing/telegram-publisher.service';
import { TweetContent, TwitterPublisherService } from '../../infrastructure/publishing/twitter-publisher.service';

const PUBLISH_LOCK_MS = 10 * 60 * 1000;

type SocialDraftSourceType = 'PRODUCT' | 'ARTICLE' | 'CONTENT_PAGE';

export interface CreateSocialDraftInput {
  sourceType: SocialDraftSourceType;
  sourceId: string;
  platform: 'twitter' | 'telegram' | string;
  locale?: 'ar' | 'en' | string;
  idempotencyKey: string;
  content?: unknown;
  hashtags?: string[];
  scheduledAt?: Date;
}

export interface PublishSocialDraftOptions {
  actorId?: string;
  trigger?: 'manual' | 'scheduled' | string;
}

interface PublisherResult {
  success: boolean;
  tweetIds?: string[];
  messageId?: number;
  error?: string;
}

interface SocialPostRecord {
  id: string;
  status: string;
  platform: string;
  content: unknown;
  metadata?: unknown;
}

interface ClaimedSocialPost {
  post: SocialPostRecord;
  attemptId: string;
}

interface ProductSourceRecord {
  id: string;
  status: string;
  slug?: string | null;
  name?: string | null;
  translations?: Array<{ locale: string; name?: string | null; title?: string | null }>;
}

interface ArticleSourceRecord {
  id: string;
  status: string;
  contentPageId?: string | null;
  locale?: string | null;
  title?: string | null;
}

interface ContentPageSourceRecord {
  id: string;
  status: string;
  slug?: string | null;
  isPublished?: boolean;
  translations?: Array<{ locale: string; title?: string | null }>;
}

/**
 * Creates and publishes approval-gated SocialPost drafts.
 * SocialPost is the canonical draft record; no network publish occurs until the
 * record is explicitly APPROVED.
 */
@Injectable()
export class SocialDraftService {
  private readonly logger = new Logger(SocialDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twitter: TwitterPublisherService,
    private readonly telegram: TelegramPublisherService,
  ) {}

  /**
   * Build an approval-gated social draft from an approved source. The
   * idempotency key is stored in SocialPost.metadata and checked before insert.
   */
  async createSocialDraft(input: CreateSocialDraftInput): Promise<unknown> {
    const existing = await this.prisma.socialPost.findFirst({
      where: {
        metadata: {
          path: ['idempotencyKey'],
          equals: input.idempotencyKey,
        },
      },
    });

    if (existing) {
      return existing;
    }

    const source = await this.resolveApprovedSource(input);
    const content = input.content ?? this.defaultDraftContent(source.title, input.locale ?? source.locale ?? 'ar');

    return this.prisma.socialPost.create({
      data: {
        productId: source.productId,
        contentPageId: source.contentPageId,
        platform: input.platform,
        format: this.defaultFormat(input.platform, input.locale ?? source.locale ?? 'ar'),
        content: content as never,
        hashtags: input.hashtags ?? [],
        status: SocialPostStatus.PENDING_APPROVAL,
        scheduledAt: input.scheduledAt,
        metadata: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          locale: input.locale ?? source.locale,
          idempotencyKey: input.idempotencyKey,
          approvalRequired: true,
        } as never,
      },
    });
  }

  /**
   * Publish a SocialPost only after approval. Publisher failures are sanitized
   * before being returned or persisted so credentials never escape.
   */
  async publishSocialDraft(id: string, options: PublishSocialDraftOptions = {}): Promise<unknown> {
    const post = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } }) as SocialPostRecord;

    if (post.status !== SocialPostStatus.APPROVED) {
      throw new BadRequestException('Social draft must be APPROVED before publishing');
    }

    const claimed = await this.claimForPublish(post, options.actorId ?? 'social-drafts-service');
    if (!claimed) {
      return { success: false, error: 'Social draft is already being published' };
    }

    const publishedAt = new Date();
    let result: PublisherResult;
    try {
      result = await this.publishToPlatform(claimed.post);
    } catch (error) {
      const sanitizedError = sanitizePublisherError(error);
      await this.markClaimedPostForManualRecovery(claimed, {
        publishTrigger: options.trigger ?? 'manual',
        publishError: sanitizedError,
        recoveryReason: 'Provider call threw after the PUBLISHING claim; leaving PUBLISHING to prevent duplicate external posts',
      });
      return { success: false, error: sanitizedError, recoveryRequired: true };
    }

    if (!result.success) {
      const sanitizedError = sanitizePublisherError(result.error);
      await this.markClaimedPostForManualRecovery(claimed, {
        publishTrigger: options.trigger ?? 'manual',
        publishError: sanitizedError,
        recoveryReason: hasExternalPublishId(result)
          ? 'Provider returned a failure with an external id; leaving PUBLISHING for manual recovery'
          : 'Provider failure after publish attempt has ambiguous external state; leaving PUBLISHING to prevent duplicate posts',
      });

      return { success: false, error: sanitizedError, recoveryRequired: true };
    }

    const externalId = result.tweetIds?.[0] ?? (result.messageId ? String(result.messageId) : null);
    if (!externalId) {
      await this.markClaimedPostForManualRecovery(claimed, {
        publishTrigger: options.trigger ?? 'manual',
        publishError: 'Missing external publish id',
        recoveryReason: 'Provider reported success without an external id; leaving PUBLISHING for manual recovery',
      });
      return { success: false, error: 'Missing external publish id', recoveryRequired: true };
    }

    const updated = await this.updateClaimedPost(claimed, {
      status: SocialPostStatus.PUBLISHING,
      data: {
        status: SocialPostStatus.PUBLISHED,
        publishedAt,
        externalId,
        metadata: {
          ...withoutPublishLock(claimed.post.metadata),
          publishTrigger: options.trigger ?? 'manual',
          tweetIds: result.tweetIds,
          messageId: result.messageId,
        } as never,
      },
    });

    await this.prisma.approvalAuditEvent.create({
      data: {
        actorType: ApprovalAuditActorType.SYSTEM,
        actorId: options.actorId ?? 'social-drafts-service',
        action: ApprovalAuditAction.PUBLISHED,
        entityType: ApprovalAuditEntityType.SOCIAL_POST,
        entityId: id,
        metadata: { trigger: options.trigger ?? 'manual' } as never,
      },
    }).catch((error: unknown) => {
      this.logger.warn(`Approval audit write failed for SocialPost ${id}: ${safeLogMessage(error)}`);
    });

    return { success: true, post: updated, externalId };
  }

  /** Atomically claim an APPROVED draft before any external publish side effect. */
  private async claimForPublish(post: SocialPostRecord, actorId: string): Promise<ClaimedSocialPost | null> {
    const now = new Date();
    const attemptId = crypto.randomUUID();
    const metadata = {
      ...safeMetadataRecord(post.metadata),
      publishLock: {
        attemptId,
        actorId: sanitizeActorId(actorId),
        lockedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + PUBLISH_LOCK_MS).toISOString(),
      },
    };

    const socialPostDelegate = this.prisma.socialPost as unknown as {
      updateMany?: (args: unknown) => Promise<{ count: number }>;
      update?: (args: unknown) => Promise<unknown>;
    };

    if (!socialPostDelegate.updateMany) {
      await socialPostDelegate.update?.({
        where: { id: post.id },
        data: { status: SocialPostStatus.PUBLISHING, metadata: metadata as never },
      });
      return { post: { ...post, status: SocialPostStatus.PUBLISHING, metadata }, attemptId };
    }

    const claim = await socialPostDelegate.updateMany({
      where: {
        id: post.id,
        status: SocialPostStatus.APPROVED,
        ...metadataCompareWhere(post.metadata),
      } as never,
      data: { status: SocialPostStatus.PUBLISHING, metadata: metadata as never },
    });

    if (claim.count !== 1) {
      return null;
    }

    return { post: { ...post, status: SocialPostStatus.PUBLISHING, metadata }, attemptId };
  }

  private async markClaimedPostForManualRecovery(
    claimed: ClaimedSocialPost,
    metadataPatch: Record<string, unknown>,
  ): Promise<unknown> {
    return this.updateClaimedPost(claimed, {
      status: SocialPostStatus.PUBLISHING,
      data: {
        metadata: {
          ...safeMetadataRecord(claimed.post.metadata),
          ...metadataPatch,
        } as never,
      },
    });
  }

  private async updateClaimedPost(claimed: ClaimedSocialPost, args: { status: SocialPostStatus; data: Record<string, unknown> }): Promise<unknown> {
    const socialPostDelegate = this.prisma.socialPost as unknown as {
      updateMany?: (args: unknown) => Promise<{ count: number }>;
      update?: (args: unknown) => Promise<unknown>;
    };

    if (!socialPostDelegate.updateMany) {
      return socialPostDelegate.update?.({
        where: { id: claimed.post.id },
        data: args.data as never,
      });
    }

    const updated = await socialPostDelegate.updateMany({
      where: {
        id: claimed.post.id,
        status: args.status,
        metadata: { path: ['publishLock', 'attemptId'], equals: claimed.attemptId },
      } as never,
      data: args.data as never,
    });

    if (updated.count !== 1) {
      throw new BadRequestException('Social draft publish claim expired before completion');
    }

    return this.prisma.socialPost.findUniqueOrThrow({ where: { id: claimed.post.id } });
  }

  private async resolveApprovedSource(input: CreateSocialDraftInput): Promise<{
    productId?: string;
    contentPageId?: string;
    title: string;
    locale?: string;
  }> {
    if (input.sourceType === 'PRODUCT') {
      const product = await this.prisma.product.findUnique({
        where: { id: input.sourceId },
        include: { translations: true },
      }) as ProductSourceRecord | null;

      if (!product || !['ACTIVE', 'READY', 'APPROVED'].includes(product.status)) {
        throw new BadRequestException('Product must be approved, active, or ready before social draft creation');
      }

      const localized = product.translations?.find((translation) => translation.locale === input.locale)
        ?? product.translations?.[0];
      return {
        productId: product.id,
        title: localized?.name ?? product.name ?? product.slug ?? product.id,
        locale: localized?.locale ?? input.locale,
      };
    }

    if (input.sourceType === 'ARTICLE') {
      const article = await this.prisma.articleDraft.findUnique({
        where: { id: input.sourceId },
      }) as ArticleSourceRecord | null;

      if (!article || !['APPROVED', 'PUBLISHED'].includes(article.status)) {
        throw new BadRequestException('Article draft must be approved before social draft creation');
      }

      return {
        contentPageId: article.contentPageId ?? undefined,
        title: article.title ?? article.id,
        locale: article.locale ?? input.locale,
      };
    }

    const contentPage = await this.prisma.contentPage.findUnique({
      where: { id: input.sourceId },
      include: { translations: true },
    }) as ContentPageSourceRecord | null;

    if (!contentPage || !(contentPage.status === 'APPROVED' || contentPage.status === 'PUBLISHED' || contentPage.isPublished === true)) {
      throw new BadRequestException('Content page must be approved or published before social draft creation');
    }

    const localized = contentPage.translations?.find((translation) => translation.locale === input.locale)
      ?? contentPage.translations?.[0];
    return {
      contentPageId: contentPage.id,
      title: localized?.title ?? contentPage.slug ?? contentPage.id,
      locale: localized?.locale ?? input.locale,
    };
  }

  private async publishToPlatform(post: SocialPostRecord): Promise<PublisherResult> {
    if (post.platform === 'telegram') {
      return this.telegram.postMessage(extractTelegramText(post.content));
    }

    return this.twitter.postThread(extractTweetContent(post.content));
  }

  private defaultDraftContent(title: string, locale: string): Array<{ text: string; order: number }> {
    const prefix = locale === 'ar' ? 'مسودة منشور:' : 'Draft post:';
    return [{ text: `${prefix} ${title}`.slice(0, 280), order: 1 }];
  }

  private defaultFormat(platform: string, locale: string): string {
    if (platform === 'telegram') {
      return locale === 'ar' ? 'telegram_ar' : 'telegram_en';
    }
    return locale === 'ar' ? 'single_ar' : 'single_en';
  }
}

function extractTweetContent(content: unknown): TweetContent[] {
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'text' in item) {
          return { text: String((item as { text: unknown }).text) };
        }
        return { text: String(item) };
      })
      .filter((tweet) => tweet.text.trim().length > 0);
  }

  return [{ text: extractTelegramText(content) }];
}

function extractTelegramText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (typeof content === 'object' && content !== null && 'text' in content) {
    return String((content as { text: unknown }).text);
  }

  if (Array.isArray(content)) {
    return extractTweetContent(content).map((tweet) => tweet.text).join('\n\n');
  }

  return '';
}

function safeMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function withoutPublishLock(metadata: unknown): Record<string, unknown> {
  const { publishLock: _publishLock, ...rest } = safeMetadataRecord(metadata);
  return rest;
}

function hasExternalPublishId(result: PublisherResult): boolean {
  return Boolean(result.tweetIds?.length || result.messageId);
}

function metadataCompareWhere(metadata: unknown): Record<string, unknown> {
  if (metadata === null || metadata === undefined) {
    return { metadata: { equals: Prisma.AnyNull } };
  }

  return { metadata: { equals: metadata } };
}

function sanitizeActorId(actorId: string): string {
  return actorId.replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 120);
}

function sanitizePublisherError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/credential|secret|token|api[_ -]?key|access[_ -]?token|missing/i.test(message)) {
    return 'Publisher credentials not configured';
  }
  return 'Publish failed';
}

function safeLogMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
  return message.replace(/[A-Za-z0-9_\-]{16,}/g, '[redacted]');
}
