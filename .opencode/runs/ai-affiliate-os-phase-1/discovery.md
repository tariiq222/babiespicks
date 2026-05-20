# Discovery

## Git State

`git status --short` showed only Affiliate AI OS backend files, the existing Affiliate OS admin page, and web message files changed before documentation artifacts were added.

Modified files:

- `apps/api/src/features/affiliate-ai-os/__tests__/product-drafts.service.spec.ts`
- `apps/api/src/features/affiliate-ai-os/__tests__/trend-intelligence.service.spec.ts`
- `apps/api/src/features/affiliate-ai-os/affiliate-ai-os.module.ts`
- `apps/api/src/features/affiliate-ai-os/dto/product-drafts.dto.ts`
- `apps/api/src/features/affiliate-ai-os/dto/trend-intelligence.dto.ts`
- `apps/api/src/features/affiliate-ai-os/product-drafts.controller.ts`
- `apps/api/src/features/affiliate-ai-os/product-drafts.service.ts`
- `apps/api/src/features/affiliate-ai-os/trend-intelligence.service.ts`
- `apps/web/messages/ar.json`
- `apps/web/messages/en.json`
- `apps/web/src/app/[locale]/admin/affiliate-os/page.tsx`

Untracked implementation files:

- `apps/api/src/features/affiliate-ai-os/__tests__/product-drafts.controller.spec.ts`
- `apps/api/src/features/affiliate-ai-os/__tests__/trend-signals.controller.spec.ts`
- `apps/api/src/features/affiliate-ai-os/trend-signals.controller.ts`

`git diff --stat` for tracked files reported 11 files changed, 744 insertions, and 663 deletions before this documentation run.

## Behavior Summary

- `TrendSignalsController` exposes list/get/manual-create endpoints under `/admin/trend-signals` and never publishes.
- `TrendIntelligenceService` normalizes and deduplicates trend signals by canonical URL, normalized title, or source hash.
- `ProductDraftsController` exposes list/get/create-from-trend-signal/update/approve/reject/needs-edit/evaluate endpoints under `/admin/product-drafts`.
- Direct publish controller endpoint is absent.
- `ProductDraftsService.publishApprovedDraft` fails closed with `ConflictException`.
- Approval transitions write audit events and are idempotent by transition key.
- Draft evaluation creates or updates reviewable `ProductScore` records only.
- Dashboard shows trend signals, draft review actions, content approvals, social approvals, AI activity, and ops status.
- Dashboard copy says the operator only makes approval decisions; social approval schedules and does not publish immediately.

## Exclusions Confirmed

- No Prisma schema change was observed in the working diff.
- No admin/auth/proxy source paths were changed by this Phase 1 slice.
- Original main worktree and stash were not touched by this documentation run.
