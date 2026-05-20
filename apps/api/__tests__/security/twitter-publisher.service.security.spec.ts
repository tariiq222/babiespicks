import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

import { TwitterPublisherService } from '../../src/infrastructure/publishing/twitter-publisher.service';

const TWITTER_UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';
const MAX_TWITTER_IMAGE_BYTES = 5 * 1024 * 1024;

function mediaDownloadResponse(options: {
  contentType?: string;
  bytes: Uint8Array;
  includeContentLength?: boolean;
  ok?: boolean;
  status?: number;
}): Response {
  const headers = new Headers();
  if (options.contentType) {
    headers.set('content-type', options.contentType);
  }
  if (options.includeContentLength ?? true) {
    headers.set('content-length', String(options.bytes.byteLength));
  }

  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers,
    body: new Blob([options.bytes]).stream(),
    arrayBuffer: vi.fn(async () =>
      options.bytes.buffer.slice(
        options.bytes.byteOffset,
        options.bytes.byteOffset + options.bytes.byteLength,
      ),
    ),
    text: vi.fn(async () => ''),
  } as unknown as Response;
}

function twitterUploadResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: vi.fn(async () => ''),
    json: vi.fn(async () => ({ media_id_string: 'media_123' })),
  } as unknown as Response;
}

describe('TwitterPublisherService media SSRF and payload protections', () => {
  let service: TwitterPublisherService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.TWITTER_API_KEY = 'test-api-key';
    process.env.TWITTER_API_SECRET = 'test-api-secret';
    process.env.TWITTER_ACCESS_TOKEN = 'test-access-token';
    process.env.TWITTER_ACCESS_SECRET = 'test-access-secret';

    fetchMock = vi.fn(async () =>
      mediaDownloadResponse({ contentType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) }),
    );
    vi.stubGlobal('fetch', fetchMock);

    service = new TwitterPublisherService();
    vi.spyOn(service as unknown as { buildOAuthHeader: () => Promise<string> }, 'buildOAuthHeader').mockResolvedValue(
      'OAuth test-signature',
    );
  });

  afterEach(() => {
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_SECRET;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['localhost hostname', 'http://localhost:3000/image.jpg'],
    ['loopback IPv4', 'http://127.0.0.1:8080/image.jpg'],
    ['private class A IPv4', 'http://10.1.2.3/image.jpg'],
    ['private class B IPv4', 'http://172.16.0.10/image.jpg'],
    ['private class C IPv4', 'http://192.168.0.99/image.jpg'],
    ['link-local metadata IPv4', 'http://169.254.169.254/latest/meta-data/iam/security-credentials'],
    ['IPv6 loopback', 'http://[::1]:3000/image.jpg'],
    ['javascript protocol', 'javascript:alert(1)'],
    ['data protocol', 'data:image/png;base64,iVBORw0KGgo='],
  ])('rejects unsafe Twitter media URL before any fetch: %s', async (_label, url) => {
    const result = await service.uploadMedia(url);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-image media responses without uploading bytes to Twitter', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === TWITTER_UPLOAD_URL) return twitterUploadResponse();
      return mediaDownloadResponse({ contentType: 'text/html; charset=utf-8', bytes: new Uint8Array([60, 104, 49, 62]) });
    });

    const result = await service.uploadMedia('https://example.com/not-an-image.html');

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      TWITTER_UPLOAD_URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects oversized image responses without uploading bytes to Twitter', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === TWITTER_UPLOAD_URL) return twitterUploadResponse();
      return mediaDownloadResponse({
        contentType: 'image/jpeg',
        bytes: new Uint8Array(MAX_TWITTER_IMAGE_BYTES + 1),
      });
    });

    const result = await service.uploadMedia('https://example.com/too-large.jpg');

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      TWITTER_UPLOAD_URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects image responses with missing content-type without uploading bytes to Twitter', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === TWITTER_UPLOAD_URL) return twitterUploadResponse();
      return mediaDownloadResponse({ bytes: new Uint8Array([1, 2, 3]) });
    });

    const result = await service.uploadMedia('https://example.com/missing-content-type');

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      TWITTER_UPLOAD_URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects oversized image streams without relying on content-length', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === TWITTER_UPLOAD_URL) return twitterUploadResponse();
      return mediaDownloadResponse({
        contentType: 'image/jpeg',
        includeContentLength: false,
        bytes: new Uint8Array(MAX_TWITTER_IMAGE_BYTES + 1),
      });
    });

    const result = await service.uploadMedia('https://example.com/too-large-without-length.jpg');

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      TWITTER_UPLOAD_URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
