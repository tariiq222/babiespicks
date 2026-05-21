import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ContentDraftService } from '../content-draft.service';

describe('ContentDraftService', () => {
  const mockPrisma = () => ({
    contentDraft: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    offerEnrichment: {
      findUnique: vi.fn(),
    },
  });

  describe('getDraft', () => {
    it('returns draft when found', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        sourceOfferEnrichmentId: 'enrich_1',
        contentType: 'article',
        title: 'Test Article',
        body: 'Content here',
        status: 'DRAFT',
      };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.getDraft('draft_1');

      expect(result).toBe(draft);
    });

    it('throws NotFoundException when draft not found', async () => {
      const prisma = mockPrisma();
      prisma.contentDraft.findUnique.mockResolvedValue(null);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await expect(service.getDraft('draft_missing')).rejects.toThrow(
        'ContentDraft draft_missing was not found',
      );
    });
  });

  describe('listDrafts', () => {
    it('returns paginated drafts', async () => {
      const prisma = mockPrisma();
      const drafts = [
        { id: 'draft_1', contentType: 'article', status: 'DRAFT' },
        { id: 'draft_2', contentType: 'social_post', status: 'APPROVED' },
      ];
      prisma.contentDraft.findMany.mockResolvedValue(drafts);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.listDrafts({ limit: 10, offset: 0 });

      expect(prisma.contentDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
      expect(result).toBe(drafts);
    });

    it('clamps pagination limits to max values', async () => {
      const prisma = mockPrisma();
      prisma.contentDraft.findMany.mockResolvedValue([]);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await service.listDrafts({ limit: 500, offset: 20000 });

      expect(prisma.contentDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10000,
          take: 100,
        }),
      );
    });

    it('filters by status when provided', async () => {
      const prisma = mockPrisma();
      prisma.contentDraft.findMany.mockResolvedValue([]);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await service.listDrafts({ status: 'APPROVED' });

      expect(prisma.contentDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
    });

    it('filters by contentType when provided', async () => {
      const prisma = mockPrisma();
      prisma.contentDraft.findMany.mockResolvedValue([]);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await service.listDrafts({ contentType: 'article' });

      expect(prisma.contentDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ contentType: 'article' }),
        }),
      );
    });

    it('filters by sourceOfferEnrichmentId when provided', async () => {
      const prisma = mockPrisma();
      prisma.contentDraft.findMany.mockResolvedValue([]);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await service.listDrafts({ sourceOfferEnrichmentId: 'enrich_1' });

      expect(prisma.contentDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sourceOfferEnrichmentId: 'enrich_1' }),
        }),
      );
    });
  });

  describe('updateDraft', () => {
    it('updates editable fields', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        sourceOfferEnrichmentId: 'enrich_1',
        contentType: 'article',
        title: 'Old Title',
        body: 'Old Body',
        status: 'DRAFT',
      };
      const updated = { ...draft, title: 'New Title', body: 'New Body' };
      prisma.contentDraft.findUnique.mockResolvedValueOnce(draft);
      prisma.contentDraft.update.mockResolvedValue(updated);
      prisma.contentDraft.findUnique.mockResolvedValueOnce(updated);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.updateDraft('draft_1', {
        title: 'New Title',
        body: 'New Body',
      });

      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft_1' },
        data: { title: 'New Title', body: 'New Body' },
      });
      expect(result.title).toBe('New Title');
    });

    it('trims whitespace from string fields', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        sourceOfferEnrichmentId: 'enrich_1',
        contentType: 'article',
        title: 'Title',
        angle: null,
        callToAction: null,
        status: 'DRAFT',
      };
      const updated = { ...draft, angle: 'Trimmed Angle', callToAction: 'Click Here' };
      prisma.contentDraft.findUnique.mockResolvedValueOnce(draft);
      prisma.contentDraft.update.mockResolvedValue(updated);
      prisma.contentDraft.findUnique.mockResolvedValueOnce(updated);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await service.updateDraft('draft_1', {
        angle: '  Trimmed Angle  ',
        callToAction: '  Click Here  ',
      });

      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft_1' },
        data: { angle: 'Trimmed Angle', callToAction: 'Click Here' },
      });
    });

    it('throws NotFoundException when draft not found', async () => {
      const prisma = mockPrisma();
      prisma.contentDraft.findUnique.mockResolvedValue(null);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await expect(service.updateDraft('draft_missing', { title: 'New' })).rejects.toThrow(
        'ContentDraft draft_missing was not found',
      );
    });

    it('returns unchanged draft when no fields provided', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        sourceOfferEnrichmentId: 'enrich_1',
        contentType: 'article',
        title: 'Title',
        body: 'Body',
        status: 'DRAFT',
      };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.updateDraft('draft_1', {});

      expect(prisma.contentDraft.update).not.toHaveBeenCalled();
      expect(result).toBe(draft);
    });
  });

  describe('approveDraft', () => {
    it('approves a DRAFT draft', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        sourceOfferEnrichmentId: 'enrich_1',
        contentType: 'article',
        title: 'Title',
        body: 'Body',
        status: 'DRAFT',
        idempotencyKey: null,
      };
      const updated = { ...draft, status: 'APPROVED' };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      prisma.contentDraft.update.mockResolvedValue(updated);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.approveDraft('draft_1');

      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft_1' },
        data: { status: 'APPROVED' },
      });
      expect(result.status).toBe('APPROVED');
    });

    it('approves a PENDING_APPROVAL draft', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        sourceOfferEnrichmentId: 'enrich_1',
        contentType: 'article',
        status: 'PENDING_APPROVAL',
        idempotencyKey: null,
      };
      const updated = { ...draft, status: 'APPROVED' };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      prisma.contentDraft.update.mockResolvedValue(updated);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.approveDraft('draft_1');

      expect(result.status).toBe('APPROVED');
    });

    it('throws ConflictException when draft already APPROVED', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        status: 'APPROVED',
        idempotencyKey: null,
      };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await expect(service.approveDraft('draft_1')).rejects.toThrow(
        'Cannot approve content draft with status APPROVED; expected DRAFT or PENDING_APPROVAL',
      );
    });

    it('throws ConflictException when draft already REJECTED', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        status: 'REJECTED',
        idempotencyKey: null,
      };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await expect(service.approveDraft('draft_1')).rejects.toThrow(
        'Cannot approve content draft with status REJECTED; expected DRAFT or PENDING_APPROVAL',
      );
    });

    it('throws NotFoundException when draft not found', async () => {
      const prisma = mockPrisma();
      prisma.contentDraft.findUnique.mockResolvedValue(null);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await expect(service.approveDraft('draft_missing')).rejects.toThrow(
        'ContentDraft draft_missing was not found',
      );
    });

    it('returns draft as-is when idempotency key matches and already approved', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        status: 'APPROVED',
        idempotencyKey: 'key_1',
      };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.approveDraft('draft_1', { idempotencyKey: 'key_1' });

      expect(prisma.contentDraft.update).not.toHaveBeenCalled();
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('rejectDraft', () => {
    it('rejects a DRAFT draft', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        sourceOfferEnrichmentId: 'enrich_1',
        contentType: 'article',
        status: 'DRAFT',
        idempotencyKey: null,
      };
      const updated = { ...draft, status: 'REJECTED' };
      prisma.contentDraft.findUnique.mockResolvedValueOnce(draft);
      prisma.contentDraft.update.mockResolvedValue(updated);
      prisma.contentDraft.findUnique.mockResolvedValueOnce(updated);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.rejectDraft('draft_1');

      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft_1' },
        data: { status: 'REJECTED' },
      });
      expect(result.status).toBe('REJECTED');
    });

    it('rejects a PENDING_APPROVAL draft', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        sourceOfferEnrichmentId: 'enrich_1',
        contentType: 'article',
        status: 'PENDING_APPROVAL',
        idempotencyKey: null,
      };
      const updated = { ...draft, status: 'REJECTED' };
      prisma.contentDraft.findUnique.mockResolvedValueOnce(draft);
      prisma.contentDraft.update.mockResolvedValue(updated);
      prisma.contentDraft.findUnique.mockResolvedValueOnce(updated);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      const result = await service.rejectDraft('draft_1');

      expect(result.status).toBe('REJECTED');
    });

    it('throws ConflictException when draft already APPROVED', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        status: 'APPROVED',
        idempotencyKey: null,
      };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await expect(service.rejectDraft('draft_1')).rejects.toThrow(
        'Cannot reject content draft with status APPROVED; expected DRAFT or PENDING_APPROVAL',
      );
    });

    it('throws ConflictException when draft already REJECTED', async () => {
      const prisma = mockPrisma();
      const draft = {
        id: 'draft_1',
        status: 'REJECTED',
        idempotencyKey: null,
      };
      prisma.contentDraft.findUnique.mockResolvedValue(draft);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await expect(service.rejectDraft('draft_1')).rejects.toThrow(
        'Cannot reject content draft with status REJECTED; expected DRAFT or PENDING_APPROVAL',
      );
    });

    it('throws NotFoundException when draft not found', async () => {
      const prisma = mockPrisma();
      prisma.contentDraft.findUnique.mockResolvedValue(null);
      const service = new ContentDraftService(prisma as unknown as PrismaService);

      await expect(service.rejectDraft('draft_missing')).rejects.toThrow(
        'ContentDraft draft_missing was not found',
      );
    });
  });
});