# Phase 2 — Offer Enrichment & Content Drafts

> **Status:** Implemented (ArticleDraft-only scope)
> **Branch:** `feat/ai-affiliate-os-offer-pipeline`
> **Last Updated:** 2026-05-21

---

## Overview

Phase 2 builds on the Phase 1 offer pipeline by adding two sequential steps:

1. **Offer Enrichment** — enrich an approved ProductDraft with AI-generated offer metadata (title, audience, benefits, angles, hooks, keywords).
2. **Content Draft** — create a human-reviewable content draft from a completed offer enrichment.

The pipeline stops at human-approved content drafts. **No publishing, scheduling, or public output occurs in Phase 2.**

---

## Scope

### In Scope

- Create offer enrichments from `APPROVED` ProductDrafts
- Store offer enrichment data as `AiRun` JSON (type: `CONTENT_PIPELINE`, status: `COMPLETED`)
- Create article content drafts from completed offer enrichments
- Reuse the existing `ArticleDraft` model as the content draft entity
- Human approval/rejection of content drafts (approve/reject transitions only)
- Dashboard panels: Ready for Enrichment, Offer Enrichments, Article Drafts / Content Queue
- Arabic and English UI translations for all new labels and messages
- Append-only audit events via `ApprovalAuditEvent` for all draft transitions

### Out of Scope

- **Social post drafts** — deferred to Phase 3. The existing `SocialPost` approval flow auto-schedules on approval, which violates the Phase 2 no-scheduling rule.
- **ContentPage reuse** — Phase 2 content drafts do not create or route through `ContentPage` records.
- **Publishing** — no endpoint exposes `ArticlePipelineService.publishArticleDraft()`; approved drafts remain in `APPROVED` status.
- **Scheduling** — no scheduling semantics are introduced in Phase 2.
- **Email / ad_copy content types** — only `article` is supported in Phase 2. Other content types (`social_post`, `email`, `ad_copy`) are rejected at creation time with a deferred message.
- **Schema changes** — no Prisma migrations required.

---

## Data Flow

```
APPROVED ProductDraft
        │
        ▼
POST /admin/affiliate-ai-os/offer-enrichments
  → OfferEnrichmentsService.createEnrichment()
  → Creates AiRun (CONTENT_PIPELINE / COMPLETED)
  → Enrichment persisted in AiRun.input + AiRun.output JSON
        │
        ▼
GET /admin/affiliate-ai-os/offer-enrichments
  → Lists all offer enrichments (filterable by sourceProductDraftId, status)
        │
        ▼
POST /admin/affiliate-ai-os/content-drafts
  → ContentDraftsService.createDraft()
  → Reads AiRun output JSON
  → Creates ArticleDraft (NEEDS_REVIEW)
  → sourceOfferEnrichmentId stored in outline JSON (not a dedicated column)
  → sourceProductDraftId stored in ArticleDraft.productIds (semantic compromise — see Known Limitations)
  → Slug generated deterministically from title with numeric suffix if collision
        │
        ▼
GET /admin/affiliate-ai-os/content-drafts
  → Lists content drafts (filterable by status, type)
  → Only returns drafts where outline.sourceOfferEnrichmentId is set (Phase 2 guard)
        │
        ▼
POST /admin/affiliate-ai-os/content-drafts/:id/approve
  → ContentDraftsService.approveDraft()
  → Transitions ArticleDraft NEEDS_REVIEW → APPROVED
  → Records ApprovalAuditEvent (ARTICLE_DRAFT, APPROVED)
  → No publish, no schedule
        │
        ▼
POST /admin/affiliate-ai-os/content-drafts/:id/reject
  → ContentDraftsService.rejectDraft()
  → Transitions ArticleDraft NEEDS_REVIEW → REJECTED
  → Records ApprovalAuditEvent (ARTICLE_DRAFT, REJECTED)
```

---

## Backend APIs

### Offer Enrichments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/affiliate-ai-os/offer-enrichments` | List offer enrichments (filter: `sourceProductDraftId`, `status`, `limit`, `offset`) |
| `POST` | `/admin/affiliate-ai-os/offer-enrichments` | Create enrichment for an APPROVED ProductDraft |
| `GET` | `/admin/affiliate-ai-os/offer-enrichments/:id` | Get single enrichment |
| `PATCH` | `/admin/affiliate-ai-os/offer-enrichments/:id` | Update enrichment fields |

**Create Enrichment Request Body:**
```ts
{
  sourceProductDraftId: string;        // required — must be APPROVED
  offerTitle: string;                 // required
  enrichmentReason?: string;
  targetAudience?: string[];
  keyBenefits?: string[];
  painPoints?: string[];
  objections?: string[];
  positioningAngle?: string;
  contentAngles?: string[];
  suggestedHooks?: string[];
  keywords?: string[];
  confidenceScore?: number;            // 0–10
  status?: 'READY' | 'NEEDS_REVIEW' | 'REJECTED';
}
```

