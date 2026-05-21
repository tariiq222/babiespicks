import { describe, expect, it, vi } from 'vitest';
import { OfferEnrichmentsController } from '../offer-enrichments.controller';
import type { OfferEnrichmentsService } from '../offer-enrichments.service';

describe('OfferEnrichmentsController', () => {
  it('routes create to the service', async () => {
    const service = {
      createEnrichment: vi.fn().mockResolvedValue({ id: 'enrich_1' }),
      listEnrichments: vi.fn(),
      getEnrichment: vi.fn(),
      updateEnrichment: vi.fn(),
    };
    const controller = new OfferEnrichmentsController(service as unknown as OfferEnrichmentsService);

    const body = { sourceProductDraftId: 'pd_1', offerTitle: 'Test' } as any;
    await expect(controller.create(body)).resolves.toEqual({ id: 'enrich_1' });
    expect(service.createEnrichment).toHaveBeenCalledWith(body);
  });

  it('routes list to the service', async () => {
    const service = {
      createEnrichment: vi.fn(),
      listEnrichments: vi.fn().mockResolvedValue([{ id: 'enrich_1' }]),
      getEnrichment: vi.fn(),
      updateEnrichment: vi.fn(),
    };
    const controller = new OfferEnrichmentsController(service as unknown as OfferEnrichmentsService);

    await expect(controller.list({} as any)).resolves.toEqual([{ id: 'enrich_1' }]);
    expect(service.listEnrichments).toHaveBeenCalledWith({});
  });

  it('routes get to the service', async () => {
    const service = {
      createEnrichment: vi.fn(),
      listEnrichments: vi.fn(),
      getEnrichment: vi.fn().mockResolvedValue({ id: 'enrich_1' }),
      updateEnrichment: vi.fn(),
    };
    const controller = new OfferEnrichmentsController(service as unknown as OfferEnrichmentsService);

    await expect(controller.get('enrich_1')).resolves.toEqual({ id: 'enrich_1' });
    expect(service.getEnrichment).toHaveBeenCalledWith('enrich_1');
  });

  it('routes update to the service', async () => {
    const service = {
      createEnrichment: vi.fn(),
      listEnrichments: vi.fn(),
      getEnrichment: vi.fn(),
      updateEnrichment: vi.fn().mockResolvedValue({ id: 'enrich_1' }),
    };
    const controller = new OfferEnrichmentsController(service as unknown as OfferEnrichmentsService);

    const body = { offerTitle: 'Updated' } as any;
    await expect(controller.update('enrich_1', body)).resolves.toEqual({ id: 'enrich_1' });
    expect(service.updateEnrichment).toHaveBeenCalledWith('enrich_1', body);
  });

  it('has no publish or schedule route', () => {
    const service = {
      createEnrichment: vi.fn(),
      listEnrichments: vi.fn(),
      getEnrichment: vi.fn(),
      updateEnrichment: vi.fn(),
    };
    const controller = new OfferEnrichmentsController(service as unknown as OfferEnrichmentsService);

    expect('publish' in controller).toBe(false);
    expect('schedule' in controller).toBe(false);
  });
});
