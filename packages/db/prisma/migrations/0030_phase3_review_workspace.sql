-- Migration: Phase 3 - Content Review Workspace
-- Adds ReviewItem model for content review workspace

BEGIN;

-- Create content_drafts table (Phase 2)
CREATE TABLE IF NOT EXISTS content_drafts (
  id VARCHAR(26) PRIMARY KEY DEFAULT cuid(),
  source_offer_enrichment_id VARCHAR(26) NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  title VARCHAR(500),
  body TEXT,
  angle VARCHAR(500),
  call_to_action VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  idempotency_key VARCHAR(128) UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_drafts_source_offer_enrichment_id ON content_drafts(source_offer_enrichment_id);
CREATE INDEX IF NOT EXISTS idx_content_drafts_status ON content_drafts(status);

-- Create offer_enrichments table (Phase 2)
CREATE TABLE IF NOT EXISTS offer_enrichments (
  id VARCHAR(26) PRIMARY KEY DEFAULT cuid(),
  source_product_draft_id VARCHAR(26) NOT NULL,
  offer_title VARCHAR(500),
  target_audience TEXT,
  key_benefits TEXT,
  pain_points TEXT,
  objections TEXT,
  positioning_angle VARCHAR(1000),
  content_angles TEXT,
  suggested_hooks TEXT,
  keywords TEXT,
  confidence_score DOUBLE PRECISION,
  enrichment_reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_enrichments_source_product_draft_id ON offer_enrichments(source_product_draft_id);
CREATE INDEX IF NOT EXISTS idx_offer_enrichments_status ON offer_enrichments(status);

-- Add FK to content_drafts after offer_enrichments exists
ALTER TABLE content_drafts ADD CONSTRAINT fk_content_drafts_source_offer_enrichment
  FOREIGN KEY (source_offer_enrichment_id) REFERENCES offer_enrichments(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Create review_items table
CREATE TABLE IF NOT EXISTS review_items (
  id VARCHAR(26) PRIMARY KEY DEFAULT cuid(),
  content_draft_id VARCHAR(26) NOT NULL,
  review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  review_notes TEXT,
  revision_requested BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Indexes for filtering and lookup
CREATE INDEX IF NOT EXISTS idx_review_items_status ON review_items(review_status);
CREATE INDEX IF NOT EXISTS idx_review_items_content_draft_id ON review_items(content_draft_id);
CREATE INDEX IF NOT EXISTS idx_review_items_created_at ON review_items(created_at DESC);

-- FK to content_drafts
ALTER TABLE review_items ADD CONSTRAINT fk_review_items_content_draft
  FOREIGN KEY (content_draft_id) REFERENCES content_drafts(id) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;