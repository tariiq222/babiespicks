-- CreateEnum
CREATE TYPE "ProductScoreStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ArticleDraftStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ScheduledJobStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ScheduledJobRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OptimizationRecommendationStatus" AS ENUM ('OPEN', 'APPROVED', 'DISMISSED', 'APPLIED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "product_scores" (
    "id" TEXT NOT NULL,
    "productDraftId" TEXT,
    "productId" TEXT,
    "aiRunId" TEXT,
    "idempotencyKey" TEXT,
    "scores" JSONB NOT NULL,
    "reasoning" JSONB,
    "riskFlags" JSONB,
    "recommendation" TEXT,
    "status" "ProductScoreStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_drafts" (
    "id" TEXT NOT NULL,
    "contentPageId" TEXT,
    "aiRunId" TEXT,
    "idempotencyKey" TEXT,
    "locale" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "outline" JSONB,
    "content" TEXT,
    "productIds" TEXT[],
    "seo" JSONB,
    "status" "ArticleDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "revisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "sessionHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT,
    "locale" TEXT,
    "country" TEXT,
    "productId" TEXT,
    "contentPageId" TEXT,
    "socialPostId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "status" "ScheduledJobStatus" NOT NULL DEFAULT 'ACTIVE',
    "cronExpression" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lockKey" TEXT,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_job_runs" (
    "id" TEXT NOT NULL,
    "scheduledJobId" TEXT NOT NULL,
    "aiRunId" TEXT,
    "idempotencyKey" TEXT,
    "status" "ScheduledJobRunStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "output" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimization_recommendations" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "productId" TEXT,
    "contentPageId" TEXT,
    "socialPostId" TEXT,
    "trendSignalId" TEXT,
    "type" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "rationale" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "impactScore" DOUBLE PRECISION,
    "status" "OptimizationRecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "optimization_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_scores_idempotencyKey_key" ON "product_scores"("idempotencyKey");

-- CreateIndex
-- Score review queues filter by lifecycle state and latest update time.
CREATE INDEX "product_scores_status_updatedAt_idx" ON "product_scores"("status", "updatedAt");

-- CreateIndex
-- Entity detail pages load scores by draft/product while preserving status filtering.
CREATE INDEX "product_scores_productDraftId_status_idx" ON "product_scores"("productDraftId", "status");

-- CreateIndex
CREATE INDEX "product_scores_productId_status_idx" ON "product_scores"("productId", "status");

-- CreateIndex
CREATE INDEX "product_scores_aiRunId_idx" ON "product_scores"("aiRunId");

-- CreateIndex
CREATE UNIQUE INDEX "article_drafts_idempotencyKey_key" ON "article_drafts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "article_drafts_locale_slug_key" ON "article_drafts"("locale", "slug");

-- CreateIndex
-- Editorial queues filter by draft status and newest revisions.
CREATE INDEX "article_drafts_status_updatedAt_idx" ON "article_drafts"("status", "updatedAt");

-- CreateIndex
-- Content planning lists are locale/type/status scoped.
CREATE INDEX "article_drafts_locale_type_status_idx" ON "article_drafts"("locale", "type", "status");

-- CreateIndex
CREATE INDEX "article_drafts_contentPageId_idx" ON "article_drafts"("contentPageId");

-- CreateIndex
CREATE INDEX "article_drafts_aiRunId_idx" ON "article_drafts"("aiRunId");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_events_idempotencyKey_key" ON "analytics_events"("idempotencyKey");

-- CreateIndex
-- Analytics dashboards are time-windowed first, then sliced by event/source/entity.
CREATE INDEX "analytics_events_occurredAt_idx" ON "analytics_events"("occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_eventType_occurredAt_idx" ON "analytics_events"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_source_occurredAt_idx" ON "analytics_events"("source", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_productId_occurredAt_idx" ON "analytics_events"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_contentPageId_occurredAt_idx" ON "analytics_events"("contentPageId", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_socialPostId_occurredAt_idx" ON "analytics_events"("socialPostId", "occurredAt");

-- CreateIndex
-- sessionHash is the only session identifier retained; no raw session/user/IP fields are stored here.
CREATE INDEX "analytics_events_sessionHash_occurredAt_idx" ON "analytics_events"("sessionHash", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_key_key" ON "scheduled_jobs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_lockKey_key" ON "scheduled_jobs"("lockKey");

-- CreateIndex
-- Schedulers poll active rows by next run time.
CREATE INDEX "scheduled_jobs_status_nextRunAt_idx" ON "scheduled_jobs"("status", "nextRunAt");

-- CreateIndex
-- Workers release or reclaim expired coarse locks by lockedUntil.
CREATE INDEX "scheduled_jobs_lockedUntil_idx" ON "scheduled_jobs"("lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_job_runs_idempotencyKey_key" ON "scheduled_job_runs"("idempotencyKey");

-- CreateIndex
-- Prevents duplicate execution for one job at one scheduled slot.
CREATE UNIQUE INDEX "scheduled_job_runs_scheduledJobId_scheduledFor_key" ON "scheduled_job_runs"("scheduledJobId", "scheduledFor");

-- CreateIndex
-- Job history and retries are read by job/status/scheduled slot.
CREATE INDEX "scheduled_job_runs_scheduledJobId_status_scheduledFor_idx" ON "scheduled_job_runs"("scheduledJobId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "scheduled_job_runs_status_scheduledFor_idx" ON "scheduled_job_runs"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "scheduled_job_runs_lockExpiresAt_idx" ON "scheduled_job_runs"("lockExpiresAt");

-- CreateIndex
CREATE INDEX "scheduled_job_runs_aiRunId_idx" ON "scheduled_job_runs"("aiRunId");

-- CreateIndex
CREATE UNIQUE INDEX "optimization_recommendations_idempotencyKey_key" ON "optimization_recommendations"("idempotencyKey");

-- CreateIndex
-- Optimization queues prioritize actionable recommendations by status and priority.
CREATE INDEX "optimization_recommendations_status_priority_idx" ON "optimization_recommendations"("status", "priority");

-- CreateIndex
CREATE INDEX "optimization_recommendations_productId_status_idx" ON "optimization_recommendations"("productId", "status");

-- CreateIndex
CREATE INDEX "optimization_recommendations_contentPageId_status_idx" ON "optimization_recommendations"("contentPageId", "status");

-- CreateIndex
CREATE INDEX "optimization_recommendations_socialPostId_status_idx" ON "optimization_recommendations"("socialPostId", "status");

-- CreateIndex
CREATE INDEX "optimization_recommendations_trendSignalId_status_idx" ON "optimization_recommendations"("trendSignalId", "status");

-- AddForeignKey
ALTER TABLE "product_scores" ADD CONSTRAINT "product_scores_productDraftId_fkey" FOREIGN KEY ("productDraftId") REFERENCES "product_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_scores" ADD CONSTRAINT "product_scores_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_scores" ADD CONSTRAINT "product_scores_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_drafts" ADD CONSTRAINT "article_drafts_contentPageId_fkey" FOREIGN KEY ("contentPageId") REFERENCES "content_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_drafts" ADD CONSTRAINT "article_drafts_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_contentPageId_fkey" FOREIGN KEY ("contentPageId") REFERENCES "content_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "social_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_scheduledJobId_fkey" FOREIGN KEY ("scheduledJobId") REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_recommendations" ADD CONSTRAINT "optimization_recommendations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_recommendations" ADD CONSTRAINT "optimization_recommendations_contentPageId_fkey" FOREIGN KEY ("contentPageId") REFERENCES "content_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_recommendations" ADD CONSTRAINT "optimization_recommendations_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "social_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_recommendations" ADD CONSTRAINT "optimization_recommendations_trendSignalId_fkey" FOREIGN KEY ("trendSignalId") REFERENCES "trend_signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
