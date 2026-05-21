# Discovery

## Git State

Branch: `feat/ai-affiliate-os-offer-pipeline`, ahead 3 of `origin/main`.
Untracked run directory created only. No source files modified by this discovery run.

## Existing Models, Services, and Controllers Inspected

### 1. Prisma Schema — Models Found

| Model | Status | Key Fields / Notes |
|---|---|---|
| `TrendSignal` | Exists, Phase 1 uses | source, canonicalUrl, normalizedTitle, sourceHash, trendScore, status |
| `ProductDraft` | Exists, Phase 1 uses | trendSignalId, title, status, approvedBy, approvedAt, rejectedBy, etc. |
| `ProductScore` | Exists, Phase 1 uses | productDraftId, aiRunId, scores, reasoning, riskFlags, status |
| `ApprovalAuditEvent` | Exists, reused by Phase 1 | actorType, actorId, action, entityType, entityId, reason, metadata |
| `ArticleDraft` | Exists, **NOT used by Phase 1** | contentPageId?, aiRunId?, locale, type, title, slug, outline, content, productIds[], seo, status (DRAFT/NEEDS_REVIEW/APPROVED/REJECTED/SCHEDULED/PUBLISHED) |
| `SocialPost` | Exists, **NOT used by Phase 1** | contentPageId?, productId, status (DRAFT/PENDING_APPROVAL/APPROVED/SCHEDULED/PUBLISHING/PUBLISHED/REJECTED), platform, format, content, scheduledAt, publishedAt |
| `AiRun` | Exists | name, type (PRODUCT_PIPELINE/CONTENT_PIPELINE/DISCOVERY/CONTENT_SPRINT/MANUAL), status, input, output |
| `AiEvent` | Exists | aiRunId, type (INFO/WARNING/ERROR/APPROVAL_REQUIRED/CHECKPOINT/QUEUED/STARTED/COMPLETED), message, metadata |
| `ContentPage` | Exists | type, slug, status (DRAFT/SEO_CHECK/QUALITY_CHECK/PENDING_APPROVAL/APPROVED/SCHEDULED/PUBLISHED/REVISION_REQUESTED/REJECTED), isPublished, scheduledAt, publishedAt |

### 2. Existing Services and Controllers

| Path | Role | Relevance to Phase 2 |
|---|---|---|
| `apps/api/src/features/affiliate-ai-os/product-drafts.service.ts` | Phase 1 core | Reuse for approved-draft sourcing |
| `apps/api/src/features/content/article-pipeline.service.ts` | Article draft CRUD + approve/reject/revise/publish | **Critical existing pattern** — already supports `sourceProductDraftIds` |
| `apps/api/src/features/content/content.module.ts` | Exports `ArticlePipelineService` | Can be imported by new Affiliate AI OS controller |
| `apps/api/src/features/admin/approval.controller.ts` | ContentPage approvals + publish/schedule/revise/reject | **Conflict risk**: approve publishes immediately; schedule sets SCHEDULED |
| `apps/api/src/features/admin/social-approval.controller.ts` | SocialPost approvals + auto-schedule on approve | **Conflict risk**: approve auto-schedules to Riyadh-time slots |
| `apps/api/src/features/ai-os/ai-os.controller.ts` | AiRun list/get/create/cancel/enqueue | Reuse for AI run orchestration |
| `apps/web/src/app/[locale]/admin/affiliate-os/page.tsx` | Dashboard UI | Extend with new draft review sections |

### 3. Existing Pattern Decision: Reuse vs Create-New

#### REUSE — Low Risk
- **`ApprovalAuditEvent`** — Already supports `ARTICLE_DRAFT`, `SOCIAL_POST`, `PRODUCT_DRAFT`, `CONTENT_PAGE` entity types. The `recordApprovalAuditEvent()` helper is already imported and used by Phase 1.
- **`AiRun`** — Already has `CONTENT_PIPELINE` and `CONTENT_SPRINT` run types. Can be reused to track AI-generated content draft runs.
- **`AiEvent`** — Standard event log tied to `AiRun`. Reuse for content-generation step events.
- **`ProductDraft`** — Phase 1 already uses this. Phase 2 will read `APPROVED` product drafts as source material.

