import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ReviewWorkspaceService } from '../review-workspace.service';

const mockPrisma = () => ({
  $transaction: vi.fn(),
  reviewItem: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  contentDraft: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
});

describe('ReviewWorkspaceService', () => {
  let service: ReviewWorkspaceService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = mockPrisma();
    service = new ReviewWorkspaceService(prisma as unknown as PrismaService);
  });

  describe('listReviewItems', () => {
    it('should return empty items when no review items exist', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.listReviewItems({});
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('should return items with content drafts attached', async () => {
      const mockItems = [
        {
          id: 'ri1',
          contentDraftId: 'cd1',
          reviewStatus: 'PENDING',
          reviewNotes: null,
          revisionRequested: false,
          reviewedAt: null,
          reviewedBy: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ];
      const mockDrafts = [
        { id: 'cd1', contentType: 'article', title: 'Test Article', body: 'Body text', angle: 'benefit', status: 'DRAFT' },
      ];

      prisma.$transaction.mockResolvedValue([mockItems, 1]);
      prisma.contentDraft.findMany.mockResolvedValue(mockDrafts);

      const result = await service.listReviewItems({});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('ri1');
      expect(result.items[0].contentDraft?.title).toBe('Test Article');
    });

    it('should filter by status', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.listReviewItems({ status: 'APPROVED' });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should respect limit and offset', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.listReviewItems({ limit: 25, offset: 50 });

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getReviewItem', () => {
    it('should return a review item with its content draft', async () => {
      const mockItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'PENDING',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      const mockDraft = { id: 'cd1', contentType: 'article', title: 'Test', body: 'Body', angle: 'angle', status: 'DRAFT' };

      prisma.reviewItem.findUnique.mockResolvedValue(mockItem);
      prisma.contentDraft.findUnique.mockResolvedValue(mockDraft);

      const result = await service.getReviewItem('ri1');

      expect(result.id).toBe('ri1');
      expect(result.contentDraft?.title).toBe('Test');
    });

    it('should throw NotFoundException when item not found', async () => {
      prisma.reviewItem.findUnique.mockResolvedValue(null);

      await expect(service.getReviewItem('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createReviewItem', () => {
    it('should create a new review item for a content draft', async () => {
      const mockDraft = { id: 'cd1', contentType: 'article', status: 'DRAFT' };
      const mockCreatedItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'PENDING',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };

      prisma.contentDraft.findUnique.mockResolvedValue(mockDraft);
      prisma.reviewItem.findFirst.mockResolvedValue(null);
      prisma.reviewItem.create.mockResolvedValue(mockCreatedItem);

      const result = await service.createReviewItem('cd1');

      expect(result.id).toBe('ri1');
      expect(prisma.reviewItem.create).toHaveBeenCalledWith({
        data: { contentDraftId: 'cd1', reviewStatus: 'PENDING', revisionRequested: false },
      });
    });

    it('should return existing review item if one already exists for the draft', async () => {
      const mockDraft = { id: 'cd1', contentType: 'article', status: 'DRAFT' };
      const mockExistingItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'PENDING',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };

      prisma.contentDraft.findUnique.mockResolvedValue(mockDraft);
      prisma.reviewItem.findFirst.mockResolvedValue(mockExistingItem);
      prisma.reviewItem.findUnique.mockResolvedValue(mockExistingItem);

      const result = await service.createReviewItem('cd1');

      expect(result.id).toBe('ri1');
      expect(prisma.reviewItem.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when content draft not found', async () => {
      prisma.contentDraft.findUnique.mockResolvedValue(null);

      await expect(service.createReviewItem('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateReviewItem', () => {
    it('should update review notes and revision requested flag', async () => {
      const mockItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'PENDING',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      const mockUpdatedItem = { ...mockItem, reviewNotes: 'Needs more detail', revisionRequested: true };

      prisma.reviewItem.findUnique.mockResolvedValue(mockItem);
      prisma.reviewItem.update.mockResolvedValue(mockUpdatedItem);

      const result = await service.updateReviewItem('ri1', { reviewNotes: 'Needs more detail', revisionRequested: true });

      expect(result.reviewNotes).toBe('Needs more detail');
      expect(result.revisionRequested).toBe(true);
    });

    it('should throw NotFoundException when item not found', async () => {
      prisma.reviewItem.findUnique.mockResolvedValue(null);

      await expect(service.updateReviewItem('nonexistent', { reviewNotes: 'test' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('approveReviewItem', () => {
    it('should approve a review item and update content draft status', async () => {
      const mockItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'PENDING',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      const mockApprovedItem = {
        ...mockItem,
        reviewStatus: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: 'admin',
        reviewNotes: 'Looks good',
      };

      prisma.reviewItem.findUnique.mockResolvedValue(mockItem);
      prisma.reviewItem.update.mockResolvedValue(mockApprovedItem);
      prisma.contentDraft.update.mockResolvedValue({});

      const result = await service.approveReviewItem('ri1', 'Looks good');

      expect(result.reviewStatus).toBe('APPROVED');
      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'cd1' },
        data: { status: 'APPROVED' },
      });
    });

    it('should throw BadRequestException if already approved', async () => {
      const mockItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'APPROVED',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: new Date(),
        reviewedBy: 'admin',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };

      prisma.reviewItem.findUnique.mockResolvedValue(mockItem);

      await expect(service.approveReviewItem('ri1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when item not found', async () => {
      prisma.reviewItem.findUnique.mockResolvedValue(null);

      await expect(service.approveReviewItem('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectReviewItem', () => {
    it('should reject a review item and update content draft status', async () => {
      const mockItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'PENDING',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      const mockRejectedItem = {
        ...mockItem,
        reviewStatus: 'REJECTED',
        reviewedAt: new Date(),
        reviewedBy: 'admin',
        reviewNotes: 'Quality not sufficient',
      };

      prisma.reviewItem.findUnique.mockResolvedValue(mockItem);
      prisma.reviewItem.update.mockResolvedValue(mockRejectedItem);
      prisma.contentDraft.update.mockResolvedValue({});

      const result = await service.rejectReviewItem('ri1', 'Quality not sufficient');

      expect(result.reviewStatus).toBe('REJECTED');
      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'cd1' },
        data: { status: 'REJECTED' },
      });
    });

    it('should throw BadRequestException if already rejected', async () => {
      const mockItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'REJECTED',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: new Date(),
        reviewedBy: 'admin',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };

      prisma.reviewItem.findUnique.mockResolvedValue(mockItem);

      await expect(service.rejectReviewItem('ri1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestRevision', () => {
    it('should request revision and set content draft back to PENDING_APPROVAL', async () => {
      const mockItem = {
        id: 'ri1',
        contentDraftId: 'cd1',
        reviewStatus: 'PENDING',
        reviewNotes: null,
        revisionRequested: false,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      const mockRevisionItem = {
        ...mockItem,
        reviewStatus: 'REVISION_REQUESTED',
        reviewNotes: 'Please expand the benefits section',
        revisionRequested: true,
        reviewedAt: new Date(),
        reviewedBy: 'admin',
      };

      prisma.reviewItem.findUnique.mockResolvedValue(mockItem);
      prisma.reviewItem.update.mockResolvedValue(mockRevisionItem);
      prisma.contentDraft.update.mockResolvedValue({});

      const result = await service.requestRevision('ri1', 'Please expand the benefits section');

      expect(result.reviewStatus).toBe('REVISION_REQUESTED');
      expect(result.revisionRequested).toBe(true);
      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'cd1' },
        data: { status: 'PENDING_APPROVAL' },
      });
    });

    it('should throw NotFoundException when item not found', async () => {
      prisma.reviewItem.findUnique.mockResolvedValue(null);

      await expect(service.requestRevision('nonexistent', 'some notes')).rejects.toThrow(NotFoundException);
    });
  });
});