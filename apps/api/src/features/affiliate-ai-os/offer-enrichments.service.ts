import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiRunStatus, AiRunType } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  CreateOfferEnrichmentBodyDto,
  ListOfferEnrichmentsQuery,
  OfferEnrichmentInput,
  OfferEnrichmentOutput,
  OfferEnrichmentRecord,
  UpdateOfferEnrichmentBodyDto,
} from './phase-2.dto';

const OFFER_ENRICHMENT_STATUS_READY = 'READY' as const;
const OFFER_ENRICHMENT_STATUS_NEEDS_REVIEW = 'NEEDS_REVIEW' as const;
const PRODUCT_DRAFT_STATUS_APPROVED = 'APPROVED' as const;

const AI_RUN_TYPE_CONTENT_PIPELINE = AiRunType.CONTENT_PIPELINE;
const AI_RUN_STATUS_COMPLETED = AiRunStatus.COMPLETED;

interface ProductDraftRecord {
  id: string;
  status: string;
}

interface OfferEnrichmentPrisma {
  aiRun: {
    findUnique(args: unknown): Promise<OfferEnrichmentRecord | null>;
    findMany(args: unknown): Promise<OfferEnrichmentRecord[]>;
    create(args: unknown): Promise<OfferEnrichmentRecord>;
    update(args: unknown): Promise<OfferEnrichmentRecord>;
  };
  productDraft: {
    findUnique(args: unknown): Promise<ProductDraftRecord | null>;
  };
}

