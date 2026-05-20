import { describe, expect, it, vi } from 'vitest';
import { TrendSignalsController } from '../trend-signals.controller';
import type { TrendIntelligenceService } from '../trend-intelligence.service';

describe('TrendSignalsController', () => {
  it('exposes list/get/create handlers for admin trend signals', async () => {
    const service = {
      listSignals: vi.fn().mockResolvedValue([{ id: 'signal_1' }]),
      getSignal: vi.fn().mockResolvedValue({ id: 'signal_1' }),
      createManualSignal: vi.fn().mockResolvedValue({ id: 'signal_2', status: 'NEW' }),
    };
    const controller = new TrendSignalsController(service as unknown as TrendIntelligenceService);

    await expect(controller.list({ status: 'NEW', limit: 10 })).resolves.toEqual([{ id: 'signal_1' }]);
    await expect(controller.get('signal_1')).resolves.toEqual({ id: 'signal_1' });
    await expect(controller.create({
      title: 'Baby Bottle',
      discoveryReason: 'Manual trend review',
      trendScore: 67,
    })).resolves.toEqual({ id: 'signal_2', status: 'NEW' });

    expect(service.listSignals).toHaveBeenCalledWith({ status: 'NEW', limit: 10 });
    expect(service.getSignal).toHaveBeenCalledWith('signal_1');
    expect(service.createManualSignal).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Baby Bottle',
      trendScore: 67,
    }));
  });
});
