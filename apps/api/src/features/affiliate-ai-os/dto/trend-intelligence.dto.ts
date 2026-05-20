import type { Prisma } from '@prisma/client';
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

export const TREND_SIGNAL_TEXT_MAX_LENGTH = 2_000;
export const TREND_SIGNAL_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const TREND_SIGNAL_LIST_OFFSET_MAX = 10_000;

export enum TrendSignalStatusDtoValue {
  NEW = 'NEW',
  PROMOTED_TO_DRAFT = 'PROMOTED_TO_DRAFT',
  DISMISSED = 'DISMISSED',
  ARCHIVED = 'ARCHIVED',
}

export interface CreateTrendSignalInput {
  source: string;
  sourceUrl?: string;
  productUrl?: string;
  title: string;
  discoveryReason: string;
  trendScore: number;
  demandSignal?: string;
  competitionSignal?: string;
  seasonalitySignal?: string;
  metadata?: Prisma.InputJsonValue;
  idempotencyKey?: string;
}

export type TrendSignalStatusValue = `${TrendSignalStatusDtoValue}`;

export interface ListTrendSignalsQuery {
  status?: TrendSignalStatusValue;
  limit?: number | string;
  offset?: number | string;
}

export interface CreateManualTrendSignalInput extends Omit<CreateTrendSignalInput, 'source'> {
  source?: string;
}

export class CreateManualTrendSignalBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TREND_SIGNAL_TEXT_MAX_LENGTH)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TREND_SIGNAL_TEXT_MAX_LENGTH)
  productUrl?: string;

  @IsString()
  @MaxLength(512)
  title!: string;

  @IsString()
  @MaxLength(TREND_SIGNAL_TEXT_MAX_LENGTH)
  discoveryReason!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  trendScore!: number;

  @IsOptional()
  @IsString()
  @MaxLength(TREND_SIGNAL_TEXT_MAX_LENGTH)
  demandSignal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TREND_SIGNAL_TEXT_MAX_LENGTH)
  competitionSignal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TREND_SIGNAL_TEXT_MAX_LENGTH)
  seasonalitySignal?: string;

  @IsOptional()
  metadata?: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  @MaxLength(TREND_SIGNAL_IDEMPOTENCY_KEY_MAX_LENGTH)
  idempotencyKey?: string;
}

export class ListTrendSignalsQueryDto {
  @IsOptional()
  @IsEnum(TrendSignalStatusDtoValue)
  status?: TrendSignalStatusValue;

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
  @Max(TREND_SIGNAL_LIST_OFFSET_MAX)
  offset?: number;
}
