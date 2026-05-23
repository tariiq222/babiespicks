import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the strategy modules BEFORE importing DiscoveryService
vi.mock('../strategies/noon-bestsellers', () => ({
  scrapeNoonBestsellers: vi.fn(),
  searchNoonByName: vi.fn(),
}));
vi.mock('../strategies/amazon-bestsellers', () => ({
  scrapeAmazonBestsellers: vi.fn(),
  searchAmazonByName: vi.fn(),
}));

import { DiscoveryService } from '../discovery.service';
import { searchNoonByName } from '../strategies/noon-bestsellers';
import { searchAmazonByName } from '../strategies/amazon-bestsellers';

const noonMock = searchNoonByName as unknown as ReturnType<typeof vi.fn>;
const amazonMock = searchAmazonByName as unknown as ReturnType<typeof vi.fn>;

describe('DiscoveryService.findOnMarketplace', () => {
  let service: DiscoveryService;

  beforeEach(() => {
    vi.clearAllMocks();
    // PrismaService is not exercised by findOnMarketplace
    service = new DiscoveryService({} as never);
  });

  it('returns noon hit when noon strategy finds a match', async () => {
    noonMock.mockResolvedValue({
      url: 'https://www.noon.com/saudi-en/stokke-tripp/p/N123',
      sku: 'N123',
    });
    amazonMock.mockResolvedValue(null);

    const result = await service.findOnMarketplace('Stokke Tripp Trapp');

    expect(result).toEqual({
      url: 'https://www.noon.com/saudi-en/stokke-tripp/p/N123',
      platform: 'noon',
      sku: 'N123',
    });
    expect(noonMock).toHaveBeenCalledWith('Stokke Tripp Trapp', undefined);
    expect(amazonMock).not.toHaveBeenCalled();
  });

  it('falls back to amazon when noon returns no result', async () => {
    noonMock.mockResolvedValue(null);
    amazonMock.mockResolvedValue({
      url: 'https://www.amazon.sa/dp/B0ABCDEFGH',
      sku: 'B0ABCDEFGH',
    });

    const result = await service.findOnMarketplace('Random Baby Product', 'feeding');

    expect(result).toEqual({
      url: 'https://www.amazon.sa/dp/B0ABCDEFGH',
      platform: 'amazon',
      sku: 'B0ABCDEFGH',
    });
    expect(noonMock).toHaveBeenCalledWith('Random Baby Product', 'feeding');
    expect(amazonMock).toHaveBeenCalledWith('Random Baby Product', 'feeding');
  });

  it('returns null when neither marketplace has a hit', async () => {
    noonMock.mockResolvedValue(null);
    amazonMock.mockResolvedValue(null);

    const result = await service.findOnMarketplace('Nonexistent Product');

    expect(result).toBeNull();
  });

  it('returns null sku when strategy returns hit without sku', async () => {
    noonMock.mockResolvedValue({
      url: 'https://www.noon.com/saudi-en/something',
      sku: null,
    });

    const result = await service.findOnMarketplace('Something');

    expect(result).toEqual({
      url: 'https://www.noon.com/saudi-en/something',
      platform: 'noon',
      sku: null,
    });
  });

  it('swallows strategy errors and continues fallback chain', async () => {
    noonMock.mockRejectedValue(new Error('noon down'));
    amazonMock.mockResolvedValue({
      url: 'https://www.amazon.sa/dp/B0XYZ',
      sku: 'B0XYZ',
    });

    const result = await service.findOnMarketplace('Whatever');

    expect(result).toEqual({
      url: 'https://www.amazon.sa/dp/B0XYZ',
      platform: 'amazon',
      sku: 'B0XYZ',
    });
  });
});
