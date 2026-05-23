import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class MarketplaceSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export interface MarketplaceSearchResult {
  url: string;
  platform: 'noon' | 'amazon';
  sku: string | null;
  available: boolean;
  existing_product_id?: string;
}
