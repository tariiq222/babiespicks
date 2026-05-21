import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const OFFER_ENRICHMENT_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
export type OfferEnrichmentStatusValue = (typeof OFFER_ENRICHMENT_STATUSES)[number];

export enum OfferEnrichmentStatusDtoValue {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export const CONTENT_DRAFT_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;
export type ContentDraftStatusValue = (typeof CONTENT_DRAFT_STATUSES)[number];

export enum ContentDraftStatusDtoValue {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const CONTENT_TYPES = ['article', 'social_post', 'email', 'ad_copy'] as const;
export type ContentTypeValue = (typeof CONTENT_TYPES)[number];

export enum ContentTypeDtoValue {
  ARTICLE = 'article',
  SOCIAL_POST = 'social_post',
  EMAIL = 'email',
  AD_COPY = 'ad_copy',
}

// ============ OfferEnrichment DTOs ============

export interface OfferEnrichmentUpdateInput {
  offerTitle?: string;
  targetAudience?: string;
  keyBenefits?: string[];
  painPoints?: string[];
  objections?: string[];
  positioningAngle?: string;
  contentAngles?: string[];
  suggestedHooks?: string[];
  keywords?: string[];
  confidenceScore?: number;
  enrichmentReason?: string;
}

export interface OfferEnrichmentEnrichInput {
  idempotencyKey?: string;
}

export interface ListOfferEnrichmentsQuery {
  status?: OfferEnrichmentStatusValue;
  sourceProductDraftId?: string;
  limit?: number;
  offset?: number;
}

export class OfferEnrichmentUpdateBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  offerTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  targetAudience?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyBenefits?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  painPoints?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objections?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  positioningAngle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentAngles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedHooks?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  enrichmentReason?: string;
}

export class EnrichProductDraftBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class GenerateContentBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class ListOfferEnrichmentsQueryDto {
  @IsOptional()
  @IsEnum(OfferEnrichmentStatusDtoValue)
  status?: OfferEnrichmentStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceProductDraftId?: string;

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
  @Max(10000)
  offset?: number;
}

// ============ ContentDraft DTOs ============

export interface ContentDraftUpdateInput {
  title?: string;
  body?: string;
  angle?: string;
  callToAction?: string;
}

export interface ContentDraftApprovalInput {
  idempotencyKey?: string;
  reason?: string;
}

export class ContentDraftUpdateBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  angle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  callToAction?: string;
}

export class ContentDraftApprovalBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ListContentDraftsQueryDto {
  @IsOptional()
  @IsEnum(ContentDraftStatusDtoValue)
  status?: ContentDraftStatusValue;

  @IsOptional()
  @IsEnum(ContentTypeDtoValue)
  contentType?: ContentTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceOfferEnrichmentId?: string;

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
  @Max(10000)
  offset?: number;
}

export type ListContentDraftsQuery = ListContentDraftsQueryDto;