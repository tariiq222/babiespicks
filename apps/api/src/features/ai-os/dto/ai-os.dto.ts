import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { AiRunType, AiRunStatus } from '@prisma/client';

export class ListRunsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(AiRunType)
  type?: AiRunType;

  @IsOptional()
  @IsEnum(AiRunStatus)
  status?: AiRunStatus;
}

export class CreateRunDto {
  @IsString()
  name!: string;

  @IsEnum(AiRunType)
  type!: AiRunType;

  @IsOptional()
  input?: unknown; // JSON string or object stored as Prisma Json
}

export class CancelRunDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
