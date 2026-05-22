import { Injectable, Logger } from '@nestjs/common';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { AmazonSearchProvider } from '../../features/affiliate-product-discovery/amazon-search.provider';
import { AffiliateUrlService } from '../../features/affiliate-product-discovery/affiliate-url.service';
import type {
  AffiliateGraphInput,
  AffiliateGraphState,
} from './affiliate-graph.types';
import type {
  ProductSearchQuery,
  ProductResult,
} from '../../features/affiliate-product-discovery/types';

const StateAnnotation = Annotation.Root({
  query: Annotation<ProductSearchQuery>(),
  source: Annotation<string>(),
  searchResults: Annotation<ProductResult[]>(),
  selectedAsin: Annotation<string | undefined>(),
  selectedUrl: Annotation<string | undefined>(),
  affiliateLink: Annotation<
    { url: string; provider: string; tag?: string } | undefined
  >(),
  errors: Annotation<string[]>(),
  skipped: Annotation<boolean>(),
  skipReason: Annotation<string | undefined>(),
  provider: Annotation<string>(),
  searchMetadata: Annotation<unknown>(),
});

type StateType = typeof StateAnnotation.State;

@Injectable()
export class AffiliateGraphService {
  private readonly logger = new Logger(AffiliateGraphService.name);

  constructor(
    private readonly amazonSearchProvider: AmazonSearchProvider,
    private readonly affiliateUrlService: AffiliateUrlService,
  ) {}

  async run(input: AffiliateGraphInput): Promise<AffiliateGraphState> {
    const enabled = input.enabled ?? false;

    if (!enabled) {
      return {
        query: input.query,
        source: input.source,
        searchResults: [],
        errors: [],
        skipped: true,
        skipReason: 'Graph is disabled (shadow mode)',
        provider: input.provider ?? 'amazon',
      };
    }

    const graph = this.buildGraph();

    return graph.invoke({
      query: input.query,
      source: input.source,
      searchResults: [],
      errors: [],
      skipped: false,
      provider: input.provider ?? 'amazon',
    }) as Promise<AffiliateGraphState>;
  }

  private buildGraph() {
    return new StateGraph(StateAnnotation)
      .addNode('search', this.searchNode.bind(this))
      .addNode('parse', this.parseNode.bind(this))
      .addNode('filter', this.filterNode.bind(this))
      .addNode('linkBuilder', this.linkBuilderNode.bind(this))
      .addEdge(START, 'search')
      .addEdge('search', 'parse')
      .addEdge('parse', 'filter')
      .addEdge('filter', 'linkBuilder')
      .addEdge('linkBuilder', END)
      .compile();
  }

  private async searchNode(state: StateType): Promise<Partial<StateType>> {
    try {
      this.logger.log('[checkpoint 1/4] searchNode — building request');

      const request = this.amazonSearchProvider.buildSearchRequest(state.query);

      // Shadow mode: simulate a raw JSON response without real network call
      const simulatedRaw = this.simulateSearchResponse(request);

      this.logger.log('[checkpoint 1/4] searchNode — request built, raw response simulated');

      return {
        searchMetadata: {
          request,
          rawResponse: simulatedRaw,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`searchNode failed: ${message}`);
      return { errors: [...state.errors, `search: ${message}`] };
    }
  }

  private async parseNode(state: StateType): Promise<Partial<StateType>> {
    if (state.errors.length > 0) {
      this.logger.log('Skipping parseNode due to previous errors');
      return {};
    }

    try {
      this.logger.log('[checkpoint 2/4] parseNode — transforming raw response');

      const metadata = state.searchMetadata as {
        rawResponse: unknown;
      } | undefined;

      if (!metadata?.rawResponse) {
        throw new Error('No raw response available from search node');
      }

      const result = this.amazonSearchProvider.transformResponse(
        metadata.rawResponse,
        state.query,
      );

      this.logger.log(
        `[checkpoint 2/4] parseNode — transformed ${result.results.length} results`,
      );

      return { searchResults: result.results };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`parseNode failed: ${message}`);
      return { errors: [...state.errors, `parse: ${message}`] };
    }
  }

  private async filterNode(state: StateType): Promise<Partial<StateType>> {
    if (state.errors.length > 0) {
      this.logger.log('Skipping filterNode due to previous errors');
      return {};
    }

    try {
      this.logger.log('[checkpoint 3/4] filterNode — filtering Amazon.sa results');

      const amazonSaResults = state.searchResults.filter((item) =>
        this.affiliateUrlService.isAmazonSaUrl(item.url),
      );

      if (amazonSaResults.length === 0) {
        this.logger.log('No Amazon.sa results found after filtering');
        return {
          searchResults: [],
          errors: [...state.errors, 'filter: no Amazon.sa results found'],
        };
      }

      const selected = amazonSaResults[0];
      const asin = this.affiliateUrlService.extractAmazonAsin(selected.url);

      this.logger.log(
        `[checkpoint 3/4] filterNode — selected ASIN: ${asin ?? 'none'}`,
      );

      return {
        selectedAsin: asin ?? undefined,
        selectedUrl: selected.url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`filterNode failed: ${message}`);
      return { errors: [...state.errors, `filter: ${message}`] };
    }
  }

  private async linkBuilderNode(state: StateType): Promise<Partial<StateType>> {
    if (state.errors.length > 0) {
      this.logger.log('Skipping linkBuilderNode due to previous errors');
      return {};
    }

    try {
      this.logger.log('[checkpoint 4/4] linkBuilderNode — building affiliate URL');

      if (!state.selectedUrl) {
        throw new Error('No selected URL available from filter node');
      }

      const affiliateUrl = this.affiliateUrlService.buildAmazonAffiliateUrl(
        state.selectedUrl,
      );

      if (!affiliateUrl) {
        throw new Error('Failed to build affiliate URL for selected item');
      }

      this.logger.log(
        '[checkpoint 4/4] linkBuilderNode — affiliate URL built successfully',
      );

      return {
        affiliateLink: {
          url: affiliateUrl,
          provider: state.provider,
          tag: 'babiespicks-21',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`linkBuilderNode failed: ${message}`);
      return { errors: [...state.errors, `linkBuilder: ${message}`] };
    }
  }

  /**
   * Simulates a raw search API response for shadow mode.
   * No real network calls are made.
   */
  private simulateSearchResponse(
    request: ReturnType<typeof this.amazonSearchProvider.buildSearchRequest>,
  ): unknown {
    const keyword = request.params?.q ?? 'unknown';

    return {
      total: 2,
      page: 1,
      nextPageToken: null,
      results: [
        {
          id: 'B08N5WRWNW',
          asin: 'B08N5WRWNW',
          title: `${keyword} - Product One`,
          price: 129.99,
          currency: 'SAR',
          image: 'https://m.media-amazon.com/images/I/placeholder1.jpg',
          url: 'https://www.amazon.sa/dp/B08N5WRWNW',
          rating: 4.5,
          reviewCount: 120,
        },
        {
          id: 'B08N5M7S6K',
          asin: 'B08N5M7S6K',
          title: `${keyword} - Product Two`,
          price: 89.5,
          currency: 'SAR',
          image: 'https://m.media-amazon.com/images/I/placeholder2.jpg',
          url: 'https://www.amazon.sa/dp/B08N5M7S6K',
          rating: 4.2,
          reviewCount: 85,
        },
      ],
    };
  }
}
