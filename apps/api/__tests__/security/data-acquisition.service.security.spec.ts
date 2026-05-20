import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/infrastructure/database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { DataAcquisitionService } from '../../src/agents/data-acquisition/data-acquisition.service';

function failedFetchResponse(): Response {
  return {
    ok: false,
    status: 418,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: vi.fn(async () => ''),
  } as unknown as Response;
}

function htmlResponse(headers: HeadersInit = { 'content-type': 'text/html; charset=utf-8' }): Response {
  return new Response('<html><body>No product schema</body></html>', {
    status: 200,
    headers,
  });
}

describe('DataAcquisitionService SSRF protections', () => {
  let service: DataAcquisitionService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => failedFetchResponse());
    vi.stubGlobal('fetch', fetchMock);

    service = new DataAcquisitionService({} as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['localhost hostname', 'http://localhost:3001/internal-product'],
    ['loopback IPv4', 'http://127.0.0.1:5432/private'],
    ['private class A IPv4', 'http://10.0.0.5/admin'],
    ['private class B IPv4', 'http://172.16.10.20/metadata'],
    ['private class C IPv4', 'http://192.168.1.15/router'],
    ['link-local metadata IPv4', 'http://169.254.169.254/latest/meta-data'],
    ['IPv6 loopback', 'http://[::1]:3000/private'],
    ['javascript protocol', 'javascript:alert(1)'],
    ['data protocol', 'data:text/html,<h1>owned</h1>'],
  ])('rejects unsafe product acquisition URL before any fetch: %s', async (_label, url) => {
    const result = await service.acquireProductData(url);

    expect(result).toMatchObject({
      success: false,
      data: null,
      confidence: 0,
      source: 'manual',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects product acquisition responses with missing Content-Type', async () => {
    const response = htmlResponse({});
    const textSpy = vi.spyOn(response, 'text');
    fetchMock.mockResolvedValueOnce(response);

    const result = await service.acquireProductData('https://93.184.216.34/product/1');

    expect(result).toMatchObject({ success: false, data: null, confidence: 0, source: 'manual' });
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('rejects product acquisition responses with non-HTML Content-Type', async () => {
    const response = htmlResponse({ 'content-type': 'application/json' });
    const textSpy = vi.spyOn(response, 'text');
    fetchMock.mockResolvedValueOnce(response);

    const result = await service.acquireProductData('https://93.184.216.34/product/1');

    expect(result).toMatchObject({ success: false, data: null, confidence: 0, source: 'manual' });
    expect(textSpy).not.toHaveBeenCalled();
  });
});
