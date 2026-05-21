import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePublicOfferDraftBodyDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  heroCopy?: string;

  @IsOptional()
  @IsString()
  benefits?: string;

  @IsOptional()
  @IsString()
  faq?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class UpdatePublicOfferDraftBodyDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  heroCopy?: string;

  @IsOptional()
  @IsString()
  benefits?: string;

  @IsOptional()
  @IsString()
  faq?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;
}

export class ListPublicOfferDraftsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ALL'])
  status?: string = 'ALL';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class PublicOfferDraftTransitionBodyDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export const PUBLIC_OFFER_DRAFT_STATUS_APPROVED = 'APPROVED';
export const PUBLIC_OFFER_DRAFT_STATUS_REJECTED = 'REJECTED';
export const PUBLIC_OFFER_DRAFT_STATUS_DRAFT = 'DRAFT';
export const PUBLIC_OFFER_DRAFT_STATUS_PENDING_APPROVAL = 'PENDING_APPROVAL';