**Enrichment Response Shape:**
```ts
{
  id: string;
  name: string;
  type: string;
  aiRunStatus: string;
  enrichmentReason?: string;
  offerTitle: string;
  targetAudience?: string[];
  keyBenefits?: string[];
  painPoints?: string[];
  positioningAngle?: string;
  contentAngles?: string[];
  suggestedHooks?: string[];
  keywords?: string[];
  confidenceScore?: number;
  status: 'READY' | 'NEEDS_REVIEW' | 'REJECTED';
  sourceProductDraftId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Content Drafts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/affiliate-ai-os/content-drafts` | List content drafts (filter: `status`, `type`, `limit`, `offset`) |
| `POST` | `/admin/affiliate-ai-os/content-drafts` | Create draft from an offer enrichment |
| `GET` | `/admin/affiliate-ai-os/content-drafts/:id` | Get single draft |
| `PATCH` | `/admin/affiliate-ai-os/content-drafts/:id` | Update editable draft fields |
| `POST` | `/admin/affiliate-ai-os/content-drafts/:id/approve` | Approve draft (NEEDS_REVIEW → APPROVED) |
| `POST` | `/admin/affiliate-ai-os/content-drafts/:id/reject` | Reject draft (NEEDS_REVIEW → REJECTED) |

**Create Draft Request Body:**
```ts
{
  sourceOfferEnrichmentId: string;    // required — AiRun ID of the enrichment
  title: string;                      // required
  body?: string;
  locale?: string;                    // default 'ar'
  type?: ContentType;                 // default 'BEST_LIST'
  contentType?: 'article';            // default 'article'; others are rejected as deferred
  angle?: string;
  callToAction?: string;
  rawData?: unknown;
}
```

**Draft Response Shape:**
```ts
{
  id: string;
  sourceOfferEnrichmentId: string;
  contentType: 'article';
  title: string;
  body: string;
  angle?: string;
  callToAction?: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  approvalStatus: string;
  readyForNextPhase: boolean;         // true when status === 'approved'
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**All endpoints are protected by `AdminApiKeyGuard`.**

---

## Dashboard Changes

Three new panels were added to the Affiliate OS dashboard (`apps/web/src/app/[locale]/admin/affiliate-os/page.tsx`):

### 1. Ready for Enrichment (Panel)
- Shows `APPROVED` ProductDrafts that have no existing offer enrichment yet
- "Generate Enrichment" action per row → calls `POST /admin/affiliate-ai-os/offer-enrichments`
- Caption: "Approved product drafts with generate enrichment action"

### 2. Offer Enrichments (Panel)
- Lists all offer enrichments from `GET /admin/affiliate-ai-os/offer-enrichments`
- Shows: Offer Title, Target Audience, Key Benefits, Positioning Angle, Confidence, Status
- "Generate Article Draft" action per row → calls `POST /admin/affiliate-ai-os/content-drafts`
- Caption: "Offer enrichments list with generate content draft action"

### 3. Article Drafts / Content Queue (Panel)
- Lists content drafts from `GET /admin/affiliate-ai-os/content-drafts`
- Shows: Title, Status, Angle, Call to Action, Creation date
- Approve and Reject actions per row
- **No publish or schedule actions** in this panel
- Caption: "Content drafts list with approve and reject actions only"

---

## Approval Rules

| Current Status | Can Approve? | Can Reject? | Can Update? |
|---|---|---|---|
| `NEEDS_REVIEW` | ✅ | ✅ | ✅ |
| `APPROVED` | ❌ | ❌ | ❌ |
| `REJECTED` | ❌ | ❌ | ❌ |
| `DRAFT` | ❌ | ❌ | ✅ (via PATCH) |
| `PUBLISHED` | ❌ | ❌ | ❌ |
| `SCHEDULED` | ❌ | ❌ | ❌ |

The `isPhase2Draft()` guard filters out any ArticleDraft records that do not have `sourceOfferEnrichmentId` in their outline, preventing Phase 1 or other legacy drafts from being managed through Phase 2 endpoints.

---

## No-Publishing Rule

**Critical:** No Phase 2 endpoint calls `ArticlePipelineService.publishArticleDraft()`.

The `ContentDraftsController` only exposes:
- `listDrafts` / `getDraft`
- `createDraft`
- `updateDraft`
- `approveDraft`
- `rejectDraft`

`publishArticleDraft()` is intentionally absent. Approved drafts remain in `APPROVED` status indefinitely. A future phase (Phase 3 or later) will add a publish/schedule step with explicit admin activation.

---

## Known Limitations

### sourceProductDraftId stored in productIds

The `ArticleDraft` model has no dedicated `sourceProductDraftId` column. Phase 2 stores the source product draft ID in `ArticleDraft.productIds` (a string array field). This is a **semantic compromise** — the array field is also used to link related products to the article content.

**Future TODO:** Add a `sourceProductDraftId` Json column to `ArticleDraft` for a non-lossy, first-class link.

### Deterministic slug with suffix

Slugs are generated from the title using `slugify()` (max 100 chars, alphanumeric + dash). If a slug collision occurs, a numeric suffix (`-2`, `-3`, etc.) is appended. This ensures uniqueness against the `@@unique([locale, slug])` constraint but does not guarantee human-readable slugs across multiple drafts of the same product.

---

## Out-of-Scope / Deferred to Phase 3

| Item | Reason |
|------|--------|
| Social post drafts | Existing `SocialApprovalController` auto-schedules on approval; would require schema change or controller modification |
| `ContentPage` integration | Phase 2 stops at approved drafts; publishing deferred |
| Email / ad_copy content types | Only `article` supported in Phase 2 |
| Scheduling | No Riyadh-time slot logic introduced |
| Analytics | Explicitly out of Scope Lock |

---

## Testing Instructions

### Backend Unit Tests

Four test files cover the Phase 2 services and controllers:

```bash
# Run all Phase 2 tests
pnpm --dir apps/api test src/features/affiliate-ai-os

