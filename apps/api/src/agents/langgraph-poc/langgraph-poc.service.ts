import { Injectable, Logger } from '@nestjs/common';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ReviewAnalyzerService, type ReviewData, type ReviewAnalysis } from '../review-analyzer/review-analyzer.service';
import { VerdictEngineService, type VerdictResult } from '../verdict-engine/verdict-engine.service';
import type { PocInput, PocOptions, PocState } from './langgraph-poc.types';

const StateAnnotation = Annotation.Root({
  productId: Annotation<string>(),
  reviews: Annotation<ReviewData[]>(),
  analysis: Annotation<ReviewAnalysis | undefined>(),
  verdict: Annotation<VerdictResult | undefined>(),
  errors: Annotation<string[]>(),
  skipped: Annotation<boolean>(),
});

type StateType = typeof StateAnnotation.State;

@Injectable()
export class LangGraphPocService {
  private readonly logger = new Logger(LangGraphPocService.name);

  constructor(
    private readonly reviewAnalyzer: ReviewAnalyzerService,
    private readonly verdictEngine: VerdictEngineService,
  ) {}

  async run(input: PocInput, options?: PocOptions): Promise<PocState> {
    const enabled = options?.enabled ?? process.env.LANGGRAPH_POC_ENABLED === 'true';

    if (!enabled) {
      return {
        productId: input.productId,
        reviews: input.reviews,
        errors: [],
        skipped: true,
      };
    }

    const graph = this.buildGraph();

    return graph.invoke({
      productId: input.productId,
      reviews: input.reviews,
      errors: [],
      skipped: false,
    }) as Promise<PocState>;
  }

  private buildGraph() {
    return new StateGraph(StateAnnotation)
      .addNode('reviewAnalyzer', this.reviewAnalyzerNode.bind(this))
      .addNode('verdictEngine', this.verdictEngineNode.bind(this))
      .addEdge(START, 'reviewAnalyzer')
      .addEdge('reviewAnalyzer', 'verdictEngine')
      .addEdge('verdictEngine', END)
      .compile();
  }

  private async reviewAnalyzerNode(state: StateType): Promise<Partial<StateType>> {
    try {
      const analysis = await this.reviewAnalyzer.analyzeReviews(state.productId, state.reviews);
      return { analysis };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`ReviewAnalyzer failed: ${message}`);
      return { errors: [...state.errors, `reviewAnalyzer: ${message}`] };
    }
  }

  private async verdictEngineNode(state: StateType): Promise<Partial<StateType>> {
    if (state.errors.length > 0) {
      this.logger.log('Skipping verdictEngine due to previous errors');
      return {};
    }

    try {
      const verdict = await this.verdictEngine.generateVerdict(state.productId);
      return { verdict };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`VerdictEngine failed: ${message}`);
      return { errors: [...state.errors, `verdictEngine: ${message}`] };
    }
  }
}
