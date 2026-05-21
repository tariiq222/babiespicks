import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PublicOfferDraftService } from '../public-offer-draft.service';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';

const mockPrisma = {
  contentDraft: {
    findUnique: vi.fn(),
  },
  publicOfferDraft: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
} as unknown as PrismaService;

describe('PublicOfferDraftService', () => {
  let service: PublicOfferDraftService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PublicOfferDraftService(mockPrisma);
  });

  // --- createFromContentDraft ---

  it('creates a public offer draft from an APPROVED content draft', async () => {
    const contentDraft = {
      id: 'cd-1',
      status: 'APPROVED',
      title: 'Best Baby Stroller 2025',
      contentType: 'article',
      body: 'Full body content',
      angle: 'safety-first',
    };

    mockPrisma.contentDraft.findUnique = vi.fn().mockResolvedValue(contentDraft);
    mockPrisma.publicOfferDraft.findFirst = vi.fn().mockResolvedValue(null);
    mockPrisma.publicOfferDraft.findUnique = vi.fn().mockResolvedValue(null);
    mockPrisma.publicOfferDraft.create = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'pod-1', ...data, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date() }),
    );

    const result = await service.createFromContentDraft('cd-1', { title: 'Custom Title' });

    expect(mockPrisma.contentDraft.findUnique).toHaveBeenCalledWith({ where: { id: 'cd-1' }, include: { sourceOfferEnrichment: true } });
    expect(mockPrisma.publicOfferDraft.create).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'pod-1', title: 'Custom Title' });
  });

  it('throws BadRequestException when content draft is not APPROVED', async () => {
    mockPrisma.contentDraft.findUnique = vi.fn().mockResolvedValue({
      id: 'cd-1',
      status: 'DRAFT',
      title: 'Draft',
    });

    await expect(service.createFromContentDraft('cd-1', {})).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when content draft does not exist', async () => {
    mockPrisma.contentDraft.findUnique = vi.fn().mockResolvedValue(null);

    await expect(service.createFromContentDraft('cd-999', {})).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when public offer draft already exists', async () => {
    mockPrisma.contentDraft.findUnique = vi.fn().mockResolvedValue({
      id: 'cd-1',
      status: 'APPROVED',
      title: 'Test',
    });
    mockPrisma.publicOfferDraft.findFirst = vi.fn().mockResolvedValue(null);
    mockPrisma.publicOfferDraft.findUnique = vi.fn().mockResolvedValue({ id: 'existing-pod' });

    await expect(service.createFromContentDraft('cd-1', {})).rejects.toThrow(ConflictException);
  });

  it('is idempotent when idempotencyKey is provided and draft already exists', async () => {
    const existing = { id: 'pod-existing', sourceContentDraftId: 'cd-1' };
    mockPrisma.contentDraft.findUnique = vi.fn().mockResolvedValue({
      id: 'cd-1',
      status: 'APPROVED',
      title: 'Test',
    });
    mockPrisma.publicOfferDraft.findFirst = vi.fn().mockResolvedValue(existing);

    const result = await service.createFromContentDraft('cd-1', {}, 'idem-key');

    expect(result).toEqual(existing);
    expect(mockPrisma.publicOfferDraft.create).not.toHaveBeenCalled();
  });

  it('generates slug from title when not provided', async () => {
    mockPrisma.contentDraft.findUnique = vi.fn().mockResolvedValue({
      id: 'cd-1',
      status: 'APPROVED',
      title: 'Best Baby Stroller 2025',
    });
    mockPrisma.publicOfferDraft.findFirst = vi.fn().mockResolvedValue(null);
    mockPrisma.publicOfferDraft.findUnique = vi.fn()
      .mockResolvedValueOnce(null)  // slug check
      .mockResolvedValueOnce(null);  // unique slug check
    mockPrisma.publicOfferDraft.create = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'pod-1', ...data, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date() }),
    );

    await service.createFromContentDraft('cd-1', { title: 'Best Baby Stroller 2025' });

    expect(mockPrisma.publicOfferDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'best-baby-stroller-2025' }) }),
    );
  });

  // --- listDrafts ---

  it('lists drafts with default pagination', async () => {
    const drafts = [{ id: 'pod-1', title: 'Draft 1', status: 'DRAFT' }];
    mockPrisma.publicOfferDraft.findMany = vi.fn().mockResolvedValue(drafts);
    mockPrisma.publicOfferDraft.count = vi.fn().mockResolvedValue(1);

    const result = await service.listDrafts({});

    expect(result).toEqual({ items: drafts, total: 1, limit: 50, offset: 0 });
  });

  it('filters drafts by status', async () => {
    mockPrisma.publicOfferDraft.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.publicOfferDraft.count = vi.fn().mockResolvedValue(0);

    await service.listDrafts({ status: 'APPROVED' });

    expect(mockPrisma.publicOfferDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED' } }),
    );
  });

  // --- getDraft ---

  it('returns a draft by id', async () => {
    const draft = { id: 'pod-1', title: 'Test' };
    mockPrisma.publicOfferDraft.findUnique = vi.fn().mockResolvedValue(draft);

    const result = await service.getDraft('pod-1');

    expect(result).toEqual(draft);
  });

  it('throws NotFoundException when draft not found', async () => {
    mockPrisma.publicOfferDraft.findUnique = vi.fn().mockResolvedValue(null);

    await expect(service.getDraft('pod-999')).rejects.toThrow(NotFoundException);
  });

  // --- updateDraft ---

  it('updates draft fields', async () => {
    const existing = { id: 'pod-1', title: 'Old Title', slug: 'old-slug', summary: null, heroCopy: null, benefits: null, faq: null, seoTitle: null, seoDescription: null, status: 'DRAFT' };
    const updated = { ...existing, title: 'New Title' };
    mockPrisma.publicOfferDraft.findUnique = vi.fn().mockResolvedValue(existing);
    mockPrisma.publicOfferDraft.update = vi.fn().mockResolvedValue(updated);

    const result = await service.updateDraft('pod-1', { title: 'New Title' });

    expect(result).toMatchObject({ title: 'New Title' });
  });

  // --- approveDraft ---

  it('approves draft and does NOT publish', async () => {
    const existing = { id: 'pod-1', title: 'Test', slug: 't', summary: null, heroCopy: null, benefits: null, faq: null, seoTitle: null, seoDescription: null, status: 'DRAFT' };
    const approved = { id: 'pod-1', title: 'Test', slug: 't', summary: null, heroCopy: null, benefits: null, faq: null, seoTitle: null, seoDescription: null, status: 'APPROVED', sourceContentDraft: { id: 'cd-1', title: 'Test', contentType: 'article', body: 'b', angle: 'a', status: 'APPROVED' } };
    mockPrisma.publicOfferDraft.findUnique = vi.fn().mockResolvedValue(existing);
    mockPrisma.publicOfferDraft.update = vi.fn().mockResolvedValue(approved);

    const result = await service.approveDraft('pod-1');

    expect(result).toMatchObject({ status: 'APPROVED' });
    // approve ≠ publish — should only update status field
    expect(mockPrisma.publicOfferDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pod-1' }, data: { status: 'APPROVED' } }),
    );
  });

  // --- rejectDraft ---

  it('rejects draft', async () => {
    const existing = { id: 'pod-1', title: 'Test', slug: 't', summary: null, heroCopy: null, benefits: null, faq: null, seoTitle: null, seoDescription: null, status: 'DRAFT' };
    const rejected = { id: 'pod-1', title: 'Test', slug: 't', summary: null, heroCopy: null, benefits: null, faq: null, seoTitle: null, seoDescription: null, status: 'REJECTED', sourceContentDraft: { id: 'cd-1', title: 'Test', contentType: 'article', body: 'b', angle: 'a', status: 'APPROVED' } };
    mockPrisma.publicOfferDraft.findUnique = vi.fn().mockResolvedValue(existing);
    mockPrisma.publicOfferDraft.update = vi.fn().mockResolvedValue(rejected);

    const result = await service.rejectDraft('pod-1');

    expect(result).toMatchObject({ status: 'REJECTED' });
  });
});
