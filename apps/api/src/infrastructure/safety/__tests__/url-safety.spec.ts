import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpRequestMock, httpsRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
  httpsRequestMock: vi.fn(),
}));

vi.mock('node:http', () => ({ request: httpRequestMock }));
vi.mock('node:https', () => ({ request: httpsRequestMock }));

import {
  ensureSafeHttpUrl,
  getUrlLogTarget,
  isSafeHttpUrl,
  safeFetch,
  UnsafeUrlError,
  type DnsResolver,
  type FetchLike,
} from '../url-safety';

const publicResolver: DnsResolver = async () => [{ address: '93.184.216.34', family: 4 }];

describe('url-safety SSRF protections', () => {
  beforeEach(() => {
    httpRequestMock.mockReset();
    httpsRequestMock.mockReset();
  });

  it.each([
    ['IPv6 unspecified', 'http://[::]/resource'],
    ['IPv6 loopback', 'http://[::1]/resource'],
    ['IPv6 unique local fc00', 'http://[fc00::1]/resource'],
    ['IPv6 unique local fd00', 'http://[fd00::1]/resource'],
    ['IPv6 link local', 'http://[fe80::1]/resource'],
    ['IPv4-mapped dotted loopback', 'http://[::ffff:127.0.0.1]/resource'],
    ['IPv4-mapped hex loopback', 'http://[::ffff:7f00:1]/resource'],
    ['IPv4-mapped hex private', 'http://[::ffff:0a00:1]/resource'],
  ])('rejects unsafe literal host: %s', (_label, url) => {
    expect(isSafeHttpUrl(url)).toBe(false);
  });

  it('rejects hostnames that resolve to private DNS answers', async () => {
    await expect(
      ensureSafeHttpUrl('https://cdn.example.test/image.jpg', {
        dnsResolver: async () => [{ address: '10.0.0.5', family: 4 }],
      }),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects hostnames that resolve to IPv6 link-local DNS answers', async () => {
    await expect(
      ensureSafeHttpUrl('https://cdn.example.test/image.jpg', {
        dnsResolver: async () => [{ address: 'fe80::1', family: 6 }],
      }),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it('follows redirects manually after validating every hop', async () => {
    const fetchImpl: FetchLike = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'https://cdn2.example.test/final' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await safeFetch('https://cdn.example.test/start', {}, {
      dnsResolver: publicResolver,
      fetchImpl,
      maxRedirects: 2,
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, new URL('https://cdn.example.test/start'), { redirect: 'manual' });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, new URL('https://cdn2.example.test/final'), { redirect: 'manual' });
  });

  it('rejects redirects to blocked hosts before fetching the next hop', async () => {
    const fetchImpl: FetchLike = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'http://127.0.0.1/internal' } }));

    await expect(
      safeFetch('https://cdn.example.test/start', {}, {
        dnsResolver: publicResolver,
        fetchImpl,
        maxRedirects: 2,
      }),
    ).rejects.toThrow(UnsafeUrlError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('pins production HTTP requests to the resolved IP and does not call global fetch', async () => {
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch');
    httpRequestMock.mockImplementation((options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      const response = Readable.from([Buffer.from('ok')]) as Readable & {
        statusCode: number;
        statusMessage: string;
        headers: Record<string, string>;
        rawHeaders: string[];
      };
      response.statusCode = 200;
      response.statusMessage = 'OK';
      response.headers = { 'content-type': 'text/plain' };
      response.rawHeaders = ['content-type', 'text/plain'];

      queueMicrotask(() => callback(response as unknown as IncomingMessage));

      const request = new EventEmitter() as unknown as ClientRequest;
      request.end = vi.fn() as ClientRequest['end'];
      request.write = vi.fn() as ClientRequest['write'];
      request.destroy = vi.fn() as ClientRequest['destroy'];
      return request;
    });

    const response = await safeFetch('http://cdn.example.test/image.jpg', {}, { dnsResolver: publicResolver });

    expect(await response.text()).toBe('ok');
    expect(globalFetchSpy).not.toHaveBeenCalled();
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock.mock.calls[0][0]).toMatchObject({
      hostname: '93.184.216.34',
      family: 4,
      headers: { host: 'cdn.example.test' },
      path: '/image.jpg',
    });

    globalFetchSpy.mockRestore();
  });

  it('keeps fetchImpl-based tests mockable while still validating URLs', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValueOnce(new Response('mocked', { status: 200 }));

    const response = await safeFetch('https://cdn.example.test/mock', {}, { dnsResolver: publicResolver, fetchImpl });

    expect(await response.text()).toBe('mocked');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it('sanitizes URLs for logs by dropping path, query, fragment, and userinfo', () => {
    expect(getUrlLogTarget('https://user:secret@store.example.test:8443/product?q=token#details')).toBe(
      'https://store.example.test:8443',
    );
  });

  it('returns a safe placeholder for invalid log URLs', () => {
    expect(getUrlLogTarget('not a url')).toBe('[invalid-url]');
  });
});
