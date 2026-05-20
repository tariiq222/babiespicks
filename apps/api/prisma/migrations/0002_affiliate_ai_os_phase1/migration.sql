-- CreateEnum
CREATE TYPE "TrendSignalStatus" AS ENUM ('NEW', 'PROMOTED_TO_DRAFT', 'DISMISSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductDraftStatus" AS ENUM ('NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_EDIT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "trend_signals" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "canonicalUrl" TEXT,
    "rawTitle" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "discoveryReason" TEXT NOT NULL,
    "trendScore" DOUBLE PRECISION NOT NULL,
    "demandSignal" TEXT,
    "competitionSignal" TEXT,
    "seasonalitySignal" TEXT,
    "metadata" JSONB,
    "status" "TrendSignalStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trend_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_drafts" (
    "id" TEXT NOT NULL,
    "trendSignalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "price" DECIMAL(10,2),
    "sourceUrl" TEXT,
    "canonicalUrl" TEXT,
    "affiliateUrl" TEXT,
    "category" TEXT,
    "sourceType" TEXT,
    "normalizedTitle" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "discoveryReason" TEXT NOT NULL,
    "trendScore" DOUBLE PRECISION NOT NULL,
    "demandSignal" TEXT,
    "competitionSignal" TEXT,
    "seasonalitySignal" TEXT,
    "rawData" JSONB,
    "status" "ProductDraftStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "editNotes" TEXT,
    "transitionIdempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trend_signals_canonicalUrl_key" ON "trend_signals"("canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "trend_signals_normalizedTitle_key" ON "trend_signals"("normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "trend_signals_sourceHash_key" ON "trend_signals"("sourceHash");

-- CreateIndex
-- Supports Affiliate AI OS Phase 1 review queues ordered by trend score within status buckets.
CREATE INDEX "trend_signals_status_trendScore_idx" ON "trend_signals"("status", "trendScore");

-- CreateIndex
-- Supports listing newly discovered or archived signals by status and recency without scanning all signals.
CREATE INDEX "trend_signals_status_createdAt_idx" ON "trend_signals"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_drafts_canonicalUrl_key" ON "product_drafts"("canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "product_drafts_normalizedTitle_key" ON "product_drafts"("normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "product_drafts_sourceHash_key" ON "product_drafts"("sourceHash");

-- CreateIndex
-- Supports joining draft review queues back to their originating trend signal.
CREATE INDEX "product_drafts_trendSignalId_idx" ON "product_drafts"("trendSignalId");

-- CreateIndex
-- Supports Affiliate AI OS Phase 1 moderation queues ordered by trend score within status buckets.
CREATE INDEX "product_drafts_status_trendScore_idx" ON "product_drafts"("status", "trendScore");

-- CreateIndex
-- Supports status-filtered draft queues ordered by recency.
CREATE INDEX "product_drafts_status_createdAt_idx" ON "product_drafts"("status", "createdAt");

-- CreateIndex
-- Supports idempotent draft transition lookup when a caller provides a transition key.
CREATE INDEX "product_drafts_transitionIdempotencyKey_idx" ON "product_drafts"("transitionIdempotencyKey");

-- AddForeignKey
ALTER TABLE "product_drafts" ADD CONSTRAINT "product_drafts_trendSignalId_fkey" FOREIGN KEY ("trendSignalId") REFERENCES "trend_signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
