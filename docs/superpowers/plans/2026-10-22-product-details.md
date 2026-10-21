# Product details implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. User approved execution; do not request another plan approval.

**Goal:** Clear bilingual product details with distinct sourced ratings, a genuine gallery and consistent square product imagery.
**Architecture:** Extend the existing product MCP contract with an optional gallery, retain cover compatibility, project verified display sources and use focused presentation components.
**Tech Stack:** Next16, React19, Prisma6/PostgreSQL16, Hono MCP, Vitest.
**Spec:** docs/superpowers/specs/2026-10-22-product-details-design.md

## Global constraints
- Preserve live content and concurrent Grok writes; no fabricated photos/ratings or tests that mutate production.
- Existing owner grants, version checks, revision and idempotency contracts remain mandatory.
- Additive migration; rollback app while retaining the new column; no destructive down migration.
- Keep retired routes, pricing freshness, affiliate redirects and current visual foundations.

## Review focus
- Unpublished assessments and missing/misidentified Amazon provenance must not become public claims.
- Tall/wide/broken images and one-photo galleries must remain usable at mobile width.
- A partial MCP edit must not clear existing gallery, cover or source data.
- Legacy descriptions must retain factual text without leaking raw purchase links or HTML.
- Existing products and schema-compatible old deployments must survive the additive migration.

### Task 1: Gallery and public display contract
Files: packages/db/prisma/schema.prisma and new migration; packages/domain/src/contracts.ts,index.ts and contract/integration tests; apps/web/src/shared/lib/api.ts; apps/web/src/server/public-queries.ts and tests.
Interfaces: optional imageUrls:string[] (0..12); public imageUrls:string[]; public sources:{url,field,checkedAt}[]; reviewSummary analyzedAt for source-date fallback, no new invented source labels.
- [x] Add failing contract tests for gallery validation and public projection.
- [x] Add migration and persistence in existing versioned transactions, preserving omitted values.
- [x] Generate client and verify tests against isolated PostgreSQL including gallery create/update/omitted update and publication boundary.

### Task 2: Consistent image and organized product page
Files: new shared product-gallery.tsx, product-details.ts and tests; product-image.tsx; products/[slug]/page.tsx and focused render tests; AGENTS.md scope wording and docs/operations/product-content.md.
Interfaces: getProductImages merges valid cover/gallery; rating source checks explicit reviewSummary source hostname; safe description normalization uses known legacy labels and strips only purchase-link labels/URLs.
- [x] Add failing display tests: ratings separated, missing provenance, image dedupe, complete legacy text and raw URL removal.
- [x] Build contained square image frame, keyboard-accessible thumbnail gallery, independent rating panels, readable description, pros/cons, specs and source dates.
- [x] Verify AR/EN, one/many/missing/broken photos, 390px and desktop, no overflow and clear purchase links.

### Task 3: Source verification, review and authorized delivery
- [x] Verify additional real images for the exact product; never infer image IDs or duplicate the cover to claim a gallery.
- [x] Run full tests/type-check/lint/build and focused browser acceptance; use one fresh GPT6.1 Sol reviewer of the actual diff.
- [ ] Back up and restore-check project DB before schema deployment, commit/push via existing GitHub/OpenShip authorization, verify exact deployed commit and public health.
- [ ] If verified content enrichment is possible, use owner-authorized domain mutation with fresh expectedVersion and idempotency key, retaining existing sources and metadata. Revalidate caches, verify production page and gallery.
- [ ] Record remaining gaps honestly; clean temporary probes and preserve deliverables and recovery evidence.
