import { describe, expect, it, vi } from 'vitest';
import { MAX_HTML_RESPONSE_BYTES, readBoundedHtmlResponse } from '../html-response';
import { fetchAndExtract } from '../layers/schema-org';
import type { FetchLike } from '../../../infrastructure/safety/url-safety';

const productJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Safe Baby Carrier',
  offers: { '@type': 'Offer', price: '199', priceCurrency: 'SAR' },
});

const productHtml = `<html><head><script type="application/ld+json">${productJsonLd}</script></head></html>`;

describe('bounded HTML response reader', () => {
  it('rejects missing Content-Type without calling response.text()', async () => {
    const response = new Response(productHtml, { status: 200 });
    const textSpy = vi.spyOn(response, 'text');

    await expect(readBoundedHtmlResponse(response)).resolves.toBeNull();
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('rejects non-HTML Content-Type without calling response.text()', async () => {
    const response = new Response('{"name":"not html"}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const textSpy = vi.spyOn(response, 'text');

    await expect(readBoundedHtmlResponse(response)).resolves.toBeNull();
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('rejects declared oversized HTML bodies before reading them', async () => {
    const response = new Response(productHtml, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(MAX_HTML_RESPONSE_BYTES + 1),
      },
    });
    const textSpy = vi.spyOn(response, 'text');

    await expect(readBoundedHtmlResponse(response)).resolves.toBeNull();
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('reads HTML at or under the byte limit without response.text()', async () => {
    const response = new Response(productHtml, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    const textSpy = vi.spyOn(response, 'text');

    await expect(readBoundedHtmlResponse(response)).resolves.toContain('Safe Baby Carrier');
    expect(textSpy).not.toHaveBeenCalled();
  });
});

describe('fetchAndExtract HTML response validation', () => {
  it('extracts Schema.org data from bounded HTML responses', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response(productHtml, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));

    const result = await fetchAndExtract('https://example.com/product/1', fetchImpl);

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Safe Baby Carrier');
  });

  it('rejects missing Content-Type before Schema.org parsing', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response(productHtml, { status: 200 }));

    const result = await fetchAndExtract('https://example.com/product/1', fetchImpl);

    expect(result).toMatchObject({ success: false, data: null, confidence: 0, rawSchemas: [] });
  });

  it('rejects non-HTML Content-Type before Schema.org parsing', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response(productHtml, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await fetchAndExtract('https://example.com/product/1', fetchImpl);

    expect(result).toMatchObject({ success: false, data: null, confidence: 0, rawSchemas: [] });
  });
});
