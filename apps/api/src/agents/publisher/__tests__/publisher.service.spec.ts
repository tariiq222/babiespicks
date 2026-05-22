import { describe, expect, it, vi } from 'vitest';
import { ContentStatus, ContentType } from '@prisma/client';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { QualityGuardService } from '../../quality-guard/quality-guard.service';
import type { IndexNowService } from '../../../infrastructure/publishing/indexnow.service';
import type { GscIndexingService } from '../../../infrastructure/publishing/gsc-indexing.service';
import type { SocialCoordinatorService } from '../../social/social-coordinator.service';
import type { AffiliateService } from '../../../features/affiliate/affiliate.service';
import { PublisherService } from '../publisher.service';

describe('PublisherService approval publishing idempotency', () => {
  function createService(prisma: unknown, affiliateService?: unknown) {
    const qualityGuard = {} as QualityGuardService;
    const indexNow = { notifyAll: vi.fn().mockResolvedValue(undefined) };
    const gscIndexing = { requestIndexing: vi.fn().mockResolvedValue(undefined) };
    const socialCoordinator = { runSocialPipeline: vi.fn().mockResolvedValue(undefined) };
    const affiliate = (affiliateService ?? { persistAffiliateUrlsForProduct: vi.fn().mockResolvedValue(0) }) as AffiliateService;

    return {
      service: new PublisherService(
        prisma as PrismaService,
        qualityGuard,
        indexNow as unknown as IndexNowService,
        gscIndexing as unknown as GscIndexingService,
        socialCoordinator as unknown as SocialCoordinatorService,
        affiliate,
      ),
      indexNow,
      gscIndexing,
      socialCoordinator,
      affiliate,
    };
  }

  it('claims publish work once and does not duplicate PublishedPost or post-publish actions on retry', async () => {
    const approvedPage = {
      id: 'page_concurrent',
      slug: 'safe-strollers',
      type: ContentType.BEST_LIST,
      status: ContentStatus.APPROVED,
      isPublished: false,
      publishedAt: null,
      seoScore: 91,
      qualityScore: 88,
    };
    const publishedPage = {
      ...approvedPage,
      status: ContentStatus.PUBLISHED,
      isPublished: true,
      publishedAt: new Date('2026-05-20T12:00:00.000Z'),
    };
    let currentPage: { status: ContentStatus; isPublished: boolean } = { ...approvedPage };

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
      contentPage: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce(approvedPage)
          .mockResolvedValueOnce(approvedPage)
          .mockResolvedValueOnce(publishedPage),
        updateMany: vi.fn(async () => {
          if (!currentPage.isPublished && currentPage.status === ContentStatus.APPROVED) {
            currentPage = { ...publishedPage };
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      publishedPost: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'published_1' }),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
      },
    };
    const { service, indexNow, gscIndexing, socialCoordinator } = createService(prisma);

    const first = await service.approveAndPublish('page_concurrent');
    const second = await service.approveAndPublish('page_concurrent');

    expect(first).toEqual({ published: true });
    expect(second).toEqual({ published: true, idempotent: true });
    expect(prisma.contentPage.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.contentPage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'page_concurrent',
        status: { in: [ContentStatus.APPROVED, ContentStatus.SCHEDULED] },
        isPublished: false,
      },
    }));
    expect(prisma.publishedPost.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.publishedPost.create).toHaveBeenCalledTimes(1);
    expect(prisma.approvalAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(indexNow.notifyAll).toHaveBeenCalledTimes(1);
    expect(gscIndexing.requestIndexing).toHaveBeenCalledTimes(1);
    expect(socialCoordinator.runSocialPipeline).toHaveBeenCalledTimes(1);
  });

  it('does not create a second website PublishedPost when one already exists during the claim', async () => {
    const page = {
      id: 'page_existing_post',
      slug: 'existing-post-log',
      type: ContentType.BUYING_GUIDE,
      status: ContentStatus.SCHEDULED,
      isPublished: false,
      publishedAt: null,
      seoScore: 80,
      qualityScore: 82,
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
      contentPage: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(page),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      publishedPost: {
        findFirst: vi.fn().mockResolvedValue({ id: 'published_existing' }),
        create: vi.fn(),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_existing_post' }),
      },
    };
    const { service } = createService(prisma);

    await expect(service.approveAndPublish('page_existing_post')).resolves.toEqual({ published: true });

    expect(prisma.publishedPost.findFirst).toHaveBeenCalledWith({
      where: { contentPageId: 'page_existing_post', channel: 'website' },
      select: { id: true },
    });
    expect(prisma.publishedPost.create).not.toHaveBeenCalled();
  });
});

describe('PublisherService.publishVerdict affiliate persistence', () => {
  function createService(prisma: unknown, affiliateService?: unknown) {
    const qualityGuard = {} as QualityGuardService;
    const indexNow = { notifyAll: vi.fn().mockResolvedValue(undefined) };
    const gscIndexing = { requestIndexing: vi.fn().mockResolvedValue(undefined) };
    const socialCoordinator = { runSocialPipeline: vi.fn().mockResolvedValue(undefined) };
    const affiliate = (affiliateService ?? { persistAffiliateUrlsForProduct: vi.fn().mockResolvedValue(0) }) as AffiliateService;

    return {
      service: new PublisherService(
        prisma as PrismaService,
        qualityGuard,
        indexNow as unknown as IndexNowService,
        gscIndexing as unknown as GscIndexingService,
        socialCoordinator as unknown as SocialCoordinatorService,
        affiliate,
      ),
    };
  }

  it('calls persistAffiliateUrlsForProduct before marking verdict published', async () => {
    let callOrder: string[] = [];
    let capturedTx: unknown;

    const persistMock = vi.fn().mockImplementation((productId: string, tx?: unknown) => {
      callOrder.push('affiliate.persist');
      capturedTx = tx;
      return Promise.resolve(1);
    });
    const prisma = {
      verdict: {
        findUnique: vi.fn().mockResolvedValue({ productId: 'prod_1', type: 'WORTH_IT', isPublished: false }),
        update: vi.fn().mockImplementation(() => { callOrder.push('verdict.update'); return {}; }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        // Simulate a real transaction by passing a tx object
        const fakeTx = {
          verdict: prisma.verdict,
        };
        return fn(fakeTx);
      }),
    };
    const affiliate = { persistAffiliateUrlsForProduct: persistMock };

    const { service } = createService(prisma, affiliate);
    const result = await service.publishVerdict('prod_1');

    expect(result).toEqual({ published: true });
    expect(persistMock).toHaveBeenCalledWith('prod_1', expect.any(Object));
    // Verify tx was passed to persistAffiliateUrlsForProduct (transaction context)
    expect(capturedTx).toBeDefined();
    expect(callOrder).toEqual(['affiliate.persist', 'verdict.update']);
  });

  it('returns published:false when verdict does not exist', async () => {
    const persistMock = vi.fn();
    const prisma = {
      verdict: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const affiliate = { persistAffiliateUrlsForProduct: persistMock };

    const { service } = createService(prisma, affiliate);
    const result = await service.publishVerdict('nonexistent');

    expect(result).toEqual({ published: false });
    expect(persistMock).not.toHaveBeenCalled();
    expect(prisma.verdict.update).not.toHaveBeenCalled();
  });
});
