import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TrendIntelligenceService } from '../trend-intelligence.service';

describe('TrendIntelligenceService', () => {
  const createService = () => {
    const prisma = {
      trendSignal: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };

    return {
      prisma,
      service: new TrendIntelligenceService(prisma as unknown as PrismaService),
    };
  };

  describe('canonicalizeUrl', () => {
    it('normalizes safe URLs and upgrades http to https', () => {
      const { service } = createService();

      expect(
        service.canonicalizeUrl('http://Example.COM//Baby/Product?utm=1#reviews'),
      ).toBe('https://example.com/baby/product');
    });

    it('rejects unsafe clickable URL protocols', () => {
      const { service } = createService();

      expect(() => service.canonicalizeUrl('javascript:alert(1)')).toThrow(
        BadRequestException,
      );
      expect(() => service.canonicalizeUrl('data:text/html,unsafe')).toThrow(
        BadRequestException,
      );
      expect(() => service.canonicalizeUrl('file:///etc/passwd')).toThrow(
        BadRequestException,
      );
    });

    it('does not preserve malformed URLs as clickable strings', () => {
      const { service } = createService();

      expect(service.canonicalizeUrl('not a url?x=1')).toBeNull();
    });
  });

  it('does not persist unsafe product or source URLs', async () => {
    const { prisma, service } = createService();

    prisma.trendSignal.findFirst.mockResolvedValue(null);

    await expect(
      service.createSignalFromSource({
        source: 'tiktok',
        productUrl: 'https://example.com/product',
        sourceUrl: 'javascript:alert(1)',
        title: 'كرسي أطفال',
        discoveryReason: 'Trending mentions',
        trendScore: 72,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trendSignal.create).not.toHaveBeenCalled();
  });
});
