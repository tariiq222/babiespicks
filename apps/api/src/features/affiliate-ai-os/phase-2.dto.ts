import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ArticleDraftStatus, ContentType } from '@prisma/client';

export const PHASE_2_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const PHASE_2_REASON_MAX_LENGTH = 1_000;
export const PHASE_2_NOTES_MAX_LENGTH = 2_000;
export const PHASE_2_LIST_OFFSET_MAX = 10_000;
export const PHASE_2_TEXT_MAX_LENGTH = 2_000;
export const PHASE_2_TITLE_MAX_LENGTH = 512;

export const OFFER_ENRICHMENT_STATUSES = ['READY', 'NEEDS_REVIEW', 'REJECTED'] as const;
export type OfferEnrichmentStatus = (typeof OFFER_ENRICHMENT_STATUSES)[number];

export const PHASE_2_CONTENT_TYPES = ['article', 'social_post', 'email', 'ad_copy'] as const;
export type Phase2ContentType = (typeof PHASE_2_CONTENT_TYPES)[number];

export type ContentDraftStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

/* ------------------------------------------------------------------ */
/*  Offer Enrichment DTOs                                              */
/* ------------------------------------------------------------------ */

export class CreateOfferEnrichmentBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sourceProductDraftId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(PHASE_2_REASON_MAX_LENGTH)
  enrichmentReason?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PHASE_2_TITLE_MAX_LENGTH)
  offerTitle!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  targetAudience?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  keyBenefits?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  painPoints?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  objections?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  positioningAngle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  contentAngles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  suggestedHooks?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keywords?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  confidenceScore?: number;

  @IsOptional()
  @IsEnum(['READY', 'NEEDS_REVIEW', 'REJECTED'] as const)
  status?: OfferEnrichmentStatus;
}

export class UpdateOfferEnrichmentBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(PHASE_2_TITLE_MAX_LENGTH)
  offerTitle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  targetAudience?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  keyBenefits?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  painPoints?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  objections?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  positioningAngle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  contentAngles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  suggestedHooks?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keywords?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  confidenceScore?: number;

  @IsOptional()
  @IsEnum(['READY', 'NEEDS_REVIEW', 'REJECTED'] as const)
  status?: OfferEnrichmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(PHASE_2_REASON_MAX_LENGTH)
  enrichmentReason?: string;
}

export class ListOfferEnrichmentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceProductDraftId?: string;

  @IsOptional()
  @IsEnum(['READY', 'NEEDS_REVIEW', 'REJECTED'] as const)
  status?: OfferEnrichmentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(PHASE_2_LIST_OFFSET_MAX)
  offset?: number;
}

/* ------------------------------------------------------------------ */
/*  Content Draft DTOs                                                 */
/* ------------------------------------------------------------------ */

export class CreateContentDraftBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sourceOfferEnrichmentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PHASE_2_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @IsOptional()
  @IsEnum(ContentType)
  type?: ContentType;

  @IsOptional()
  @IsIn(PHASE_2_CONTENT_TYPES)
  contentType?: Phase2ContentType;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  angle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  callToAction?: string;

  @IsOptional()
  rawData?: unknown;
}

export class UpdateContentDraftBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(PHASE_2_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  angle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  callToAction?: string;

  @IsOptional()
  rawData?: unknown;
}

export class ListContentDraftsQueryDto {
  @IsOptional()
  @IsEnum(ArticleDraftStatus)
  status?: ArticleDraftStatus;

  @IsOptional()
  @IsEnum(ContentType)
  type?: ContentType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(PHASE_2_LIST_OFFSET_MAX)
  offset?: number;
}

export class ContentDraftTransitionBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(PHASE_2_REASON_MAX_LENGTH)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PHASE_2_IDEMPOTENCY_KEY_MAX_LENGTH)
  idempotencyKey?: string;
}

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces (service-layer)                              */
/* ------------------------------------------------------------------ */

export interface OfferEnrichmentOutput {
  offerTitle: string;
  targetAudience?: string[];
  keyBenefits?: string[];
  painPoints?: string[];
  objections?: string[];
  positioningAngle?: string;
  contentAngles?: string[];
  suggestedHooks?: string[];
  keywords?: string[];
  confidenceScore?: number;
  sourceProductDraftId: string;
  enrichmentReason?: string;
  status: OfferEnrichmentStatus;
}

export interface OfferEnrichmentInput {
  sourceProductDraftId: string;
  enrichmentReason?: string;
}

export interface OfferEnrichmentRecord {
  id: string;
  name: string;
  type: string;
  status: string;
  input: unknown;
  output: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export type ListOfferEnrichmentsQuery = ListOfferEnrichmentsQueryDto;
export type ListContentDraftsQuery = ListContentDraftsQueryDto;

/* ------------------------------------------------------------------ */
/*  Content Draft Response                                             */
/* ------------------------------------------------------------------ */

export interface ContentDraftResponse {
  id: string;
  sourceOfferEnrichmentId: string;
  contentType: Phase2ContentType;
  title: string;
  body: string;
  angle?: string;
  callToAction?: string;
  status: ContentDraftStatus;
  approvalStatus: ContentDraftStatus;
  readyForNextPhase: boolean;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}
