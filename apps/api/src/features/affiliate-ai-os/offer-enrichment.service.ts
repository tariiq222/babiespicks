import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  OfferEnrichmentUpdateInput,
  OfferEnrichmentEnrichInput,
  ListOfferEnrichmentsQuery,
} from './dto/offer-enrichment.dto';

const PRODUCT_DRAFT_STATUS_APPROVED = 'APPROVED';

const OFFER_ENRICHMENT_STATUS_PENDING = 'PENDING';
const OFFER_ENRICHMENT_STATUS_COMPLETED = 'COMPLETED';
const OFFER_ENRICHMENT_STATUS_FAILED = 'FAILED';

interface OfferEnrichmentRecord {
  id: string;
  sourceProductDraftId: string;
  offerTitle: string | null;
  targetAudience: string | null;
  keyBenefits: unknown | null;
  painPoints: unknown | null;
  objections: unknown | null;
  positioningAngle: string | null;
  contentAngles: unknown | null;
  suggestedHooks: unknown | null;
  keywords: unknown | null;
  confidenceScore: number | null;
  enrichmentReason: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductDraftRecord {
  id: string;
  status: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: unknown | null;
  affiliateUrl: string | null;
  category: string | null;
  trendScore: number;
  demandSignal: string | null;
  competitionSignal: string | null;
}

interface OfferEnrichmentPrisma {
  $transaction<T>(fn: (tx: OfferEnrichmentPrisma) => Promise<T>): Promise<T>;
  productDraft: {
    findUnique(args: { where: { id: string }; select: Record<string, boolean> }): Promise<ProductDraftRecord | null>;
  };
  offerEnrichment: {
    findUnique(args: { where: { id: string } }): Promise<OfferEnrichmentRecord | null>;
    findFirst(args: unknown): Promise<OfferEnrichmentRecord | null>;
    findMany(args: unknown): Promise<OfferEnrichmentRecord[]>;
    create(args: unknown): Promise<OfferEnrichmentRecord>;
    update(args: unknown): Promise<OfferEnrichmentRecord>;
  };
}

const OFFER_ENRICHMENT_SELECT = {
  id: true,
  sourceProductDraftId: true,
  offerTitle: true,
  targetAudience: true,
  keyBenefits: true,
  painPoints: true,
  objections: true,
  positioningAngle: true,
  contentAngles: true,
  suggestedHooks: true,
  keywords: true,
  confidenceScore: true,
  enrichmentReason: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OfferEnrichmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates or refreshes an enrichment from an APPROVED product draft.
   * Can only enrich APPROVED drafts — this is the Phase 2 entrypoint.
   */
  async enrichDraft(draftId: string, options: OfferEnrichmentEnrichInput = {}) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    const draft = await db.productDraft.findUnique({
      where: { id: draftId },
      select: {
        id: true,
        status: true,
        title: true,
        description: true,
        imageUrl: true,
        price: true,
        affiliateUrl: true,
        category: true,
        trendScore: true,
        demandSignal: true,
        competitionSignal: true,
      },
    });

    if (!draft) {
      throw new NotFoundException(`ProductDraft ${draftId} was not found`);
    }

    if (draft.status !== PRODUCT_DRAFT_STATUS_APPROVED) {
      throw new ConflictException(
        `Cannot enrich draft with status ${draft.status}; only APPROVED drafts can be enriched`,
      );
    }

    const existing = await db.offerEnrichment.findFirst({
      where: { sourceProductDraftId: draftId },
    });

    if (existing) {
      return db.offerEnrichment.update({
        where: { id: existing.id },
        data: {
          status: OFFER_ENRICHMENT_STATUS_PENDING,
          enrichmentReason: 'Refreshed by enrich operation',
        },
      });
    }

    const enrichmentData = this.buildEnrichmentData(draft);
    return db.offerEnrichment.create({
      data: {
        sourceProductDraftId: draftId,
        ...enrichmentData,
      },
    });
  }

