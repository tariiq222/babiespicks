import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DiscoveryService } from '../../agents/discovery/discovery.service';
import {
  MarketplaceSearchDto,
  MarketplaceSearchResult,
} from './dto/marketplace-search.dto';

@Injectable()
export class DifyOrchestrationService {
  private readonly logger = new Logger(DifyOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
  ) {}

  async searchMarketplace(dto: MarketplaceSearchDto): Promise<MarketplaceSearchResult> {
    const normalized = dto.name.toLowerCase().trim();

    const existing = await this.prisma.product.findFirst({
      where: { name: { contains: normalized, mode: 'insensitive' } },
      select: { id: true, sourceUrl: true, store: { select: { slug: true } } },
    });

    if (existing) {
      this.logger.log(`Marketplace search hit existing product ${existing.id}`);
      return {
        url: existing.sourceUrl ?? '',
        platform: (existing.store?.slug === 'amazon' ? 'amazon' : 'noon') as 'noon' | 'amazon',
        sku: null,
        available: true,
        existing_product_id: existing.id,
      };
    }

    const found = await this.discovery.findOnMarketplace(dto.name, dto.category);
    if (!found) {
      return { url: '', platform: 'noon', sku: null, available: false };
    }
    return { ...found, available: true };
  }
}
