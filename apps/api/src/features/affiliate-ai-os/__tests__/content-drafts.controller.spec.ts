import { describe, expect, it, vi } from 'vitest';
import { ContentDraftsController } from '../content-drafts.controller';
import type { ContentDraftsService } from '../content-drafts.service';

describe('ContentDraftsController', () => {
  it('routes create to the service', async () => {
    const service = {
      createDraft: vi.fn().mockResolvedValue({ id: 'draft_1' }),
      listDrafts: vi.fn(),
      getDraft: vi.fn(),
      updateDraft: vi.fn(),
      approveDraft: vi.fn(),
      rejectDraft: vi.fn(),
    };
    const controller = new ContentDraftsController(service as unknown as ContentDraftsService);

    const body = { sourceOfferEnrichmentId: 'enrich_1', title: 'Test' } as any;
    await expect(controller.create(body)).resolves.toEqual({ id: 'draft_1' });
    expect(service.createDraft).toHaveBeenCalledWith(body);
  });

  it('routes list to the service', async () => {
    const service = {
      createDraft: vi.fn(),
      listDrafts: vi.fn().mockResolvedValue([{ id: 'draft_1' }]),
      getDraft: vi.fn(),
      updateDraft: vi.fn(),
      approveDraft: vi.fn(),
      rejectDraft: vi.fn(),
    };
    const controller = new ContentDraftsController(service as unknown as ContentDraftsService);

    await expect(controller.list({} as any)).resolves.toEqual([{ id: 'draft_1' }]);
    expect(service.listDrafts).toHaveBeenCalledWith({});
  });

  it('routes get to the service', async () => {
    const service = {
      createDraft: vi.fn(),
      listDrafts: vi.fn(),
      getDraft: vi.fn().mockResolvedValue({ id: 'draft_1' }),
      updateDraft: vi.fn(),
      approveDraft: vi.fn(),
      rejectDraft: vi.fn(),
    };
    const controller = new ContentDraftsController(service as unknown as ContentDraftsService);

    await expect(controller.get('draft_1')).resolves.toEqual({ id: 'draft_1' });
    expect(service.getDraft).toHaveBeenCalledWith('draft_1');
  });

  it('routes update to the service', async () => {
    const service = {
      createDraft: vi.fn(),
      listDrafts: vi.fn(),
      getDraft: vi.fn(),
      updateDraft: vi.fn().mockResolvedValue({ id: 'draft_1' }),
      approveDraft: vi.fn(),
      rejectDraft: vi.fn(),
    };
    const controller = new ContentDraftsController(service as unknown as ContentDraftsService);

    const body = { title: 'Updated' } as any;
    await expect(controller.update('draft_1', body)).resolves.toEqual({ id: 'draft_1' });
    expect(service.updateDraft).toHaveBeenCalledWith('draft_1', body);
  });

  it('routes approve to the service without publishing', async () => {
    const service = {
      createDraft: vi.fn(),
      listDrafts: vi.fn(),
      getDraft: vi.fn(),
      updateDraft: vi.fn(),
      approveDraft: vi.fn().mockResolvedValue({ id: 'draft_1', status: 'approved' }),
      rejectDraft: vi.fn(),
    };
    const controller = new ContentDraftsController(service as unknown as ContentDraftsService);

    const body = { reason: 'looks good' } as any;
    await expect(controller.approve('draft_1', body)).resolves.toEqual({ id: 'draft_1', status: 'approved' });
    expect(service.approveDraft).toHaveBeenCalledWith('draft_1', body);
  });

  it('routes reject to the service', async () => {
    const service = {
      createDraft: vi.fn(),
      listDrafts: vi.fn(),
      getDraft: vi.fn(),
      updateDraft: vi.fn(),
      approveDraft: vi.fn(),
      rejectDraft: vi.fn().mockResolvedValue({ id: 'draft_1', status: 'rejected' }),
    };
    const controller = new ContentDraftsController(service as unknown as ContentDraftsService);

    const body = { reason: 'not good' } as any;
    await expect(controller.reject('draft_1', body)).resolves.toEqual({ id: 'draft_1', status: 'rejected' });
    expect(service.rejectDraft).toHaveBeenCalledWith('draft_1', body);
  });

  it('has no publish or schedule route', () => {
    const service = {
      createDraft: vi.fn(),
      listDrafts: vi.fn(),
      getDraft: vi.fn(),
      updateDraft: vi.fn(),
      approveDraft: vi.fn(),
      rejectDraft: vi.fn(),
    };
    const controller = new ContentDraftsController(service as unknown as ContentDraftsService);

    expect('publish' in controller).toBe(false);
    expect('schedule' in controller).toBe(false);
  });
});