#### REUSE WITH MODIFICATION — Medium Risk
- **`ArticleDraft`** — Model exists and `ArticlePipelineService` already supports:
  - `createArticleDraft(input)` with `sourceProductDraftIds`
  - `approveArticleDraft(id)`, `rejectArticleDraft(id)`, `requestArticleDraftRevision(id)`
  - `publishArticleDraft(id)` which creates a `ContentPage`
  
  **Decision: REUSE model and service, but create a NEW controller that does NOT expose the publish step.** The existing service methods for create/approve/reject/revise are safe for Phase 2. The publish method must remain unexposed until a later phase.

#### DO NOT REUSE — High Conflict
- **`SocialPost`** — The existing `SocialApprovalController.approve()` **automatically schedules** the post to a Riyadh-safe time slot. This directly violates the Phase 2 "no scheduling" rule. Reusing `SocialPost` for draft approval would require disabling or bypassing the existing social approval controller, which risks breaking existing behavior.
  
  **Decision: BLOCK social post draft creation in Phase 2** unless either:
  1. A new `SocialPostDraft` model is created (schema change, out of scope for this discovery), OR
  2. The existing social approval controller is modified to support a non-scheduling approval mode (risky, touches existing production flow).

- **`ContentPage`** — The existing `ApprovalController` immediately publishes or schedules `ContentPage` records on approval. Phase 2 stops at approved drafts, not published pages. Do not route Phase 2 content drafts through the existing content approval controller.

### 4. Dashboard Inspection

The existing dashboard (`apps/web/src/app/[locale]/admin/affiliate-os/page.tsx`) already displays:
- Trend signals table
- Product drafts table with approve/needs-edit/reject
- Content approvals table (from `/admin/approvals` — `ContentPage` based)
- Social posts table (from `/admin/approvals/social` — `SocialPost` based)
- AI activity table (from `/admin/ai-os/runs`)
- Ops status panel

Phase 2 should add:
- **Article drafts table** (new data source) showing drafts created from approved product drafts
- Article draft approval actions: approve, reject, request revision
- No publish or schedule actions

### 5. Tests Inspection

Existing tests in `apps/api/src/features/affiliate-ai-os/__tests__/`:
- `product-drafts.service.spec.ts` — 278 lines, covers list, transition, create-from-signal, evaluation
- `product-drafts.controller.spec.ts` — covers controller routing
- `trend-intelligence.service.spec.ts` — covers trend signal logic
- `trend-signals.controller.spec.ts` — covers trend signal routing

No existing tests for `ArticlePipelineService` were found in `features/content/__tests__/` (directory exists but contents not inspected; timebox priority is on Phase 2 planning, not full test audit).

### 6. Schema Additive Assessment

**No schema changes are required for article draft reuse.** The `ArticleDraft` model already has:
- `sourceProductDraftIds` is NOT a native field; the existing service accepts it as `input.sourceProductDraftIds` but stores it via the `productIds` array field. This is a semantic mismatch that should be clarified.

Wait — re-reading `article-pipeline.service.ts` lines 149 and 138: the service validates `sourceProductDraftIds` but stores them in `productIds`. There is no dedicated `sourceProductDraftIds` column in the schema. This means the link between an article draft and its source product drafts is **lossy** (stored in the same array as linked products). This is acceptable for Phase 2 if the semantics are documented, but it is a potential source of confusion.

## Implementation Recommendation

**PROCEED for Article Drafts, BLOCK Social Drafts in Phase 2.**

Recommended Phase 2 scope:
1. Add `ArticleDraftsController` under `admin/article-drafts` (or within `affiliate-ai-os`) that uses `ArticlePipelineService` for create/approve/reject/revise.
2. Ensure the controller NEVER calls `publishArticleDraft()`.
3. Extend the Affiliate AI OS dashboard with an article drafts review table.
4. Use `AiRun` + `AiEvent` to track AI content generation for drafts.
5. Leave social post draft creation for Phase 3+ when scheduling semantics are resolved.

## BLOCKED Section

Phase 2 is **PARTIALLY BLOCKED** pending answers to the following questions:

