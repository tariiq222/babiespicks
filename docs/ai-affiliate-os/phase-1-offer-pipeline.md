# AI Affiliate OS Phase 1 Offer Pipeline

## Scope

Phase 1 adds an approval-only offer pipeline for Affiliate AI OS. It lets admins review trend signals, create product drafts from selected signals, edit draft metadata, evaluate draft quality/safety, and record approve/reject/needs-edit decisions.

Changed implementation is limited to the Affiliate AI OS backend slice and the existing Affiliate OS admin dashboard surface:

- Backend: `apps/api/src/features/affiliate-ai-os/**`
- Frontend: `apps/web/src/app/[locale]/admin/affiliate-os/page.tsx`
- Translations: `apps/web/messages/ar.json`, `apps/web/messages/en.json`

## Out Of Scope

- No public product creation.
- No direct publishing endpoint.
- No automated publish after approval.
- No Prisma schema or migration changes.
- No admin/auth/proxy changes.
- No changes to package files, env files, git history, original main worktree, or stash state.

## Data Model

- `TrendSignal`: source discovery item with normalized title, canonical URL, source hash, score, signal metadata, and review status.
- `ProductDraft`: review-only draft copied from a trend signal, with editable title/description/source/affiliate/category fields and status transitions.
- `ProductScore`: deterministic evaluation output for a draft, including overall/safety/affiliate/content scores, reasoning, risk flags, recommendation, status, and idempotency key.
- `ApprovalAuditEvent`: audit record for human approval, rejection, or revision request decisions.

Phase 1 uses the existing data model. No schema migration is required.

## API Endpoints

Trend signals are protected by `AdminApiKeyGuard`:

- `GET /admin/trend-signals`: list bounded trend signals with optional `status`, `limit`, and `offset`.
- `GET /admin/trend-signals/:id`: inspect one trend signal.
- `POST /admin/trend-signals`: manually create a trend signal; this never drafts or publishes.

Product drafts are protected by `AdminApiKeyGuard`:

- `GET /admin/product-drafts`: list bounded draft review queue with optional `status`, `limit`, and `offset`.
- `GET /admin/product-drafts/:id`: inspect one draft.
- `POST /admin/product-drafts/from-trend-signal`: create or reuse a draft from a trend signal.
- `PATCH /admin/product-drafts/:id`: edit allowed draft fields before final decision.
- `POST /admin/product-drafts/:id/approve`: record approval only.
- `POST /admin/product-drafts/:id/reject`: reject with optional reason.
- `POST /admin/product-drafts/:id/needs-edit`: return draft for edits with optional notes.
- `POST /admin/product-drafts/:id/evaluate`: create or refresh the draft score only.

There is no controller route for direct draft publishing. The service method `publishApprovedDraft` fails closed with `ConflictException`.

## Dashboard Pages And Sections

The existing admin Affiliate OS page now includes:

- Automation banner explaining that the operator only makes approval decisions.
- Stat cards for pending drafts, pending content, pending social posts, and total clicks.
- Trend signals table with create-draft action.
- Product drafts table with approve, needs-edit, and reject actions.
- Content approval section using the existing approval API.
- Social approval section where approval schedules posts instead of immediate publish.
- AI activity and ops status sections.

The dashboard fetches `GET /admin/trend-signals` and `GET /admin/product-drafts`, paginates drafts, and sends idempotency keys for draft decisions.

## Approval Flow

1. A trend signal is created manually or by upstream discovery.
2. Admin creates a product draft from a selected trend signal.
3. Draft may be edited while in `NEEDS_REVIEW` or `NEEDS_EDIT`.
4. Draft may be evaluated into a `ProductScore` for safety/content/affiliate review.
5. Admin chooses approve, reject, or needs-edit.
6. The transition records an approval audit event and idempotency key.
7. Approval sets the draft to `APPROVED`; it does not create or publish a public product.

## No Auto-Publishing Rule

Phase 1 is approval-queue only. Approval is not publishing. Direct publishing is disabled and fails closed until a later phase adds a separate explicit publish workflow.

Required invariant: no Phase 1 endpoint may create public products or publish public content from a product draft automatically.

## How To Test

Run these validations from `/Users/tariq/code/ai-affiliate-os`:

```bash
pnpm --dir apps/api prisma:generate
pnpm --dir apps/api test src/features/affiliate-ai-os
pnpm --dir apps/api type-check
pnpm --dir apps/web type-check
git diff --check -- docs/ai-affiliate-os/phase-1-offer-pipeline.md .opencode/runs/ai-affiliate-os-phase-1
```

Recorded Phase 1 validation results:

- `pnpm --dir apps/api prisma:generate` passed.
- `pnpm --dir apps/api test src/features/affiliate-ai-os` passed: 5 files, 21 tests.
- `pnpm --dir apps/api type-check` passed.
- `pnpm --dir apps/web type-check` passed.
- `git diff --check` passed.

## Next Phase Candidates

- Add explicit publish workflow with a separate endpoint, permission, audit trail, and release gate.
- Add richer trend discovery ingestion beyond manual signal creation.
- Add detailed draft editor UI for score/risk/reasoning review.
- Add analytics for approval-to-conversion performance.
- Add approval SLA reporting and queue assignment.
