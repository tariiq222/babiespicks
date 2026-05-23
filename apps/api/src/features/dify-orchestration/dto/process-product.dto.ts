import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class ProcessProductDto {
  @IsUrl({ require_tld: true, require_protocol: true })
  url!: string;

  @IsIn(['noon', 'amazon'])
  platform!: 'noon' | 'amazon';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  trend_score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  discovery_reason?: string;

  @IsOptional()
  @IsString()
  dify_run_id?: string;
}

export interface ProcessProductResult {
  product_id: string;
  content_page_id: string | null;
  status: string;
  summary: {
    acquisition: string;
    reviews: string;
    verdict: string;
    publish: string;
    time_ms: number;
  };
}
