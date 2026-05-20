import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import { UnsafeUrlError, type DnsResolver, type FetchLike } from '../../safety/url-safety';
import { PrismaService } from '../../database/prisma.service';
import { downloadSourceImage, ImagesService, validateImageSlug } from '../images.service';

const publicResolver: DnsResolver = async () => [{ address: '93.184.216.34', family: 4 }];

describe('downloadSourceImage SSRF and response validation', () => {
  it('rejects private literal URLs before fetching', async () => {
    const fetchImpl: FetchLike = vi.fn();

    await expect(
      downloadSourceImage('http://127.0.0.1/internal.jpg', { fetchImpl }),
    ).rejects.toThrow(UnsafeUrlError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects redirects to private hosts before fetching the private hop', async () => {
    const fetchImpl: FetchLike = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'http://10.0.0.5/image.jpg' } }));

    await expect(
      downloadSourceImage('https://cdn.example.test/image.jpg', {
        dnsResolver: publicResolver,
        fetchImpl,
      }),
    ).rejects.toThrow(UnsafeUrlError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects successful non-image responses', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValueOnce(
      new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    await expect(
      downloadSourceImage('https://cdn.example.test/page', {
        dnsResolver: publicResolver,
        fetchImpl,
      }),
    ).rejects.toThrow('not an image');
  });

  it('rejects declared oversized image responses before reading the body', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValueOnce(
      new Response('not read', {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(9 * 1024 * 1024),
        },
      }),
    );

    await expect(
      downloadSourceImage('https://cdn.example.test/large.jpg', {
        dnsResolver: publicResolver,
        fetchImpl,
      }),
    ).rejects.toThrow('maximum allowed size');
  });

  it('stops bounded reads when an image body exceeds the maximum size', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValueOnce(
      new Response(new Uint8Array(8 * 1024 * 1024 + 1), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );

    await expect(
      downloadSourceImage('https://cdn.example.test/large.png', {
        dnsResolver: publicResolver,
        fetchImpl,
      }),
    ).rejects.toThrow('maximum allowed size');
  });
});

describe('ImagesService slug and path safety', () => {
  const service = new ImagesService({ product: { findMany: vi.fn() } } as unknown as PrismaService);

  it.each(['baby-stroller-123', 'a1', 'nuna-mixx-next'])('accepts valid image slug %s', (slug) => {
    expect(validateImageSlug(slug)).toBe(true);
  });

  it.each(['../secret', 'Baby-Stroller', 'baby_stroller', 'baby--stroller', '-baby', 'baby-', 'baby/stroller'])(
    'rejects invalid image slug %s',
    (slug) => {
      expect(validateImageSlug(slug)).toBe(false);
      expect(() => service.getImagePath(slug, 'thumb')).toThrow('productSlug must match');
    },
  );

  it('resolves image reads inside the upload images directory', () => {
    const imagePath = service.getImagePath('baby-stroller', 'card');
    const uploadDir = path.resolve(process.cwd(), 'uploads', 'images');
    const relativePath = path.relative(uploadDir, imagePath);

    expect(path.isAbsolute(imagePath)).toBe(true);
    expect(relativePath).toBe(path.join('baby-stroller', 'card.webp'));
    expect(relativePath.startsWith('..')).toBe(false);
  });
});
