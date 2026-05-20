import type { Prisma } from '@prisma/client';

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
