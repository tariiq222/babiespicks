import { beforeEach, describe, expect, it, vi } from 'vitest';

type SocialDraftServiceCtor = new (...args: any[]) => {
  createSocialDraft: (input: Record<string, unknown>) => Promise<any>;
  publishSocialDraft: (id: string, options?: Record<string, unknown>) => Promise<any>;
};

async function loadSocialDraftService(): Promise<SocialDraftServiceCtor> {
  const modulePath = new URL('../../src/agents/social/social-drafts.service.ts', import.meta.url).href;
  const mod = await import(modulePath);
  expect(mod.SocialDraftService).toBeTypeOf('function');
  return mod.SocialDraftService as SocialDraftServiceCtor;
}

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const prisma = {
    product: {
      findUnique: vi.fn(),
    },
    articleDraft: {
      findUnique: vi.fn(),
    },
    socialPost: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    approvalAuditEvent: {
      create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    ...overrides,
  };

  return prisma;
}

function createPublishers() {
  return {
    twitter: {
      postThread: vi.fn(),
    },
    telegram: {
      postMessage: vi.fn(),
    },
  };
}

describe('SocialDraftService contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TWITTER_BEARER_TOKEN;
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHANNEL_ID;
  });

  it('createSocialDraft creates a pending social draft from an approved/active Product without publishing', async () => {
    const SocialDraftService = await loadSocialDraftService();
    const prisma = createPrismaMock();
    prisma.product.findUnique.mockResolvedValue({
      id: 'prod_active',
      status: 'ACTIVE',
      slug: 'safe-car-seat',
      translations: [{ locale: 'ar', name: 'كرسي سيارة آمن' }],
    });
    prisma.socialPost.create.mockResolvedValue({
      id: 'social_prod_1',
      productId: 'prod_active',
      status: 'PENDING_APPROVAL',
    });
    const publishers = createPublishers();
    const service = new SocialDraftService(prisma, publishers.twitter, publishers.telegram);

    const result = await service.createSocialDraft({
      sourceType: 'PRODUCT',
      sourceId: 'prod_active',
      platform: 'twitter',
      locale: 'ar',
      idempotencyKey: 'social:product:prod_active:twitter:ar',
    });

    expect(result.id).toBe('social_prod_1');
    expect(prisma.product.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prod_active' } }),
    );
    expect(prisma.socialPost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'prod_active',
        platform: 'twitter',
        status: 'PENDING_APPROVAL',
        metadata: expect.objectContaining({
          sourceType: 'PRODUCT',
          idempotencyKey: 'social:product:prod_active:twitter:ar',
        }),
      }),
    });
    expect(publishers.twitter.postThread).not.toHaveBeenCalled();
    expect(publishers.telegram.postMessage).not.toHaveBeenCalled();
  });

  it('createSocialDraft rejects Products that are not approved/active', async () => {
    const SocialDraftService = await loadSocialDraftService();
    const prisma = createPrismaMock();
    prisma.product.findUnique.mockResolvedValue({
      id: 'prod_discovered',
      status: 'DISCOVERED',
      slug: 'unapproved-product',
    });
    const publishers = createPublishers();
    const service = new SocialDraftService(prisma, publishers.twitter, publishers.telegram);

    await expect(
      service.createSocialDraft({
        sourceType: 'PRODUCT',
        sourceId: 'prod_discovered',
        platform: 'telegram',
        locale: 'ar',
        idempotencyKey: 'social:product:prod_discovered:telegram:ar',
      }),
    ).rejects.toThrow(/approved|active|ready/i);

    expect(prisma.socialPost.create).not.toHaveBeenCalled();
    expect(publishers.telegram.postMessage).not.toHaveBeenCalled();
  });

  it('createSocialDraft accepts only approved ArticleDraft records', async () => {
    const SocialDraftService = await loadSocialDraftService();
    const prisma = createPrismaMock();
    prisma.articleDraft.findUnique
      .mockResolvedValueOnce({
        id: 'article_approved',
        status: 'APPROVED',
        contentPageId: 'page_approved',
        locale: 'ar',
        title: 'أفضل عربات الأطفال',
      })
      .mockResolvedValueOnce({
        id: 'article_draft',
        status: 'DRAFT',
        contentPageId: null,
      });
    prisma.socialPost.create.mockResolvedValue({
      id: 'social_article_1',
      contentPageId: 'page_approved',
      status: 'PENDING_APPROVAL',
    });
    const publishers = createPublishers();
    const service = new SocialDraftService(prisma, publishers.twitter, publishers.telegram);

    await expect(
      service.createSocialDraft({
        sourceType: 'ARTICLE',
        sourceId: 'article_approved',
        platform: 'telegram',
        locale: 'ar',
        idempotencyKey: 'social:article:article_approved:telegram:ar',
      }),
    ).resolves.toMatchObject({ id: 'social_article_1' });

    expect(prisma.socialPost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentPageId: 'page_approved',
        status: 'PENDING_APPROVAL',
        metadata: expect.objectContaining({ sourceType: 'ARTICLE' }),
      }),
    });

    await expect(
      service.createSocialDraft({
        sourceType: 'ARTICLE',
        sourceId: 'article_draft',
        platform: 'twitter',
        locale: 'en',
        idempotencyKey: 'social:article:article_draft:twitter:en',
      }),
    ).rejects.toThrow(/approved/i);
  });

  it('uses idempotency to return the existing social draft instead of creating duplicates', async () => {
    const SocialDraftService = await loadSocialDraftService();
    const existing = {
      id: 'social_existing',
      status: 'PENDING_APPROVAL',
      metadata: { idempotencyKey: 'social:product:prod_active:twitter:ar' },
    };
    const prisma = createPrismaMock();
    prisma.product.findUnique.mockResolvedValue({ id: 'prod_active', status: 'ACTIVE' });
    prisma.socialPost.findFirst.mockResolvedValue(existing);
    const publishers = createPublishers();
    const service = new SocialDraftService(prisma, publishers.twitter, publishers.telegram);

    const result = await service.createSocialDraft({
      sourceType: 'PRODUCT',
      sourceId: 'prod_active',
      platform: 'twitter',
      locale: 'ar',
      idempotencyKey: 'social:product:prod_active:twitter:ar',
    });

    expect(result).toBe(existing);
    expect(prisma.socialPost.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        metadata: expect.objectContaining({
          path: ['idempotencyKey'],
          equals: 'social:product:prod_active:twitter:ar',
        }),
      }),
    });
    expect(prisma.socialPost.create).not.toHaveBeenCalled();
  });

  it('publishSocialDraft refuses to publish anything that is not APPROVED', async () => {
    const SocialDraftService = await loadSocialDraftService();
    const prisma = createPrismaMock();
    prisma.socialPost.findUniqueOrThrow.mockResolvedValue({
      id: 'social_pending',
      status: 'PENDING_APPROVAL',
      platform: 'twitter',
      content: [{ text: 'لا تنشر قبل الموافقة' }],
    });
    const publishers = createPublishers();
    const service = new SocialDraftService(prisma, publishers.twitter, publishers.telegram);

    await expect(service.publishSocialDraft('social_pending', { trigger: 'manual' })).rejects.toThrow(/APPROVED/i);

    expect(publishers.twitter.postThread).not.toHaveBeenCalled();
    expect(publishers.telegram.postMessage).not.toHaveBeenCalled();
    expect(prisma.socialPost.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
  });

  it('sanitizes Twitter and Telegram missing-credential failures without leaking secret values', async () => {
    const SocialDraftService = await loadSocialDraftService();
    process.env.TWITTER_API_SECRET = 'tw_secret_should_never_escape';
    process.env.TELEGRAM_BOT_TOKEN = 'tg_token_should_never_escape';

    const prisma = createPrismaMock();
    prisma.socialPost.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'social_twitter',
        status: 'APPROVED',
        platform: 'twitter',
        content: [{ text: 'approved tweet' }],
      })
      .mockResolvedValueOnce({
        id: 'social_telegram',
        status: 'APPROVED',
        platform: 'telegram',
        content: { text: 'approved telegram message' },
      });
    prisma.socialPost.update.mockImplementation(async ({ data }: any) => ({ id: 'updated', ...data }));
    const publishers = {
      twitter: {
        postThread: vi.fn().mockResolvedValue({
          success: false,
          tweetIds: [],
          error: `Missing Twitter credential: ${process.env.TWITTER_API_SECRET}`,
        }),
      },
      telegram: {
        postMessage: vi.fn().mockResolvedValue({
          success: false,
          error: `Missing Telegram credential: ${process.env.TELEGRAM_BOT_TOKEN}`,
        }),
      },
    };
    const service = new SocialDraftService(prisma, publishers.twitter, publishers.telegram);

    const twitterResult = await service.publishSocialDraft('social_twitter', { trigger: 'manual' });
    const telegramResult = await service.publishSocialDraft('social_telegram', { trigger: 'manual' });

    const serializedResults = JSON.stringify([twitterResult, telegramResult]);
    const serializedUpdates = JSON.stringify(prisma.socialPost.update.mock.calls);

    expect(serializedResults).not.toContain('tw_secret_should_never_escape');
    expect(serializedResults).not.toContain('tg_token_should_never_escape');
    expect(serializedUpdates).not.toContain('tw_secret_should_never_escape');
    expect(serializedUpdates).not.toContain('tg_token_should_never_escape');
    expect(serializedResults).toMatch(/credentials? not configured|publish failed/i);
  });
});
