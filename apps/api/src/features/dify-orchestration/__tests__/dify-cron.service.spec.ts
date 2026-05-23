import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DifyCronService } from '../dify-cron.service';

describe('DifyCronService', () => {
  let service: DifyCronService;
  const ORIGINAL_ENV = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new DifyCronService();
    process.env.DIFY_BASE_URL = '';
    process.env.DIFY_WORKFLOW_API_KEY = '';
    process.env.DIFY_DISCOVERY_WORKFLOW_ID = '';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = originalFetch;
  });

  it('skips when env vars are missing', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;

    await service.runDailyDiscovery();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls Dify workflow with bearer auth when env vars are set', async () => {
    process.env.DIFY_BASE_URL = 'https://dify.test';
    process.env.DIFY_WORKFLOW_API_KEY = 'secret-key';
    process.env.DIFY_DISCOVERY_WORKFLOW_ID = 'wf-1';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workflow_run_id: 'run-abc' }),
    });
    global.fetch = fetchMock as never;

    await service.runDailyDiscovery();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://dify.test/v1/workflows/wf-1/run');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    const body = JSON.parse(init.body);
    expect(body.inputs.triggered_by).toBe('cron');
    expect(body.user).toBe('nestjs-cron');
  });

  it('does not throw when Dify returns non-OK', async () => {
    process.env.DIFY_BASE_URL = 'https://dify.test';
    process.env.DIFY_WORKFLOW_API_KEY = 'k';
    process.env.DIFY_DISCOVERY_WORKFLOW_ID = 'w';

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as never;

    await expect(service.runDailyDiscovery()).resolves.toBeUndefined();
  });

  it('does not throw when fetch rejects', async () => {
    process.env.DIFY_BASE_URL = 'https://dify.test';
    process.env.DIFY_WORKFLOW_API_KEY = 'k';
    process.env.DIFY_DISCOVERY_WORKFLOW_ID = 'w';

    global.fetch = vi.fn().mockRejectedValue(new Error('network')) as never;

    await expect(service.runDailyDiscovery()).resolves.toBeUndefined();
  });
});
