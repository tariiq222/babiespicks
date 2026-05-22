import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { ArabClicksService } from '../networks/arabclicks.service';
import type { AdmitadService } from '../networks/admitad.service';
import type { AmazonAssociatesService } from '../networks/amazon.service';
import type { NoonAffiliateService } from '../networks/noon.service';
import { AffiliateService } from '../affiliate.service';

function createService(prisma: unknown) {
  const arabClicks = {
    isArabClicksStore: vi.fn().mockImplementation((store: { affiliateNetwork: string | null }) => store.affiliateNetwork === 'ArabClicks'),
    generateDeepLink: vi.fn((url: string) => `https://arabclicks.com/click?p=P&a=A&l=${encodeURIComponent(url)}`),
  };
  const admitad = {
    isAdmitadStore: vi.fn().mockImplementation((store: { affiliateNetwork: string | null }) => store.affiliateNetwork === 'Admitad'),
    generateDeepLink: vi.fn((url: string) => `https://ad.admitad.com/g/C/?ulp=${encodeURIComponent(url)}`),
  };
  const amazon = {
    isAmazonStore: vi.fn().mockReturnValue(false),
    isAmazonUrl: vi.fn().mockReturnValue(false),
    generateAffiliateUrl: vi.fn((url: string) => `https://amazon.com/tag/ASSOC?link=${encodeURIComponent(url)}`),
  };
  const noon = {
    isNoonStore: vi.fn().mockImplementation((store: { affiliateNetwork: string | null; slug?: string | null }) => store.affiliateNetwork === 'Noon'),
    isNoonUrl: vi.fn().mockImplementation((url: string) => url.includes('noon.com')),
    generateAffiliateUrl: vi.fn((url: string) => `https://s.noon.com/NCODE?url=${encodeURIComponent(url)}`),
  };

  return {
    service: new AffiliateService(
      prisma as PrismaService,
      arabClicks as unknown as ArabClicksService,
      admitad as unknown as AdmitadService,
      amazon as unknown as AmazonAssociatesService,
      noon as unknown as NoonAffiliateService,
    ),
    arabClicks,
    admitad,
    amazon,
    noon,
  };
}

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

describe('AffiliateService.getSmartRedirectUrl', () => {
  it('returns the saved ProductPrice URL without calling any network generator', async () => {
    const prisma = {
      productPrice: {
        findFirst: vi.fn().mockResolvedValue({
          url: 'https://example.com/product/123',
          storeId: 'store_1',
          price: decimal(149.99),
          currency: 'SAR',
        }),
      },
    };
    const { service, arabClicks, admitad, amazon, noon } = createService(prisma);

    const result = await service.getSmartRedirectUrl('prod_1', 'store_1');

    expect(result.url).toBe('https://example.com/product/123');
    expect(result.storeId).toBe('store_1');
    expect(arabClicks.generateDeepLink).not.toHaveBeenCalled();
    expect(admitad.generateDeepLink).not.toHaveBeenCalled();
    expect(amazon.generateAffiliateUrl).not.toHaveBeenCalled();
    expect(noon.generateAffiliateUrl).not.toHaveBeenCalled();
  });

  it('returns best price URL without wrapping when no storeId given', async () => {
    const prisma = {
      productPrice: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            url: 'https://beststore.com/item',
            storeId: 'store_best',
            price: decimal(99.0),
            currency: 'SAR',
          })
          .mockResolvedValueOnce({
            url: 'https://beststore.com/item',
            storeId: 'store_best',
            price: decimal(99.0),
            currency: 'SAR',
          }),
      },
    };
    const { service, arabClicks, noon } = createService(prisma);

    const result = await service.getSmartRedirectUrl('prod_1');

    expect(result.url).toBe('https://beststore.com/item');
    expect(arabClicks.generateDeepLink).not.toHaveBeenCalled();
    expect(noon.generateAffiliateUrl).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when no URL exists for product', async () => {
    const prisma = {
      productPrice: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const { service } = createService(prisma);

    await expect(service.getSmartRedirectUrl('nonexistent')).rejects.toThrow('No affiliate URL found');
  });

  it('throws NotFoundException when storeId is provided but that store has no URL for the product', async () => {
    const prisma = {
      productPrice: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const { service } = createService(prisma);

    await expect(service.getSmartRedirectUrl('prod_1', 'store_no_url')).rejects.toThrow(
      'No affiliate URL found for product prod_1 at store store_no_url',
    );
  });

  it('falls back to best price when no storeId is given and no exact store URL exists', async () => {
    // When storeId is falsy, getBestPrice is called directly (1 findFirst)
    const prisma = {
      productPrice: {
        findFirst: vi.fn().mockResolvedValue({
          url: 'https://fallback.com/item',
          storeId: 'store_fallback',
          price: decimal(79.99),
          currency: 'SAR',
        }),
      },
    };
    const { service } = createService(prisma);

    const result = await service.getSmartRedirectUrl('prod_1');

    expect(result.url).toBe('https://fallback.com/item');
  });
});

