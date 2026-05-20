import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
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
