import { Injectable } from '@nestjs/common';
import { AffiliateProductDiscoveryFlow } from '../../../affiliate-product-discovery/affiliate-product-discovery.flow';
import { AmazonSearchProvider } from '../../../affiliate-product-discovery/amazon-search.provider';
import { AffiliateUrlService } from '../../../affiliate-product-discovery/affiliate-url.service';
import { NoonPlaceholderProvider } from '../../../affiliate-product-discovery/noon-placeholder.provider';
import { AffiliateDiscoveryResult } from '../../../affiliate-product-discovery/affiliate-product-discovery.flow';
import type { DiscoverySource } from '../dto/affiliate-discovery.dto';

@Injectable()
export class AffiliateDiscoveryService {
  private readonly inMemoryStore = new Map<string, AffiliateDiscoveryResult>();

  private readonly flow: AffiliateProductDiscoveryFlow;

  constructor() {
    const amazonProvider = new AmazonSearchProvider();
    const noonProvider = new NoonPlaceholderProvider();
    const urlService = new AffiliateUrlService();
    this.flow = new AffiliateProductDiscoveryFlow(amazonProvider, urlService, noonProvider);
  }

  async triggerAndGetResults(query: string, source: DiscoverySource): Promise<AffiliateDiscoveryResult> {
    const runId = crypto.randomUUID();
    const result = await this.flow.run(query, source);
    this.inMemoryStore.set(runId, result);
    return result;
  }

  getRunStatus(runId: string): { status: string } {
    const run = this.inMemoryStore.get(runId);
    if (!run) {
      return { status: 'not_found' };
    }
    return { status: 'completed' };
  }

  getRunResults(runId: string): AffiliateDiscoveryResult | null {
    return this.inMemoryStore.get(runId) ?? null;
  }
}