const AI_RUN_LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  input: true,
  output: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OfferEnrichmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an offer enrichment as a COMPLETED CONTENT_PIPELINE AiRun.
   * Rejects non-APPROVED ProductDrafts to enforce the Phase 2 gate.
   */
  async createEnrichment(body: CreateOfferEnrichmentBodyDto) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;

    const productDraft = await db.productDraft.findUnique({
      where: { id: body.sourceProductDraftId },
      select: { id: true, status: true },
    });

    if (!productDraft) {
      throw new NotFoundException(
        `ProductDraft ${body.sourceProductDraftId} was not found`,
      );
    }

    if (productDraft.status !== PRODUCT_DRAFT_STATUS_APPROVED) {
      throw new ConflictException(
        `ProductDraft must be APPROVED to create an offer enrichment. Current status: ${productDraft.status}`,
      );
    }

    const input: OfferEnrichmentInput = {
      sourceProductDraftId: body.sourceProductDraftId,
      enrichmentReason: body.enrichmentReason,
    };

    const output: OfferEnrichmentOutput = {
      offerTitle: body.offerTitle,
      targetAudience: body.targetAudience,
      keyBenefits: body.keyBenefits,
      painPoints: body.painPoints,
      objections: body.objections,
      positioningAngle: body.positioningAngle,
      contentAngles: body.contentAngles,
      suggestedHooks: body.suggestedHooks,
      keywords: body.keywords,
      confidenceScore: body.confidenceScore,
      sourceProductDraftId: body.sourceProductDraftId,
      enrichmentReason: body.enrichmentReason,
      status: body.status ?? OFFER_ENRICHMENT_STATUS_READY,
    };

    const aiRun = await db.aiRun.create({
      data: {
        name: `Offer Enrichment: ${body.offerTitle}`,
        type: AI_RUN_TYPE_CONTENT_PIPELINE,
        status: AI_RUN_STATUS_COMPLETED,
        input,
        output,
      },
      select: AI_RUN_LIST_SELECT,
    });

    return this.mapAiRunToEnrichment(aiRun);
  }

  /** Gets a single enrichment by reading its AiRun JSON. */
  async getEnrichment(id: string) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    const aiRun = await db.aiRun.findUnique({
      where: { id },
      select: AI_RUN_LIST_SELECT,
    });

    if (!aiRun) {
      throw new NotFoundException(`OfferEnrichment ${id} was not found`);
    }

    return this.mapAiRunToEnrichment(aiRun);
  }

  /** Lists enrichments by querying AiRun rows with optional filters. */
  async listEnrichments(query: ListOfferEnrichmentsQuery = {}) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    const take = this.normalizeLimit(query.limit);
    const skip = this.normalizeOffset(query.offset);

    const where: Record<string, unknown> = {
      type: AI_RUN_TYPE_CONTENT_PIPELINE,
      status: AI_RUN_STATUS_COMPLETED,
    };

    if (query.sourceProductDraftId) {
      where.input = {
        path: ['sourceProductDraftId'],
        equals: query.sourceProductDraftId,
      };
    }

    if (query.status) {
      where.output = {
        path: ['status'],
        equals: query.status,
      };
    }

    const aiRuns = await db.aiRun.findMany({
      where,
      select: AI_RUN_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return aiRuns.map((run) => this.mapAiRunToEnrichment(run));
  }

  /** Updates an enrichment by mutating its AiRun output JSON. */
  async updateEnrichment(id: string, body: UpdateOfferEnrichmentBodyDto) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    const existing = await db.aiRun.findUnique({
      where: { id },
      select: AI_RUN_LIST_SELECT,
    });

    if (!existing) {
      throw new NotFoundException(`OfferEnrichment ${id} was not found`);
    }

    const currentOutput = this.parseOutput(existing.output);

    const updatedOutput: OfferEnrichmentOutput = {
      ...currentOutput,
      ...(body.offerTitle !== undefined && { offerTitle: body.offerTitle }),
      ...(body.targetAudience !== undefined && { targetAudience: body.targetAudience }),
      ...(body.keyBenefits !== undefined && { keyBenefits: body.keyBenefits }),
      ...(body.painPoints !== undefined && { painPoints: body.painPoints }),
      ...(body.objections !== undefined && { objections: body.objections }),
      ...(body.positioningAngle !== undefined && { positioningAngle: body.positioningAngle }),
      ...(body.contentAngles !== undefined && { contentAngles: body.contentAngles }),
      ...(body.suggestedHooks !== undefined && { suggestedHooks: body.suggestedHooks }),
      ...(body.keywords !== undefined && { keywords: body.keywords }),
      ...(body.confidenceScore !== undefined && { confidenceScore: body.confidenceScore }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.enrichmentReason !== undefined && { enrichmentReason: body.enrichmentReason }),
    };

    const aiRun = await db.aiRun.update({
      where: { id },
      data: {
        name:
          body.offerTitle !== undefined
            ? `Offer Enrichment: ${body.offerTitle}`
            : undefined,
        output: updatedOutput,
      },
      select: AI_RUN_LIST_SELECT,
    });

    return this.mapAiRunToEnrichment(aiRun);
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  private mapAiRunToEnrichment(
    aiRun: Pick<
      OfferEnrichmentRecord,
      'id' | 'name' | 'type' | 'status' | 'input' | 'output' | 'createdAt' | 'updatedAt'
    >,
  ) {
    const input = this.parseInput(aiRun.input);
    const output = this.parseOutput(aiRun.output);

    return {
      id: aiRun.id,
      name: aiRun.name,
      type: aiRun.type,
      aiRunStatus: aiRun.status,
      enrichmentReason: input.enrichmentReason,
      ...output,
      createdAt: aiRun.createdAt,
      updatedAt: aiRun.updatedAt,
    };
  }

  private parseInput(value: unknown): OfferEnrichmentInput {
    if (typeof value !== 'object' || value === null) {
      return { sourceProductDraftId: '' };
    }
    const obj = value as Record<string, unknown>;
    return {
      sourceProductDraftId: String(obj.sourceProductDraftId ?? ''),
      enrichmentReason: obj.enrichmentReason
        ? String(obj.enrichmentReason)
        : undefined,
    };
  }

  private parseOutput(value: unknown): OfferEnrichmentOutput {
    if (typeof value !== 'object' || value === null) {
      return {
        offerTitle: '',
        sourceProductDraftId: '',
        status: OFFER_ENRICHMENT_STATUS_NEEDS_REVIEW,
      };
    }
    const obj = value as Record<string, unknown>;
    return {
      offerTitle: String(obj.offerTitle ?? ''),
      targetAudience: Array.isArray(obj.targetAudience)
        ? obj.targetAudience.map(String)
        : undefined,
      keyBenefits: Array.isArray(obj.keyBenefits)
        ? obj.keyBenefits.map(String)
        : undefined,
      painPoints: Array.isArray(obj.painPoints)
        ? obj.painPoints.map(String)
        : undefined,
      objections: Array.isArray(obj.objections)
        ? obj.objections.map(String)
        : undefined,
      positioningAngle: obj.positioningAngle
        ? String(obj.positioningAngle)
        : undefined,
      contentAngles: Array.isArray(obj.contentAngles)
        ? obj.contentAngles.map(String)
        : undefined,
      suggestedHooks: Array.isArray(obj.suggestedHooks)
        ? obj.suggestedHooks.map(String)
        : undefined,
      keywords: Array.isArray(obj.keywords)
        ? obj.keywords.map(String)
        : undefined,
      confidenceScore:
        typeof obj.confidenceScore === 'number'
          ? obj.confidenceScore
          : undefined,
      sourceProductDraftId: String(obj.sourceProductDraftId ?? ''),
      enrichmentReason: obj.enrichmentReason
        ? String(obj.enrichmentReason)
        : undefined,
      status: this.normalizeEnrichmentStatus(obj.status),
    };
  }

  private normalizeEnrichmentStatus(value: unknown): OfferEnrichmentOutput['status'] {
    const s = String(value ?? '').toUpperCase();
    if (s === 'READY' || s === 'REJECTED') return s;
    return OFFER_ENRICHMENT_STATUS_NEEDS_REVIEW;
  }

  private normalizeLimit(value?: number | string): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(value ?? '50', 10);
    if (!Number.isFinite(parsed)) return 50;
    return Math.min(100, Math.max(1, parsed));
  }

  private normalizeOffset(value?: number | string): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(value ?? '0', 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(10_000, Math.max(0, parsed));
  }
}
