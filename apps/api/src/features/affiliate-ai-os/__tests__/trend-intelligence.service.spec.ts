import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TrendIntelligenceService } from '../trend-intelligence.service';

describe('TrendIntelligenceService', () => {
  const createService = () => {
    const prisma = {
      trendSignal: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
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

  it('lists trend signals with bounded pagination and optional status', async () => {
    const { prisma, service } = createService();
    const signals = [{ id: 'signal_1', trendScore: 88 }];
    prisma.trendSignal.findMany.mockResolvedValue(signals);

    const result = await service.listSignals({ status: 'NEW', limit: 250, offset: 50_000 });

    expect(result).toBe(signals);
    expect(prisma.trendSignal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'NEW' },
      take: 100,
      skip: 10_000,
    }));
  });

  it('gets a trend signal by id', async () => {
    const { prisma, service } = createService();
    const signal = { id: 'signal_1', normalizedTitle: 'stroller', sourceHash: 'hash' };
    prisma.trendSignal.findUnique.mockResolvedValue(signal);

    await expect(service.getSignal('signal_1')).resolves.toBe(signal);
    expect(prisma.trendSignal.findUnique).toHaveBeenCalledWith({ where: { id: 'signal_1' } });
  });

  it('creates a manual trend signal without drafting or publishing', async () => {
    const { prisma, service } = createService();
    const signal = { id: 'signal_manual', status: 'NEW' };
    prisma.trendSignal.findFirst.mockResolvedValue(null);
    prisma.trendSignal.create.mockResolvedValue(signal);

    const result = await service.createManualSignal({
      productUrl: 'https://example.com/baby-seat?utm=1',
      title: 'Baby Seat',
      discoveryReason: 'Manual research queue',
      trendScore: 72,
    });

    expect(result).toBe(signal);
    expect(prisma.trendSignal.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'manual',
        discoveryReason: 'Manual research queue',
        trendScore: 72,
        status: 'NEW',
      }),
    }));
  });
});
