import { IsString, IsOptional, IsNumber, IsDate, IsEnum, IsNotEmpty, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { CouponStatus } from '@prisma/client';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  validFrom?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  validUntil?: Date;

  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;
}