# Run only offer-enrichments tests
pnpm --dir apps/api test src/features/affiliate-ai-os/offer-enrichments

# Run only content-drafts tests
pnpm --dir apps/api test src/features/affiliate-ai-os/content-drafts
```

> **Note:** Backend targeted tests (40 tests via `pnpm --dir apps/api test src/features/affiliate-ai-os`) have been run by the implementation subagent and passed. The final verification step (below) should be run by the test engineer before merge.

### Type Checks

```bash
# API type-check
pnpm --dir apps/api type-check

# Web type-check
pnpm --dir apps/web type-check
```

### Manual Verification Checklist

1. `POST /admin/affiliate-ai-os/offer-enrichments` with a non-APPROVED ProductDraft → should return `409 Conflict`
2. `POST /admin/affiliate-ai-os/content-drafts` with a non-article `contentType` → should return `409 Conflict` with deferred message
3. `POST /admin/affiliate-ai-os/content-drafts/:id/approve` → ArticleDraft transitions to `APPROVED`, `ApprovalAuditEvent` recorded, no `ContentPage` created
4. `POST /admin/affiliate-ai-os/content-drafts/:id/reject` → ArticleDraft transitions to `REJECTED`, `ApprovalAuditEvent` recorded
5. Dashboard: "Generate Enrichment" visible on approved product drafts without enrichments
6. Dashboard: "Generate Article Draft" visible on offer enrichment rows
7. Dashboard: Article Drafts panel shows approve/reject buttons, no publish/schedule buttons
8. Slug collision: creating two drafts with the same title → second draft gets `-2` suffix

---

## Phase 3 Candidates

1. **Social post drafts** — resolve scheduling conflict; either new `SocialPostDraft` model or non-scheduling approval mode
2. **Content publishing** — add `POST /admin/affiliate-ai-os/content-drafts/:id/publish` that calls `ArticlePipelineService.publishArticleDraft()`
3. **Scheduling** — add Riyadh-time slot scheduling for approved content
4. **Email / ad_copy content types** — extend `ContentDraftsService` to handle additional content types
5. **Dedicated `sourceProductDraftId` column** — add to `ArticleDraft` schema for non-lossy sourcing

---

## Files Changed

### Backend (API)

| File | Action |
|------|--------|
| `apps/api/src/features/affiliate-ai-os/phase-2.dto.ts` | **CREATE** — All Phase 2 DTOs in one file |
| `apps/api/src/features/affiliate-ai-os/offer-enrichments.service.ts` | **CREATE** — Enrichment CRUD via AiRun JSON |
| `apps/api/src/features/affiliate-ai-os/offer-enrichments.controller.ts` | **CREATE** — REST endpoints for enrichments |
| `apps/api/src/features/affiliate-ai-os/content-drafts.service.ts` | **CREATE** — Draft CRUD via ArticleDraft reuse |
| `apps/api/src/features/affiliate-ai-os/content-drafts.controller.ts` | **CREATE** — REST endpoints (no publish) |
| `apps/api/src/features/affiliate-ai-os/affiliate-ai-os.module.ts` | **MODIFY** — Register Phase 2 controllers and services |
| `apps/api/src/features/affiliate-ai-os/__tests__/offer-enrichments.service.spec.ts` | **CREATE** |
| `apps/api/src/features/affiliate-ai-os/__tests__/offer-enrichments.controller.spec.ts` | **CREATE** |
| `apps/api/src/features/affiliate-ai-os/__tests__/content-drafts.service.spec.ts` | **CREATE** |
| `apps/api/src/features/affiliate-ai-os/__tests__/content-drafts.controller.spec.ts` | **CREATE** |

### Frontend (Web)

| File | Action |
|------|--------|
| `apps/web/src/app/[locale]/admin/affiliate-os/page.tsx` | **MODIFY** — Three new dashboard panels |
| `apps/web/messages/ar.json` | **MODIFY** — Arabic translations for Phase 2 labels |
| `apps/web/messages/en.json` | **MODIFY** — English translations for Phase 2 labels |

### Documentation

| File | Action |
|------|--------|
| `docs/ai-affiliate-os/phase-2-offer-enrichment-content-drafts.md` | **CREATE** — This document |