describe('AffiliateService.persistAffiliateUrlsForProduct', () => {
  it('wraps Noon URL and updates ProductPrice', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = {
      productPrice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pp_1',
            url: 'https://noon.com/product/123',
            store: { affiliateNetwork: 'Noon', slug: null },
          },
        ]),
        update: updateMock,
      },
    };
    const { service, noon } = createService(prisma);

    const count = await service.persistAffiliateUrlsForProduct('prod_1');

    expect(count).toBe(1);
    expect(noon.generateAffiliateUrl).toHaveBeenCalledWith('https://noon.com/product/123');
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'pp_1' },
      data: { url: 'https://s.noon.com/NCODE?url=https%3A%2F%2Fnoon.com%2Fproduct%2F123' },
    });
  });

  it('wraps ArabClicks URL and updates ProductPrice', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = {
      productPrice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pp_2',
            url: 'https://amazon.com/product/456',
            store: { affiliateNetwork: 'ArabClicks', slug: null },
          },
        ]),
        update: updateMock,
      },
    };
    const { service, arabClicks } = createService(prisma);

    const count = await service.persistAffiliateUrlsForProduct('prod_1');

    expect(count).toBe(1);
    expect(arabClicks.generateDeepLink).toHaveBeenCalledWith('https://amazon.com/product/456');
    expect(updateMock).toHaveBeenCalled();
  });

  it('wraps Admitad URL and updates ProductPrice', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = {
      productPrice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pp_3',
            url: 'https://example.com/product/789',
            store: { affiliateNetwork: 'Admitad', slug: null },
          },
        ]),
        update: updateMock,
      },
    };
    const { service, admitad } = createService(prisma);

    const count = await service.persistAffiliateUrlsForProduct('prod_1');

    expect(count).toBe(1);
    expect(admitad.generateDeepLink).toHaveBeenCalledWith('https://example.com/product/789');
    expect(updateMock).toHaveBeenCalled();
  });

  it('skips already-wrapped Noon URL (idempotent)', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = {
      productPrice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pp_4',
            url: 'https://s.noon.com/NCODE?url=https%3A%2F%2Fnoon.com%2Fproduct%2F123',
            store: { affiliateNetwork: 'Noon', slug: null },
          },
        ]),
        update: updateMock,
      },
    };
    const { service, noon } = createService(prisma);

    const count = await service.persistAffiliateUrlsForProduct('prod_1');

    expect(count).toBe(0);
    expect(noon.generateAffiliateUrl).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('skips already-wrapped ArabClicks URL (idempotent)', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = {
      productPrice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pp_5',
            url: 'https://arabclicks.com/click?p=P&a=A&l=https%3A%2F%2Fexample.com',
            store: { affiliateNetwork: 'ArabClicks', slug: null },
          },
        ]),
        update: updateMock,
      },
    };
    const { service, arabClicks } = createService(prisma);

    const count = await service.persistAffiliateUrlsForProduct('prod_1');

    expect(count).toBe(0);
    expect(arabClicks.generateDeepLink).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('skips already-wrapped Admitad URL (idempotent)', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = {
      productPrice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pp_6',
            url: 'https://ad.admitad.com/g/C/?ulp=https%3A%2F%2Fexample.com',
            store: { affiliateNetwork: 'Admitad', slug: null },
          },
        ]),
        update: updateMock,
      },
    };
    const { service, admitad } = createService(prisma);

    const count = await service.persistAffiliateUrlsForProduct('prod_1');

    expect(count).toBe(0);
    expect(admitad.generateDeepLink).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 0 when no prices exist for product', async () => {
    const prisma = {
      productPrice: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    };
    const { service } = createService(prisma);

    const count = await service.persistAffiliateUrlsForProduct('prod_empty');

    expect(count).toBe(0);
  });
});