  /**
   * Gets a single enrichment by ID.
   */
  async getEnrichment(id: string) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    const enrichment = await db.offerEnrichment.findUnique({
      where: { id },
    });

    if (!enrichment) {
      throw new NotFoundException(`OfferEnrichment ${id} was not found`);
    }

    return enrichment;
  }

  /**
   * Lists enrichment records with optional filters.
   */
  async listEnrichments(query: ListOfferEnrichmentsQuery = {}) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    const take = this.normalizeLimit(query.limit);
    const skip = this.normalizeOffset(query.offset);

    return db.offerEnrichment.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.sourceProductDraftId ? { sourceProductDraftId: query.sourceProductDraftId } : {}),
      },
      select: OFFER_ENRICHMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  /**
   * Updates editable enrichment fields.
   */
  async updateEnrichment(id: string, input: OfferEnrichmentUpdateInput) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    const enrichment = await db.offerEnrichment.findUnique({ where: { id } });

    if (!enrichment) {
      throw new NotFoundException(`OfferEnrichment ${id} was not found`);
    }

    const data: Record<string, unknown> = {};

    if (input.offerTitle !== undefined) {
      data.offerTitle = input.offerTitle?.trim() || null;
    }
    if (input.targetAudience !== undefined) {
      data.targetAudience = input.targetAudience?.trim() || null;
    }
    if (input.keyBenefits !== undefined) {
      data.keyBenefits = input.keyBenefits ?? null;
    }
    if (input.painPoints !== undefined) {
      data.painPoints = input.painPoints ?? null;
    }
    if (input.objections !== undefined) {
      data.objections = input.objections ?? null;
    }
    if (input.positioningAngle !== undefined) {
      data.positioningAngle = input.positioningAngle?.trim() || null;
    }
    if (input.contentAngles !== undefined) {
      data.contentAngles = input.contentAngles ?? null;
    }
    if (input.suggestedHooks !== undefined) {
      data.suggestedHooks = input.suggestedHooks ?? null;
    }
    if (input.keywords !== undefined) {
      data.keywords = input.keywords ?? null;
    }
    if (input.confidenceScore !== undefined) {
      data.confidenceScore = Math.min(1, Math.max(0, Number(input.confidenceScore)));
    }
    if (input.enrichmentReason !== undefined) {
      data.enrichmentReason = input.enrichmentReason?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return this.getEnrichment(id);
    }

    const updated = await db.offerEnrichment.update({
      where: { id },
      data,
    });

    return updated;
  }

  /**
   * Generates content drafts from an enrichment record.
   * Returns the created drafts (this is a Phase 2 no-op stub for the actual AI generation;
   * real implementation would call an AI agent).
   */
  async generateContentDrafts(enrichmentId: string, options: { idempotencyKey?: string } = {}) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    const enrichment = await db.offerEnrichment.findUnique({ where: { id: enrichmentId } });

    if (!enrichment) {
      throw new NotFoundException(`OfferEnrichment ${enrichmentId} was not found`);
    }

    const idempotencyKey = options.idempotencyKey?.trim() || null;

    // Check for existing drafts with this idempotency key
    if (idempotencyKey) {
      const existing = await (db as any).contentDraft.findFirst({
        where: { sourceOfferEnrichmentId: enrichmentId, idempotencyKey },
      });
      if (existing) {
        return this.listContentDraftsForEnrichment(enrichmentId);
      }
    }

    // Phase 2 stub: create placeholder drafts for each content type
    const contentTypes = ['article', 'social_post', 'email', 'ad_copy'] as const;
    const drafts = await Promise.all(
      contentTypes.map((contentType) =>
        (db as any).contentDraft.create({
          data: {
            sourceOfferEnrichmentId: enrichmentId,
            contentType,
            title: `Draft: ${enrichment.offerTitle ?? 'Untitled'} - ${contentType}`,
            body: this.buildPlaceholderBody(enrichment, contentType),
            status: 'DRAFT',
            idempotencyKey,
          },
        }),
      ),
    );

    // Mark enrichment as completed
    await db.offerEnrichment.update({
      where: { id: enrichmentId },
      data: {
        status: OFFER_ENRICHMENT_STATUS_COMPLETED,
        confidenceScore: enrichment.confidenceScore ?? 0.8,
      },
    });

    return drafts;
  }

  private async listContentDraftsForEnrichment(enrichmentId: string) {
    const db = this.prisma as unknown as OfferEnrichmentPrisma;
    return (db as any).contentDraft.findMany({
      where: { sourceOfferEnrichmentId: enrichmentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildEnrichmentData(
    draft: ProductDraftRecord,
  ): Record<string, unknown> {
    // Phase 2 stub: builds basic enrichment data from draft fields.
    // In production this would call an AI agent to generate rich enrichment.
    const title = draft.title ?? 'Untitled Product';
    const category = draft.category ?? 'Baby Product';

    const join = (arr: string[]) => arr.filter(Boolean).join('\n• ');
    return {
      offerTitle: `${title} - ${category}`,
      targetAudience: 'Saudi parents with babies and toddlers',
      keyBenefits: '• ' + join([
        `High-quality ${category.toLowerCase()} for babies`,
        draft.affiliateUrl ? 'Available with affiliate link' : 'Competitive pricing',
        draft.trendScore > 70 ? 'Trending product' : 'Popular choice',
      ]),
      painPoints: '• ' + join([
        'Finding trustworthy baby products',
        'Concerns about product safety',
        'Value for money considerations',
      ]),
      objections: '• ' + join([
        'Is it safe for my baby?',
        'Is it worth the price?',
        'How does it compare to alternatives?',
      ]),
      positioningAngle: `Premium ${category.toLowerCase()} trusted by Saudi parents`,
      contentAngles: '• ' + join([
        'Safety and quality focus',
        'Value proposition for parents',
        'Trend and popularity angle',
      ]),
      suggestedHooks: '• ' + join([
        `Discover the best ${category.toLowerCase()} for your baby`,
        `Why Saudi parents love this ${title.toLowerCase()}`,
        `Top-rated ${category.toLowerCase()} - our complete guide`,
      ]),
      keywords: [
        title.toLowerCase(),
        category.toLowerCase(),
        'baby product',
        'Saudi Arabia',
        'parenting',
      ].join(', '),
      confidenceScore: 0.7,
      enrichmentReason: `Enriched from approved draft: ${draft.title}`,
      status: OFFER_ENRICHMENT_STATUS_PENDING,
    };
  }

  private buildPlaceholderBody(
    enrichment: OfferEnrichmentRecord,
    contentType: string,
  ): string {
    const title = enrichment.offerTitle ?? 'Untitled';
    const angle = (enrichment.positioningAngle as string | null) ?? '';
    const toLines = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
      if (typeof v === 'string') {
        return v
          .split(/\n+/)
          .map((s) => s.replace(/^[•\-*]\s*/, '').trim())
          .filter(Boolean);
      }
      return [];
    };
    const benefits = toLines(enrichment.keyBenefits);
    const hooks = toLines(enrichment.suggestedHooks);

    switch (contentType) {
      case 'article':
        return `# ${title}\n\n## Introduction\n\nDiscover everything you need to know about ${title}.\n\n## Key Benefits\n\n${benefits.map((b) => `- ${b}`).join('\n')}\n\n## Why Parents Love It\n\n${angle}`;
      case 'social_post':
        return `${title}\n\n${angle}\n\n${hooks[0] ?? 'Learn more!'}`;
      case 'email':
        return `Subject: ${title}\n\nDear Parent,\n\n${angle}\n\n${benefits[0] ?? 'Discover more about this product.'}`;
      case 'ad_copy':
        return `${title}\n\n${angle}\n\nShop now!`;
      default:
        return `${title}\n\n${angle}`;
    }
  }

  private normalizeLimit(limit?: number): number {
    if (!limit || limit < 1) return 25;
    return Math.min(100, limit);
  }

  private normalizeOffset(offset?: number): number {
    if (!offset || offset < 0) return 0;
    return Math.min(10_000, offset);
  }
}
