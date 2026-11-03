-- Additive only (Task 3 / international_offers).
--
-- Adds: MarketplaceCode/Offer* enums, marketplace_listings, purchase_offers,
-- offer_price_observations, offer_delivery_evidence, fx_snapshots, legacy_price_mappings,
-- the optional stores.marketplaceCode/nameAr/nameEn/trackingId columns, and the structured
-- coupon-condition columns on coupons (Task 9; folded into this migration because nothing
-- has been applied to a real database yet, so the feature keeps one migration).
--
-- Guarantees this migration keeps:
--   * no DROP of any historical table, column, index or constraint;
--   * the coupon amount is widened losslessly from DECIMAL(10,2) to DECIMAL(20,6),
--     matching the accepted contract; no UPDATE/backfill runs anywhere:
--     a stored amount is never relabelled (an SAR amount stays SAR; nothing is re-tagged as USD)
--     and an existing coupon row keeps couponCurrency NULL, which means "currency unknown";
--   * no row is written, so legacy readers keep working unchanged while the feature is off;
--   * no source observations are written by this migration; current source policies are
--     enabled:false (T1), while listing/offer metadata still follows catalog authorization;
--   * offer_delivery_evidence exists but no current source produces rows;
--     deliveryMaxAgeSeconds is null, so expiresAt is mandatory when the first writer arrives.
--
-- Rollback is disabling the feature (no writer, no public reader), not a down migration:
-- dropping these tables would destroy any observations written after the cutover.
--
-- Applied to fresh/create-only tables, so re-running on databases that already carry some
-- of the objects is safe. That compatibility is only exercised against the local baseline
-- reconstruction described in docs/operations/international-migration.md.

BEGIN;

