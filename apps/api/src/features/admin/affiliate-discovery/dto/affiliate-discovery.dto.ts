import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum DiscoverySource {
  Amazon = 'amazon',
  Noon = 'noon',
  Manual = 'manual',
}

export class TriggerDiscoveryDto {
  @IsString()
  query!: string;

  @IsEnum(DiscoverySource)
  @IsOptional()
  source?: DiscoverySource = DiscoverySource.Amazon;
}

export class AffiliateLinkDto {
  asin!: string;
  tag!: string;
  url!: string;
}

export class SearchMetadataDto {
  engine!: string;
  queryTime!: number;
  resultCount!: number;
}

export class DiscoveryRunResponseDto {
  query!: string;
  source!: string;
  searchResults!: unknown[];
  selectedAsin?: string;
  selectedUrl?: string;
  affiliateLink?: AffiliateLinkDto;
  errors!: string[];
  skipped!: boolean;
  skipReason?: string;
  provider!: string;
  searchMetadata?: SearchMetadataDto;
}
