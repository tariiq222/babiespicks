import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/infrastructure/database/prisma.service';
import { ArticlePipelineService } from '../src/features/content/article-pipeline.service';

const SERVER_APPROVAL_ACTOR_ID = 'admin-api-key';

const articleInput = (overrides: Record<string, unknown> = {}) => ({
  locale: 'ar',
  type: 'BEST_LIST',
  title: 'أفضل عربات الأطفال للسفر',
  slug: 'best-travel-strollers',
  content: 'Long-form bilingual editorial article body.',
  seo: {
    metaTitle: 'أفضل عربات الأطفال للسفر',
    metaDescription: 'مقارنة عملية لأفضل عربات الأطفال المناسبة للسفر.',
  },
  productIds: ['prod_approved'],
  ...overrides,
});

describe('ArticlePipelineService', () => {
  describe('createArticleDraft', () => {
    it('rejects product references unless every product is ready or active', async () => {
      const prisma = {
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 'prod_active', status: 'ACTIVE' }]),
        },
        articleDraft: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
      };
      const service = new ArticlePipelineService(prisma as unknown as PrismaService);

      await expect(
        service.createArticleDraft(
          articleInput({ productIds: ['prod_approved', 'prod_discovered'] }),
        ),
      ).rejects.toThrow(/ready|active/i);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['prod_approved', 'prod_discovered'] },
            status: { in: ['READY', 'ACTIVE'] },
          }),
        }),
      );
      expect(prisma.articleDraft.create).not.toHaveBeenCalled();
    });

    it('rejects article generation from rejected product drafts', async () => {
      const prisma = {
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 'prod_approved', status: 'ACTIVE' }]),
        },
        productDraft: {
          findMany: vi.fn().mockResolvedValue([{ id: 'draft_rejected', status: 'REJECTED' }]),
        },
        articleDraft: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
      };
      const service = new ArticlePipelineService(prisma as unknown as PrismaService);

      await expect(
        service.createArticleDraft(
          articleInput({ sourceProductDraftIds: ['draft_rejected'] }),
        ),
      ).rejects.toThrow(/rejected/i);

      expect(prisma.productDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['draft_rejected'] },
            status: 'REJECTED',
          }),
        }),
      );
      expect(prisma.articleDraft.create).not.toHaveBeenCalled();
    });

    it('creates a needs-review ArticleDraft with locale, type, title, slug, content, seo, and productIds', async () => {
      const createdDraft = {
        id: 'article_1',
        ...articleInput(),
        status: 'NEEDS_REVIEW',
      };
      const prisma = {
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 'prod_approved', status: 'ACTIVE' }]),
        },
        articleDraft: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(createdDraft),
        },
      };
      const service = new ArticlePipelineService(prisma as unknown as PrismaService);

      const result = await service.createArticleDraft(articleInput());

      expect(result).toEqual(createdDraft);
      expect(prisma.articleDraft.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          locale: 'ar',
          type: 'BEST_LIST',
          title: 'أفضل عربات الأطفال للسفر',
          slug: 'best-travel-strollers',
          content: 'Long-form bilingual editorial article body.',
          seo: expect.objectContaining({
            metaTitle: 'أفضل عربات الأطفال للسفر',
            metaDescription: 'مقارنة عملية لأفضل عربات الأطفال المناسبة للسفر.',
          }),
          productIds: ['prod_approved'],
          status: 'NEEDS_REVIEW',
        }),
      });
    });

    it('enforces slug uniqueness per locale while allowing the same slug in another locale', async () => {
      const existingArabicDraft = {
        id: 'article_ar_existing',
        locale: 'ar',
        slug: 'shared-baby-monitor-guide',
      };
      const prisma = {
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 'prod_approved', status: 'ACTIVE' }]),
        },
        articleDraft: {
          findUnique: vi.fn().mockImplementation(({ where }: any) => {
            if (where.locale_slug?.locale === 'ar') {
              return Promise.resolve(existingArabicDraft);
            }

            return Promise.resolve(null);
          }),
          create: vi.fn().mockImplementation(({ data }: any) =>
            Promise.resolve({ id: `article_${data.locale}`, ...data }),
          ),
        },
      };
      const service = new ArticlePipelineService(prisma as unknown as PrismaService);

      await expect(
        service.createArticleDraft(
          articleInput({ locale: 'ar', slug: 'shared-baby-monitor-guide' }),
        ),
      ).rejects.toThrow(/slug|locale|unique/i);

      await expect(
        service.createArticleDraft(
          articleInput({ locale: 'en', slug: 'shared-baby-monitor-guide' }),
        ),
      ).resolves.toMatchObject({
        id: 'article_en',
        locale: 'en',
        slug: 'shared-baby-monitor-guide',
        status: 'NEEDS_REVIEW',
      });
    });
  });

  describe('publishArticleDraft', () => {
    it('does not publish a draft that has not been approved', async () => {
      const pendingDraft = {
        id: 'article_pending',
        status: 'NEEDS_REVIEW',
        locale: 'ar',
        type: 'BEST_LIST',
        title: 'أفضل الكراسي',
        slug: 'best-high-chairs',
        content: 'Article body',
        seo: {},
        productIds: ['prod_approved'],
      };
      const tx = {
        articleDraft: {
          findUnique: vi.fn().mockResolvedValue(pendingDraft),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        contentPage: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        contentPageTranslation: {
          upsert: vi.fn(),
        },
        approvalAuditEvent: {
          create: vi.fn(),
        },
      };
      const prisma = {
        $transaction: vi.fn((fn: (transaction: typeof tx) => Promise<unknown>) =>
          fn(tx),
        ),
      };
      const service = new ArticlePipelineService(prisma as unknown as PrismaService);

      await expect(service.publishArticleDraft('article_pending')).rejects.toThrow(
        /approved/i,
      );

      expect(tx.articleDraft.updateMany).toHaveBeenCalledWith({
        where: { id: 'article_pending', status: 'APPROVED' },
        data: { status: 'PUBLISHED' },
      });
      expect(tx.contentPage.create).not.toHaveBeenCalled();
      expect(tx.contentPage.update).not.toHaveBeenCalled();
      expect(tx.contentPageTranslation.upsert).not.toHaveBeenCalled();
      expect(tx.approvalAuditEvent.create).not.toHaveBeenCalled();
    });

    it('publishes ContentPage, translation, ArticleDraft, and audit event transactionally', async () => {
      const storedDraft = {
        id: 'article_approved',
        status: 'APPROVED',
        contentPageId: null as string | null,
        locale: 'ar',
        type: 'BEST_LIST',
        title: 'أفضل عربات الأطفال للسفر',
        slug: 'best-travel-strollers',
        content: 'Long-form bilingual editorial article body.',
        seo: {
          metaTitle: 'أفضل عربات الأطفال للسفر',
          metaDescription: 'مقارنة عملية لأفضل عربات الأطفال المناسبة للسفر.',
          excerpt: 'مختصر المقالة',
        },
        productIds: ['prod_approved'],
      };
      const contentPages: Array<Record<string, unknown>> = [];
      const audits: Array<Record<string, unknown>> = [];
      const txDraft = { ...storedDraft };
      const tx = {
        articleDraft: {
          findUnique: vi.fn().mockImplementation(() => Promise.resolve(txDraft)),
          updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
            if (where.status && txDraft.status !== where.status) {
              return Promise.resolve({ count: 0 });
            }

            Object.assign(txDraft, data);
            return Promise.resolve({ count: 1 });
          }),
        },
        contentPage: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }: any) => {
            const page = { id: 'content_page_1', ...data };
            contentPages.push(page);
            return Promise.resolve(page);
          }),
          update: vi.fn(),
        },
        contentPageTranslation: {
          upsert: vi.fn(),
        },
        approvalAuditEvent: {
          create: vi.fn().mockImplementation(({ data }: any) => {
            audits.push(data);
            return Promise.resolve({ id: 'audit_1', ...data });
          }),
        },
      };
      const prisma = {
        $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => {
          const result = await fn(tx);
          Object.assign(storedDraft, txDraft);
          return result;
        }),
      };
      const service = new ArticlePipelineService(prisma as unknown as PrismaService);

      const result = await service.publishArticleDraft('article_approved');

      expect(result).toMatchObject({
        id: 'article_approved',
        status: 'PUBLISHED',
        contentPageId: 'content_page_1',
      });
      expect(tx.articleDraft.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'article_approved', status: 'APPROVED' },
        data: { status: 'PUBLISHED' },
      });
      expect(tx.contentPage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'best-travel-strollers',
          status: 'PUBLISHED',
          translations: {
            create: expect.objectContaining({
              locale: 'ar',
              title: 'أفضل عربات الأطفال للسفر',
              content: 'Long-form bilingual editorial article body.',
              metaDescription: 'مقارنة عملية لأفضل عربات الأطفال المناسبة للسفر.',
              excerpt: 'مختصر المقالة',
            }),
          },
        }),
      });
      expect(tx.articleDraft.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'article_approved', status: 'PUBLISHED' },
        data: { contentPageId: 'content_page_1' },
      });
      expect(tx.approvalAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorType: 'ADMIN_API_KEY',
          actorId: SERVER_APPROVAL_ACTOR_ID,
          action: 'PUBLISHED',
          entityType: 'ARTICLE_DRAFT',
          entityId: 'article_approved',
          metadata: expect.objectContaining({ contentPageId: 'content_page_1' }),
        }),
      });
      expect(storedDraft.status).toBe('PUBLISHED');
      expect(contentPages).toHaveLength(1);
      expect(audits).toHaveLength(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rolls back article publish when the audit event write fails', async () => {
      const storedDraft = {
        id: 'article_publish_rollback',
        status: 'APPROVED',
        contentPageId: null as string | null,
        locale: 'ar',
        type: 'BEST_LIST',
        title: 'أفضل أسرّة الأطفال',
        slug: 'best-baby-cribs',
        content: 'Article body',
        seo: {},
        productIds: ['prod_approved'],
      };
      const committedContentPages: Array<Record<string, unknown>> = [];
      const txDraft = { ...storedDraft };
      const txContentPages: Array<Record<string, unknown>> = [];
      const tx = {
        articleDraft: {
          findUnique: vi.fn().mockImplementation(() => Promise.resolve(txDraft)),
          updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
            if (where.status && txDraft.status !== where.status) {
              return Promise.resolve({ count: 0 });
            }

            Object.assign(txDraft, data);
            return Promise.resolve({ count: 1 });
          }),
        },
        contentPage: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }: any) => {
            const page = { id: 'content_page_rollback', ...data };
            txContentPages.push(page);
            return Promise.resolve(page);
          }),
          update: vi.fn(),
        },
        contentPageTranslation: {
          upsert: vi.fn(),
        },
        approvalAuditEvent: {
          create: vi.fn().mockRejectedValue(new Error('audit write failed')),
        },
      };
      const prisma = {
        $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => {
          const result = await fn(tx);
          Object.assign(storedDraft, txDraft);
          committedContentPages.push(...txContentPages);
          return result;
        }),
      };
      const service = new ArticlePipelineService(prisma as unknown as PrismaService);

      await expect(
        service.publishArticleDraft('article_publish_rollback'),
      ).rejects.toThrow('audit write failed');

      expect(storedDraft.status).toBe('APPROVED');
      expect(storedDraft.contentPageId).toBeNull();
      expect(committedContentPages).toHaveLength(0);
      expect(txContentPages).toHaveLength(1);
      expect(tx.articleDraft.updateMany).toHaveBeenCalled();
      expect(tx.contentPage.create).toHaveBeenCalled();
      expect(tx.approvalAuditEvent.create).toHaveBeenCalled();
    });
  });

  describe('approval transitions', () => {
    it.each([
      ['approveArticleDraft', 'APPROVED', 'APPROVED', { reason: 'جاهز للنشر' }],
      ['rejectArticleDraft', 'REJECTED', 'REJECTED', { reason: 'مصادر غير كافية' }],
      [
        'requestArticleDraftRevision',
        'NEEDS_REVIEW',
        'REVISION_REQUESTED',
        { notes: 'أضف مقارنة أسعار أوضح' },
      ],
    ] as const)(
      '%s changes status and writes an ApprovalAuditEvent in the same transaction',
      async (methodName, expectedStatus, expectedAuditAction, body) => {
        const storedDraft = {
          id: `article_${expectedStatus.toLowerCase()}`,
          status: 'NEEDS_REVIEW',
          approvedBy: null as string | null,
          approvedAt: null as Date | null,
          rejectedBy: null as string | null,
          rejectedAt: null as Date | null,
          rejectionReason: null as string | null,
          revisionNotes: null as string | null,
        };
        const txDraft = { ...storedDraft };
        const tx = {
          articleDraft: {
            updateMany: vi.fn(async ({ data }: any) => {
              Object.assign(txDraft, data);
              return { count: 1 };
            }),
            findUnique: vi.fn().mockResolvedValue(txDraft),
          },
          approvalAuditEvent: {
            create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
          },
        };
        const prisma = {
          articleDraft: {
            findUnique: vi.fn().mockResolvedValue(storedDraft),
          },
          $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => {
            const result = await fn(tx);
            Object.assign(storedDraft, txDraft);
            return result;
          }),
        };
        const service = new ArticlePipelineService(prisma as unknown as PrismaService);

        const result = await service[methodName](storedDraft.id, body);

        expect(result).toMatchObject({ status: expectedStatus });
        expect(tx.articleDraft.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: storedDraft.id,
              status: 'NEEDS_REVIEW',
            }),
            data: expect.objectContaining({ status: expectedStatus }),
          }),
        );
        expect(tx.approvalAuditEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            actorType: 'ADMIN_API_KEY',
            actorId: SERVER_APPROVAL_ACTOR_ID,
            action: expectedAuditAction,
            entityType: 'ARTICLE_DRAFT',
            entityId: storedDraft.id,
          }),
        });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      },
    );

    it('rolls back article approval when the audit event write fails', async () => {
      const storedDraft = {
        id: 'article_rollback',
        status: 'NEEDS_REVIEW',
        approvedBy: null as string | null,
      };
      const txDraft = { ...storedDraft };
      const tx = {
        articleDraft: {
          updateMany: vi.fn(async ({ data }: any) => {
            Object.assign(txDraft, data);
            return { count: 1 };
          }),
          findUnique: vi.fn().mockResolvedValue(txDraft),
        },
        approvalAuditEvent: {
          create: vi.fn().mockRejectedValue(new Error('audit write failed')),
        },
      };
      const prisma = {
        articleDraft: {
          findUnique: vi.fn().mockResolvedValue(storedDraft),
        },
        $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => {
          try {
            const result = await fn(tx);
            Object.assign(storedDraft, txDraft);
            return result;
          } catch (error) {
            return Promise.reject(error);
          }
        }),
      };
      const service = new ArticlePipelineService(prisma as unknown as PrismaService);

      await expect(
        service.approveArticleDraft('article_rollback', { reason: 'ready' }),
      ).rejects.toThrow('audit write failed');

      expect(storedDraft.status).toBe('NEEDS_REVIEW');
      expect(storedDraft.approvedBy).toBeNull();
      expect(tx.articleDraft.updateMany).toHaveBeenCalled();
      expect(tx.approvalAuditEvent.create).toHaveBeenCalled();
    });
  });
});