-- CreateEnum (PostgreSQL has no CREATE TYPE IF NOT EXISTS)
DO $$ BEGIN CREATE TYPE "MarketplaceCode" AS ENUM ('SA', 'US'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OfferCondition" AS ENUM ('NEW', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_ACCEPTABLE', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OfferAudience" AS ENUM ('PUBLIC', 'MEMBERS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OfferPriceAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OfferTaxBasis" AS ENUM ('INCLUDED', 'EXCLUDED', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DeliveryCountryCode" AS ENUM ('SA', 'US'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OfferDeliveryPrecision" AS ENUM ('COUNTRY', 'POSTAL_SAMPLE', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OfferDeliveryState" AS ENUM ('OBSERVED_AVAILABLE', 'OBSERVED_UNAVAILABLE', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable: optional marketplace identity for stores. Left NULL ("legacy/unknown"); the
-- migration never derives a marketplace, Arabic/English name or tracking id from existing data.
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "marketplaceCode" "MarketplaceCode",
  ADD COLUMN IF NOT EXISTS "nameAr" TEXT,
  ADD COLUMN IF NOT EXISTS "nameEn" TEXT,
  ADD COLUMN IF NOT EXISTS "trackingId" TEXT;

CREATE INDEX IF NOT EXISTS "stores_marketplaceCode_idx" ON "stores"("marketplaceCode");

-- AlterTable: structured coupon conditions (Task 9). No DROP or UPDATE/backfill.
-- The existing discount amount is widened below; legacy values retain their exact meaning:
--   * couponCurrency stays NULL on legacy rows (currency unknown), never filled with SAR;
--   * maximumDiscountAmount is ADDed nullable with no default and no UPDATE, so every existing
--     row keeps NULL (no ceiling claimed); its currency is couponCurrency, never a second column;
--   * eligibleCountries defaults to the empty array, never NULL: [] means "unspecified";
--   * audience defaults to 'PUBLIC' only for rows inserted after this migration, so a legacy
--     coupon whose audience was never recorded keeps NULL rather than a guessed value.
ALTER TABLE "coupons"
  ADD COLUMN IF NOT EXISTS "couponCurrency" TEXT,
  ADD COLUMN IF NOT EXISTS "minimumSpendAmount" DECIMAL(20,6),
  ADD COLUMN IF NOT EXISTS "minimumSpendCurrency" TEXT,
  ADD COLUMN IF NOT EXISTS "maximumDiscountAmount" DECIMAL(20,6),
  ADD COLUMN IF NOT EXISTS "eligibleCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "audience" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "couponValidUntil" TIMESTAMP(3);

-- Setting the default separately leaves every pre-existing coupon audience NULL.
ALTER TABLE "coupons" ALTER COLUMN "audience" SET DEFAULT 'PUBLIC';
-- Widening retains every old value exactly and accepts the Money contract without rounding.
ALTER TABLE "coupons" ALTER COLUMN "discountAmount" TYPE DECIMAL(20,6);

CREATE INDEX IF NOT EXISTS "coupons_status_couponValidUntil_idx" ON "coupons"("status", "couponValidUntil");

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_listings" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "marketplaceCode" "MarketplaceCode" NOT NULL,
    "asin" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "purchase_offers" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sellerKey" TEXT NOT NULL,
    "fulfillerKey" TEXT,
    "condition" "OfferCondition" NOT NULL DEFAULT 'UNKNOWN',
    "audience" "OfferAudience" NOT NULL DEFAULT 'PUBLIC',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "offer_price_observations" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "shipTo" "DeliveryCountryCode",
    "amount" DECIMAL(20,6),
    "currency" TEXT,
    "originalAmount" DECIMAL(20,6),
    "audience" "OfferAudience" NOT NULL DEFAULT 'PUBLIC',
    "availability" "OfferPriceAvailability" NOT NULL DEFAULT 'UNKNOWN',
    "taxBasis" "OfferTaxBasis" NOT NULL DEFAULT 'UNKNOWN',
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "offer_delivery_evidence" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "country" "DeliveryCountryCode" NOT NULL,
    "precision" "OfferDeliveryPrecision" NOT NULL DEFAULT 'UNKNOWN',
    "state" "OfferDeliveryState" NOT NULL DEFAULT 'UNKNOWN',
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_delivery_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fx_snapshots" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "rates" JSONB NOT NULL,
    "sourceId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_listings_productId_idx" ON "marketplace_listings"("productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_listings_storeId_marketplaceCode_idx" ON "marketplace_listings"("storeId", "marketplaceCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_listings_identityKey_key" ON "marketplace_listings"("identityKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_offers_listingId_idx" ON "purchase_offers"("listingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_offers_listingId_version_idx" ON "purchase_offers"("listingId", "version");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_offers_identityKey_key" ON "purchase_offers"("identityKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_price_observations_offerId_scopeKey_checkedAt_idx" ON "offer_price_observations"("offerId", "scopeKey", "checkedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_price_observations_expiresAt_idx" ON "offer_price_observations"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "offer_price_observations_identityKey_key" ON "offer_price_observations"("identityKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_delivery_evidence_offerId_country_checkedAt_idx" ON "offer_delivery_evidence"("offerId", "country", "checkedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_delivery_evidence_expiresAt_idx" ON "offer_delivery_evidence"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "offer_delivery_evidence_identityKey_key" ON "offer_delivery_evidence"("identityKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fx_snapshots_base_asOf_idx" ON "fx_snapshots"("base", "asOf");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fx_snapshots_expiresAt_idx" ON "fx_snapshots"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fx_snapshots_identityKey_key" ON "fx_snapshots"("identityKey");

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "purchase_offers" ADD CONSTRAINT "purchase_offers_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "offer_price_observations" ADD CONSTRAINT "offer_price_observations_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "purchase_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "offer_delivery_evidence" ADD CONSTRAINT "offer_delivery_evidence_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "purchase_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "legacy_price_mappings" (
    "id" TEXT NOT NULL,
    "productPriceId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "priceObservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_price_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_price_mappings_productPriceId_key" ON "legacy_price_mappings"("productPriceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legacy_price_mappings_offerId_idx" ON "legacy_price_mappings"("offerId");

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "legacy_price_mappings" ADD CONSTRAINT "legacy_price_mappings_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "purchase_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