1. **Product Draft → Article Draft Link Semantics**
   The existing `ArticlePipelineService` stores `sourceProductDraftIds` in the `productIds` array field. There is no separate column. Is this lossy mapping acceptable, or should Phase 2 add a `sourceProductDraftIds` Json field to `ArticleDraft`?

2. **Social Post Drafts — Include or Defer?**
   The existing `SocialPost` approval flow auto-schedules on approval, violating the Phase 2 "no scheduling" rule. Should Phase 2:
   - (a) Skip social post drafts entirely and defer to Phase 3?
   - (b) Add a new `SocialPostDraft` model (requires schema change)?
   - (c) Modify the existing `SocialApprovalController` to support a non-scheduling approval mode (touches existing production flow)?

3. **Dashboard Integration Scope**
   Should the Affiliate AI OS dashboard replace the existing ContentPage/SocialPost approval sections, or should ArticleDraft approvals be shown **in addition to** the existing sections? If replacing, how do we avoid confusing operators who currently use the content/social approval flows?

4. **Article Draft Slug Uniqueness**
   `ArticleDraft` has a `@@unique([locale, slug])` constraint. If multiple article drafts are generated from the same approved product draft (e.g., one per locale), how should slugs be generated to avoid collisions?

## Stop Conditions Assessment

| Stop Condition | Status | Notes |
|---|---|---|
| Existing models conflict | **TRIGGERED** | `SocialPost` auto-schedule conflicts with no-scheduling rule |
| Semantics unclear | **TRIGGERED** | `sourceProductDraftIds` stored in `productIds` is semantically lossy |
| Schema change required for safety | **NOT TRIGGERED** | ArticleDraft reuse needs no schema change; social drafts do |
| Auth/payment/analytics creep | **CLEARED** | No auth, payment, or analytics changes planned |
| Public output creep | **CLEARED** | No public routes or publishing planned |

## Resolution (Post-Implementation Update)

All four BLOCKED questions from discovery were resolved via the ArticleDraft-only scope decision:

### 1. Product Draft → Article Draft Link Semantics — RESOLVED

**Decision:** Accept the lossy `productIds` mapping. The `sourceProductDraftId` from the enrichment input is stored in `ArticleDraft.productIds` (as a single-element array). This is a **semantic compromise** — no dedicated `sourceProductDraftId` column exists.

**Future TODO:** Add a `sourceProductDraftId Json` column to `ArticleDraft` in a future phase for a non-lossy, first-class link.

**Implementation:** `ContentDraftsService.createDraft()` stores `enrichmentInput.sourceProductDraftId` in `ArticleDraft.productIds`. The `isPhase2Draft()` guard uses `outline.sourceOfferEnrichmentId` to identify Phase 2 drafts.

### 2. Social Post Drafts — RESOLVED (Deferred to Phase 3)

**Decision:** Option (a) — skip social post drafts entirely, defer to Phase 3. The existing `SocialApprovalController` auto-schedules on approval, which violates the Phase 2 no-scheduling rule. A new `SocialPostDraft` model or non-scheduling approval mode can be explored in Phase 3.

**Implementation:** `SocialPost` and `SocialApprovalController` are not touched. `ContentDraftsController` only supports `article` content type.

### 3. Dashboard Integration Scope — RESOLVED (Added In Addition)

**Decision:** Phase 2 article draft panels are shown **in addition to** the existing ContentPage and SocialPost approval sections. Operators continue using existing approval flows unaffected.

**Implementation:** Three new panels added to the dashboard: "Ready for Enrichment", "Offer Enrichments", "Article Drafts / Content Queue". No existing panels removed or replaced.

### 4. Article Draft Slug Uniqueness — RESOLVED

**Decision:** Deterministic slug from title with a numeric suffix on collision. Simple, reversible, and ensures `@@unique([locale, slug])` compliance.

**Implementation:** `ContentDraftsService.generateSlug()` runs a `while (true)` loop checking `articleDraft.findUnique({ where: { locale_slug } })` and appends `-2`, `-3`, etc. on collision. Maximum 100 characters.

## Exclusions Confirmed

- No Prisma schema change in this discovery run.
- No admin/auth/proxy source paths changed.
- Original main worktree and stash not touched.
- No publishing, scheduling, analytics, or public output endpoints planned.
