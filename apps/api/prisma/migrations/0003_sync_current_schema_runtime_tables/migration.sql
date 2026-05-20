-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'SEO_CHECK', 'QUALITY_CHECK', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REVISION_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DISCOVERED', 'DATA_ACQUIRED', 'REVIEWS_ANALYZED', 'VERDICT_GENERATED', 'READY', 'ACTIVE', 'INACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiRunType" AS ENUM ('PRODUCT_PIPELINE', 'CONTENT_PIPELINE', 'DISCOVERY', 'CONTENT_SPRINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AiArtifactType" AS ENUM ('TEXT', 'IMAGE', 'JSON', 'URL');

-- CreateEnum
CREATE TYPE "AiEventType" AS ENUM ('INFO', 'WARNING', 'ERROR', 'APPROVAL_REQUIRED', 'CHECKPOINT', 'QUEUED', 'STARTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AiApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'DISCOVERED';

-- AlterTable
ALTER TABLE "product_prices" ADD COLUMN "inStock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "content_pages" ADD COLUMN "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "seoScore" DOUBLE PRECISION,
ADD COLUMN "seoScoreAr" DOUBLE PRECISION,
ADD COLUMN "seoScoreEn" DOUBLE PRECISION,
ADD COLUMN "qualityScore" DOUBLE PRECISION,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedBy" TEXT,
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "revisionNotes" TEXT,
ADD COLUMN "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "contentPageId" TEXT,
    "productId" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "platform" TEXT NOT NULL DEFAULT 'twitter',
    "format" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "hashtags" TEXT[],
    "visualUrl" TEXT,
    "complianceScore" DOUBLE PRECISION,
    "complianceNotes" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_configs" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 2000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuit_breaker_states" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isTripped" BOOLEAN NOT NULL DEFAULT false,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "lastTrippedAt" TIMESTAMP(3),
    "resetAt" TIMESTAMP(3),
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circuit_breaker_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AiRunType" NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "tokensUsed" INTEGER,
    "costUsd" DECIMAL(10,6),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_run_steps" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "status" "AiStepStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_run_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_artifacts" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "type" "AiArtifactType" NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_events" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "type" "AiEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_approvals" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "stepName" TEXT,
    "status" "AiApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_cost_logs" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cost_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "content_pages_status_idx" ON "content_pages"("status");

-- CreateIndex
CREATE INDEX "social_posts_contentPageId_idx" ON "social_posts"("contentPageId");

-- CreateIndex
CREATE INDEX "social_posts_productId_idx" ON "social_posts"("productId");

-- CreateIndex
CREATE INDEX "social_posts_status_idx" ON "social_posts"("status");

-- CreateIndex
-- Supports platform moderation/publishing queues filtered by status.
CREATE INDEX "social_posts_platform_status_idx" ON "social_posts"("platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_agentName_key" ON "agent_configs"("agentName");

-- CreateIndex
CREATE UNIQUE INDEX "circuit_breaker_states_name_key" ON "circuit_breaker_states"("name");

-- CreateIndex
-- Supports AI OS run dashboards and workers filtering by pipeline type and lifecycle state.
CREATE INDEX "ai_runs_type_status_idx" ON "ai_runs"("type", "status");

-- CreateIndex
CREATE INDEX "ai_runs_status_idx" ON "ai_runs"("status");

-- CreateIndex
CREATE INDEX "ai_runs_createdAt_idx" ON "ai_runs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_run_steps_aiRunId_idx" ON "ai_run_steps"("aiRunId");

-- CreateIndex
CREATE INDEX "ai_artifacts_aiRunId_idx" ON "ai_artifacts"("aiRunId");

-- CreateIndex
CREATE INDEX "ai_events_aiRunId_idx" ON "ai_events"("aiRunId");

-- CreateIndex
CREATE INDEX "ai_approvals_aiRunId_idx" ON "ai_approvals"("aiRunId");

-- CreateIndex
CREATE INDEX "ai_cost_logs_aiRunId_idx" ON "ai_cost_logs"("aiRunId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_contentPageId_fkey" FOREIGN KEY ("contentPageId") REFERENCES "content_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_run_steps" ADD CONSTRAINT "ai_run_steps_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_approvals" ADD CONSTRAINT "ai_approvals_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_cost_logs" ADD CONSTRAINT "ai_cost_logs_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
