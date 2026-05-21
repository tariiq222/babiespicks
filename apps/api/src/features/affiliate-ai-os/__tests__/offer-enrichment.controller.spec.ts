import { describe, expect, it, vi } from 'vitest';
import type { OfferEnrichmentService } from '../offer-enrichment.service';
import type { ContentDraftService } from '../content-draft.service';
import {
  OfferEnrichmentController,
  ContentDraftController,
} from '../offer-enrichment.controller';

describe('OfferEnrichmentController', () => {
  describe('enrichDraft', () => {
    it('creates enrichment from APPROVED draft', async () => {
      const service = {
        enrichDraft: vi.fn().mockResolvedValue({
          id: 'enrich_1',
          sourceProductDraftId: 'draft_1',
          status: 'PENDING',
        }),
      };
      const controller = new OfferEnrichmentController(service as unknown as OfferEnrichmentService);

      const result = await controller.enrichDraft('draft_1', {});

      expect(service.enrichDraft).toHaveBeenCalledWith('draft_1', {
        idempotencyKey: undefined,
      });
      expect(result).toEqual({
        id: 'enrich_1',
        sourceProductDraftId: 'draft_1',
        status: 'PENDING',
      });
    });

    it('passes idempotency key to service', async () => {
      const service = {
        enrichDraft: vi.fn().mockResolvedValue({ id: 'enrich_1' }),
      };
      const controller = new OfferEnrichmentController(service as unknown as OfferEnrichmentService);

      await controller.enrichDraft('draft_1', { idempotencyKey: 'key_1' });

      expect(service.enrichDraft).toHaveBeenCalledWith('draft_1', {
        idempotencyKey: 'key_1',
      });
    });
  });

  describe('listEnrichments', () => {
    it('passes query params to service', async () => {
      const service = {
        listEnrichments: vi.fn().mockResolvedValue([]),
      };
      const controller = new OfferEnrichmentController(service as unknown as OfferEnrichmentService);

      await controller.listEnrichments({ status: 'COMPLETED', limit: 10, offset: 20 });

      expect(service.listEnrichments).toHaveBeenCalledWith({
        status: 'COMPLETED',
        limit: 10,
        offset: 20,
      });
    });
  });

  describe('getEnrichment', () => {
    it('returns single enrichment', async () => {
      const service = {
        getEnrichment: vi.fn().mockResolvedValue({ id: 'enrich_1' }),
      };
      const controller = new OfferEnrichmentController(service as unknown as OfferEnrichmentService);

      const result = await controller.getEnrichment('enrich_1');

      expect(service.getEnrichment).toHaveBeenCalledWith('enrich_1');
      expect(result).toEqual({ id: 'enrich_1' });
    });
  });

  describe('updateEnrichment', () => {
    it('passes update fields to service', async () => {
      const service = {
        updateEnrichment: vi.fn().mockResolvedValue({ id: 'enrich_1', offerTitle: 'New Title' }),
      };
      const controller = new OfferEnrichmentController(service as unknown as OfferEnrichmentService);

      const result = await controller.updateEnrichment('enrich_1', { offerTitle: 'New Title' });

      expect(service.updateEnrichment).toHaveBeenCalledWith('enrich_1', { offerTitle: 'New Title' });
      expect((result as any).offerTitle).toBe('New Title');
    });
  });

  describe('generateContent', () => {
    it('creates content drafts from enrichment', async () => {
      const drafts = [
        { id: 'draft_1', contentType: 'article', status: 'DRAFT' },
        { id: 'draft_2', contentType: 'social_post', status: 'DRAFT' },
      ];
      const service = {
        generateContentDrafts: vi.fn().mockResolvedValue(drafts),
      };
      const controller = new OfferEnrichmentController(service as unknown as OfferEnrichmentService);

      const result = await controller.generateContent('enrich_1', {});

      expect(service.generateContentDrafts).toHaveBeenCalledWith('enrich_1', {
        idempotencyKey: undefined,
      });
      expect(result).toBe(drafts);
    });

    it('passes idempotency key to service', async () => {
      const service = {
        generateContentDrafts: vi.fn().mockResolvedValue([]),
      };
      const controller = new OfferEnrichmentController(service as unknown as OfferEnrichmentService);

      await controller.generateContent('enrich_1', { idempotencyKey: 'key_1' });

      expect(service.generateContentDrafts).toHaveBeenCalledWith('enrich_1', {
        idempotencyKey: 'key_1',
      });
    });
  });
});

