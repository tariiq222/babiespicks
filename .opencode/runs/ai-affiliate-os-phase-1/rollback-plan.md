# Rollback Plan

Rollback is a safe code rollback only.

## Required Action

- Revert the Phase 1 code and documentation changes from branch `feat/ai-affiliate-os-offer-pipeline` if needed.

## Migration Rollback

- No migration rollback is required.
- No Prisma schema change was part of this Phase 1 implementation.

## Safety Notes

- Approval-only state can remain in existing tables without public product publication.
- Direct draft publishing is disabled in code and has no exposed controller route.
- Original main worktree stash was not touched.
- Admin/auth/proxy areas are excluded from rollback scope for this phase.

## Verification After Rollback

- Confirm `/admin/trend-signals` and new `/admin/product-drafts` Phase 1 behaviors are absent or restored to pre-branch state.
- Confirm no public product records were created by Phase 1 approval actions.
- Re-run API and web type-checks for the rollback commit if source code is reverted.
