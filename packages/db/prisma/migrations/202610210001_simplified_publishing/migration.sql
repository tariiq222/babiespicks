-- Additive only. Existing legacy tables retained. Compatible table shapes must be verified before deployment.
BEGIN;
-- CreateEnum
DO $$ BEGIN CREATE TYPE "ReviewItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "PublicOfferDraftStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'OFFER';

-- AlterTable
ALTER TABLE "content_pages" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
ADD COLUMN IF NOT EXISTS "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "publishStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN IF NOT EXISTS "sources" JSONB,
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "publishStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sources" JSONB,
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE IF NOT EXISTS "offer_enrichments" (
    "id" TEXT NOT NULL,
    "sourceProductDraftId" TEXT NOT NULL,
    "offerTitle" TEXT,
    "targetAudience" TEXT,
    "keyBenefits" TEXT,
    "painPoints" TEXT,
    "objections" TEXT,
    "positioningAngle" TEXT,
    "contentAngles" TEXT,
    "suggestedHooks" TEXT,
    "keywords" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "enrichmentReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "content_drafts" (
    "id" TEXT NOT NULL,
    "sourceOfferEnrichmentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "angle" TEXT,
    "callToAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "review_items" (
    "id" TEXT NOT NULL,
    "contentDraftId" TEXT NOT NULL,
    "reviewStatus" "ReviewItemStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "revisionRequested" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public_offer_drafts" (
    "id" TEXT NOT NULL,
    "sourceContentDraftId" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT,
    "summary" TEXT,
    "heroCopy" TEXT,
    "benefits" JSONB,
    "faq" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "status" "PublicOfferDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_offer_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public_offers" (
    "id" TEXT NOT NULL,
    "sourcePublicOfferDraftId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "content_revisions" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "operation_receipts" (
    "key" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_receipts_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "legacy_mappings" (
    "id" TEXT NOT NULL,
    "legacyType" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_enrichments_sourceProductDraftId_idx" ON "offer_enrichments"("sourceProductDraftId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_enrichments_status_idx" ON "offer_enrichments"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "content_drafts_idempotencyKey_key" ON "content_drafts"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "content_drafts_sourceOfferEnrichmentId_idx" ON "content_drafts"("sourceOfferEnrichmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "content_drafts_status_idx" ON "content_drafts"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "review_items_reviewStatus_idx" ON "review_items"("reviewStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "review_items_contentDraftId_idx" ON "review_items"("contentDraftId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "review_items_createdAt_idx" ON "review_items"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "public_offer_drafts_sourceContentDraftId_key" ON "public_offer_drafts"("sourceContentDraftId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "public_offer_drafts_slug_key" ON "public_offer_drafts"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "public_offer_drafts_status_idx" ON "public_offer_drafts"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "public_offer_drafts_sourceContentDraftId_idx" ON "public_offer_drafts"("sourceContentDraftId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "public_offers_sourcePublicOfferDraftId_key" ON "public_offers"("sourcePublicOfferDraftId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "public_offers_slug_key" ON "public_offers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "content_revisions_entityType_entityId_version_key" ON "content_revisions"("entityType", "entityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_mappings_legacyType_legacyId_key" ON "legacy_mappings"("legacyType", "legacyId");

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_sourceOfferEnrichmentId_fkey" FOREIGN KEY ("sourceOfferEnrichmentId") REFERENCES "offer_enrichments"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "review_items" ADD CONSTRAINT "review_items_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "public_offer_drafts" ADD CONSTRAINT "public_offer_drafts_sourceContentDraftId_fkey" FOREIGN KEY ("sourceContentDraftId") REFERENCES "content_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "public_offers" ADD CONSTRAINT "public_offers_sourcePublicOfferDraftId_fkey" FOREIGN KEY ("sourcePublicOfferDraftId") REFERENCES "public_offer_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;


COMMIT;