describe('ContentDraftController', () => {
  describe('listDrafts', () => {
    it('passes query params to service', async () => {
      const service = {
        listDrafts: vi.fn().mockResolvedValue([]),
      };
      const controller = new ContentDraftController(service as unknown as ContentDraftService);

      await controller.listDrafts({ status: 'DRAFT', limit: 10 });

      expect(service.listDrafts).toHaveBeenCalledWith({
        status: 'DRAFT',
        limit: 10,
      });
    });
  });

  describe('getDraft', () => {
    it('returns single draft', async () => {
      const service = {
        getDraft: vi.fn().mockResolvedValue({ id: 'draft_1' }),
      };
      const controller = new ContentDraftController(service as unknown as ContentDraftService);

      const result = await controller.getDraft('draft_1');

      expect(service.getDraft).toHaveBeenCalledWith('draft_1');
      expect(result).toEqual({ id: 'draft_1' });
    });
  });

  describe('updateDraft', () => {
    it('passes update fields to service', async () => {
      const service = {
        updateDraft: vi.fn().mockResolvedValue({ id: 'draft_1', title: 'Updated Title' }),
      };
      const controller = new ContentDraftController(service as unknown as ContentDraftService);

      const result = await controller.updateDraft('draft_1', { title: 'Updated Title' });

      expect(service.updateDraft).toHaveBeenCalledWith('draft_1', { title: 'Updated Title' });
      expect((result as any).title).toBe('Updated Title');
    });
  });

  describe('approve', () => {
    it('approves draft without publishing', async () => {
      const service = {
        approveDraft: vi.fn().mockResolvedValue({ id: 'draft_1', status: 'APPROVED' }),
      };
      const controller = new ContentDraftController(service as unknown as ContentDraftService);

      const result = await controller.approve('draft_1', {});

      expect(service.approveDraft).toHaveBeenCalledWith('draft_1', {
        idempotencyKey: undefined,
        reason: undefined,
      });
      expect((result as any).status).toBe('APPROVED');
    });

    it('passes idempotency key and reason', async () => {
      const service = {
        approveDraft: vi.fn().mockResolvedValue({ id: 'draft_1', status: 'APPROVED' }),
      };
      const controller = new ContentDraftController(service as unknown as ContentDraftService);

      await controller.approve('draft_1', { idempotencyKey: 'key_1', reason: 'Looks good' });

      expect(service.approveDraft).toHaveBeenCalledWith('draft_1', {
        idempotencyKey: 'key_1',
        reason: 'Looks good',
      });
    });
  });

  describe('reject', () => {
    it('rejects draft', async () => {
      const service = {
        rejectDraft: vi.fn().mockResolvedValue({ id: 'draft_1', status: 'REJECTED' }),
      };
      const controller = new ContentDraftController(service as unknown as ContentDraftService);

      const result = await controller.reject('draft_1', {});

      expect(service.rejectDraft).toHaveBeenCalledWith('draft_1', {
        idempotencyKey: undefined,
        reason: undefined,
      });
      expect((result as any).status).toBe('REJECTED');
    });

    it('passes idempotency key and reason', async () => {
      const service = {
        rejectDraft: vi.fn().mockResolvedValue({ id: 'draft_1', status: 'REJECTED' }),
      };
      const controller = new ContentDraftController(service as unknown as ContentDraftService);

      await controller.reject('draft_1', { idempotencyKey: 'key_1', reason: 'Needs revision' });

      expect(service.rejectDraft).toHaveBeenCalledWith('draft_1', {
        idempotencyKey: 'key_1',
        reason: 'Needs revision',
      });
    });
  });
});