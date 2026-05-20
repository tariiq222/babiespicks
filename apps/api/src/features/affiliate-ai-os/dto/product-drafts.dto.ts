import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PRODUCT_DRAFT_REVIEWER_ID_MAX_LENGTH = 128;
export const PRODUCT_DRAFT_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const PRODUCT_DRAFT_REASON_MAX_LENGTH = 1_000;
export const PRODUCT_DRAFT_NOTES_MAX_LENGTH = 2_000;
export const PRODUCT_DRAFT_LIST_OFFSET_MAX = 10_000;
export const PRODUCT_DRAFT_TEXT_MAX_LENGTH = 2_000;

export const PRODUCT_DRAFT_STATUSES = [
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'NEEDS_EDIT',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export type ProductDraftTransitionAction = 'approve' | 'reject' | 'needs_edit';
export type ProductDraftStatusValue = (typeof PRODUCT_DRAFT_STATUSES)[number];

export enum ProductDraftStatusDtoValue {
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEEDS_EDIT = 'NEEDS_EDIT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export interface ProductDraftTransitionInput {
  action: ProductDraftTransitionAction;
  reviewerId?: string;
  reason?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface ProductDraftEvaluationInput {
  aiRunId?: string;
  idempotencyKey?: string;
}

export interface ProductDraftPublishInput {
  actorId?: string;
  idempotencyKey?: string;
}

export interface ProductDraftUpdateInput {
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  affiliateUrl?: string | null;
  category?: string | null;
  discoveryReason?: string;
  trendScore?: number;
  rawData?: unknown;
}

export class ProductDraftTransitionBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_REVIEWER_ID_MAX_LENGTH)
  reviewerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_REASON_MAX_LENGTH)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_NOTES_MAX_LENGTH)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_IDEMPOTENCY_KEY_MAX_LENGTH)
  idempotencyKey?: string;
}

export class ProductDraftEvaluationBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_IDEMPOTENCY_KEY_MAX_LENGTH)
  aiRunId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_IDEMPOTENCY_KEY_MAX_LENGTH)
  idempotencyKey?: string;
}

export class ProductDraftPublishBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_REVIEWER_ID_MAX_LENGTH)
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_IDEMPOTENCY_KEY_MAX_LENGTH)
  idempotencyKey?: string;
}

export class CreateProductDraftFromTrendSignalBodyDto {
  @IsString()
  @MaxLength(128)
  trendSignalId!: string;
}

export class UpdateProductDraftBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_TEXT_MAX_LENGTH)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_TEXT_MAX_LENGTH)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_TEXT_MAX_LENGTH)
  sourceUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_TEXT_MAX_LENGTH)
  canonicalUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_TEXT_MAX_LENGTH)
  affiliateUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DRAFT_TEXT_MAX_LENGTH)
  discoveryReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  trendScore?: number;

  @IsOptional()
  rawData?: unknown;
}

export class ListProductDraftsQueryDto {
  @IsOptional()
  @IsEnum(ProductDraftStatusDtoValue)
  status?: ProductDraftStatusValue;

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
  @Max(PRODUCT_DRAFT_LIST_OFFSET_MAX)
  offset?: number;
}

export type ListProductDraftsQuery = ListProductDraftsQueryDto;
