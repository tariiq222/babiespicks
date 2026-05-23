import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class RunStartDto {
  @IsIn(['cron', 'manual'])
  triggered_by!: 'cron' | 'manual';

  @IsOptional()
  @IsInt()
  @Min(0)
  total_candidates?: number;
}

export class RunFinishDto {
  @IsUUID()
  dify_run_id!: string;

  @IsInt()
  @Min(0)
  succeeded!: number;

  @IsInt()
  @Min(0)
  failed!: number;

  @IsOptional()
  error?: Record<string, unknown> | string;
}

export interface RunStartResult {
  dify_run_id: string;
}

export interface RunFinishResult {
  dify_run_id: string;
  total_candidates: number;
  succeeded: number;
  failed: number;
  started_at: string;
  finished_at: string;
}
