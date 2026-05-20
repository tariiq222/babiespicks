import { ContentStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ApprovalController } from '../approval.controller';

describe('ApprovalController security decisions', () => {
  const attachImmediateTransaction = <T extends Record<string, unknown>>(prisma: T): T & {
    $transaction: <R>(fn: (tx: T) => Promise<R>) => Promise<R>;
  } => ({
    ...prisma,
    $transaction: vi.fn(async (fn: (tx: T) => Promise<unknown>) => fn(prisma)) as <R>(
      fn: (tx: T) => Promise<R>,
    ) => Promise<R>,
  });

  it('ignores approvedBy body spoofing and stores the server-derived actor', async () => {
    const now = new Date();
    const mockPage = {
      id: 'page_1',
      slug: 'best-strollers',
      status: ContentStatus.PENDING_APPROVAL,
      seoScore: 91,
      qualityScore: 88,
    };
    const mockPrisma = {
      contentPage: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(mockPage),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({
          ...mockPage,
          status: ContentStatus.PUBLISHED,
          approvedBy: 'admin-api-key',
          approvedAt: now,
        }),
      },
      publishedPost: {
        create: vi.fn().mockResolvedValue({ id: 'published_1' }),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
      },
    };
    const prismaWithTransaction = attachImmediateTransaction(mockPrisma);
    const controller = new ApprovalController(prismaWithTransaction as unknown as PrismaService);

    await controller.approve('page_1', { approvedBy: 'spoofed-admin' });

    expect(mockPrisma.contentPage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'page_1', status: ContentStatus.PENDING_APPROVAL },
        data: expect.objectContaining({ approvedBy: 'admin-api-key' }),
      }),
    );
    expect(mockPrisma.contentPage.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvedBy: 'spoofed-admin' }),
      }),
    );
    expect(mockPrisma.publishedPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ approvedBy: 'admin-api-key' }),
        }),
      }),
    );
    expect(mockPrisma.approvalAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'ADMIN_API_KEY',
        actorId: 'admin-api-key',
        action: 'APPROVED',
        entityType: 'CONTENT_PAGE',
        entityId: 'page_1',
      }),
    });
    expect(mockPrisma.approvalAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'ADMIN_API_KEY',
        actorId: 'admin-api-key',
        action: 'PUBLISHED',
        entityType: 'CONTENT_PAGE',
        entityId: 'page_1',
      }),
    });
    expect(prismaWithTransaction.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back content approval when audit creation fails', async () => {
    const store = {
      id: 'page_rollback',
      slug: 'rollback-check',
      status: ContentStatus.PENDING_APPROVAL,
      seoScore: 91,
      qualityScore: 88,
      approvedBy: null as string | null,
    };
    const txStore = { ...store };
    const tx = {
      contentPage: {
        updateMany: vi.fn(async ({ data }: any) => {
          Object.assign(txStore, data);
          return { count: 1 };
        }),
      },
      publishedPost: {
        create: vi.fn().mockResolvedValue({ id: 'published_rollback' }),
      },
      approvalAuditEvent: {
        create: vi.fn().mockRejectedValue(new Error('audit write failed')),
      },
    };
    const mockPrisma = {
      contentPage: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(store),
      },
      $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => {
        try {
          const result = await fn(tx);
          Object.assign(store, txStore);
          return result;
        } catch (error) {
          return Promise.reject(error);
        }
      }),
    };
    const controller = new ApprovalController(mockPrisma as unknown as PrismaService);

    await expect(controller.approve('page_rollback', {})).rejects.toThrow('audit write failed');

    expect(store.status).toBe(ContentStatus.PENDING_APPROVAL);
    expect(store.approvedBy).toBeNull();
    expect(tx.contentPage.updateMany).toHaveBeenCalled();
    expect(tx.approvalAuditEvent.create).toHaveBeenCalled();
  });

  it('records PUBLISHED audit events for scheduled content publishing', async () => {
    const duePage = {
      id: 'page_scheduled',
      slug: 'scheduled-post',
      status: ContentStatus.SCHEDULED,
      scheduledAt: new Date(Date.now() - 1000),
    };
    const mockPrisma = {
      contentPage: {
        findMany: vi.fn().mockResolvedValue([duePage]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ ...duePage, status: ContentStatus.PUBLISHED }),
      },
      publishedPost: {
        create: vi.fn().mockResolvedValue({ id: 'published_scheduled' }),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_scheduled' }),
      },
    };
    const prismaWithTransaction = attachImmediateTransaction(mockPrisma);
    const controller = new ApprovalController(prismaWithTransaction as unknown as PrismaService);

    const result = await controller.publishScheduled();

    expect(result.published).toBe(1);
    expect(mockPrisma.approvalAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'ADMIN_API_KEY',
        actorId: 'admin-api-key',
        action: 'PUBLISHED',
        entityType: 'CONTENT_PAGE',
        entityId: 'page_scheduled',
      }),
    });
  });

  it('routes content approval through PublisherService so post-publish actions can run', async () => {
    const mockPage = {
      id: 'page_auto_publish',
      slug: 'auto-publish',
      status: ContentStatus.PENDING_APPROVAL,
      seoScore: 92,
      qualityScore: 90,
    };
    const mockPrisma = {
      contentPage: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(mockPage),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ ...mockPage, status: ContentStatus.APPROVED }),
      },
      approvalAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'audit_auto_publish' }),
      },
    };
    const prismaWithTransaction = attachImmediateTransaction(mockPrisma);
    const publisher = {
      approveAndPublish: vi.fn().mockResolvedValue({ published: true }),
    };
    const controller = new ApprovalController(
      prismaWithTransaction as unknown as PrismaService,
      publisher as never,
    );

    const result = await controller.approve('page_auto_publish', { approvedBy: 'spoofed-admin' });

    expect(result).toEqual(expect.objectContaining({ success: true, status: 'PUBLISHED' }));
    expect(mockPrisma.contentPage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'page_auto_publish', status: ContentStatus.PENDING_APPROVAL },
      data: expect.objectContaining({
        status: ContentStatus.APPROVED,
        approvedBy: 'admin-api-key',
      }),
    }));
    expect(publisher.approveAndPublish).toHaveBeenCalledWith('page_auto_publish');
  });
});
