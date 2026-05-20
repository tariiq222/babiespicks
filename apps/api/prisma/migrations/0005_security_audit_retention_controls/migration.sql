-- CreateEnum
CREATE TYPE "RetentionClass" AS ENUM ('SHORT_LIVED', 'STANDARD', 'GENERATED_CONTENT', 'AUDIT');

-- CreateEnum
CREATE TYPE "ApprovalAuditActorType" AS ENUM ('ADMIN_API_KEY', 'SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "ApprovalAuditAction" AS ENUM ('APPROVED', 'REJECTED', 'SCHEDULED', 'REVISION_REQUESTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ApprovalAuditEntityType" AS ENUM ('CONTENT_PAGE', 'SOCIAL_POST', 'ARTICLE_DRAFT', 'PRODUCT_DRAFT', 'PRODUCT_SCORE');

-- AlterTable: retention controls for generated/sensitive records.
ALTER TABLE "product_scores" ADD COLUMN "retentionClass" "RetentionClass" NOT NULL DEFAULT 'GENERATED_CONTENT';
ALTER TABLE "product_scores" ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "article_drafts" ADD COLUMN "retentionClass" "RetentionClass" NOT NULL DEFAULT 'GENERATED_CONTENT';
ALTER TABLE "article_drafts" ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "analytics_events" ADD COLUMN "metadataSchemaVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "analytics_events" ADD COLUMN "retentionClass" "RetentionClass" NOT NULL DEFAULT 'SHORT_LIVED';
ALTER TABLE "analytics_events" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "analytics_events" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;
UPDATE "analytics_events" SET "metadata" = '{}'::jsonb WHERE "metadata" IS NULL;
ALTER TABLE "analytics_events" ALTER COLUMN "metadata" SET NOT NULL;

ALTER TABLE "optimization_recommendations" ADD COLUMN "retentionClass" "RetentionClass" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "optimization_recommendations" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateTable: append-only approval decision audit trail.
CREATE TABLE "approval_audit_events" (
    "id" TEXT NOT NULL,
    "actorType" "ApprovalAuditActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "ApprovalAuditAction" NOT NULL,
    "entityType" "ApprovalAuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Retention workers purge/expire generated product score rows by class and expiry window.
CREATE INDEX "product_scores_retentionClass_expiresAt_idx" ON "product_scores"("retentionClass", "expiresAt");

-- CreateIndex
CREATE INDEX "product_scores_expiresAt_idx" ON "product_scores"("expiresAt");

-- CreateIndex
-- Retention workers purge/expire generated article draft rows by class and expiry window.
CREATE INDEX "article_drafts_retentionClass_expiresAt_idx" ON "article_drafts"("retentionClass", "expiresAt");

-- CreateIndex
CREATE INDEX "article_drafts_expiresAt_idx" ON "article_drafts"("expiresAt");

-- CreateIndex
-- Analytics retention scans short-lived telemetry without full-table time scans.
CREATE INDEX "analytics_events_retentionClass_expiresAt_idx" ON "analytics_events"("retentionClass", "expiresAt");

-- CreateIndex
CREATE INDEX "analytics_events_expiresAt_idx" ON "analytics_events"("expiresAt");

-- CreateIndex
-- Recommendation retention scans status-independent recommendation history by expiry.
CREATE INDEX "optimization_recommendations_retentionClass_expiresAt_idx" ON "optimization_recommendations"("retentionClass", "expiresAt");

-- CreateIndex
CREATE INDEX "optimization_recommendations_expiresAt_idx" ON "optimization_recommendations"("expiresAt");

-- CreateIndex
-- Entity decision history reads all decisions for one content/social/draft entity in chronological order.
CREATE INDEX "approval_audit_events_entityType_entityId_createdAt_idx" ON "approval_audit_events"("entityType", "entityId", "createdAt");

-- CreateIndex
-- Security audits read all decisions made by the server-derived actor identity over time.
CREATE INDEX "approval_audit_events_actorType_actorId_createdAt_idx" ON "approval_audit_events"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "approval_audit_events_action_createdAt_idx" ON "approval_audit_events"("action", "createdAt");

-- CreateIndex
CREATE INDEX "approval_audit_events_createdAt_idx" ON "approval_audit_events"("createdAt");
