# Request

Create the required Phase 2 discovery and planning artifacts for the AI Affiliate OS implementation in `/Users/tariq/code/ai-affiliate-os`.

## Constraints

- Only create files under `.opencode/runs/ai-affiliate-os-phase-2/`.
- Do not edit app source, package files, env, migrations, admin/auth/proxy, original main worktree, stash, or git history.
- Do not plan or implement publishing, scheduling, analytics, public output, or auth changes.
- Database schema may be touched only later if additive and no conflicts/data-loss risk.
- Discovery must stop if existing models conflict or semantics are unclear.

## Worktree context

- Branch: `feat/ai-affiliate-os-offer-pipeline`
- Base: `6907928 feat: add AI Affiliate OS offer pipeline`
- Phase 1 baseline is in place with TrendSignal, ProductDraft, ProductScore, and approval-audit infrastructure.
- Main branch stash was not touched.

## Phase 2 Scope (from Scope Lock)

Implement Phase 2 of AI Affiliate OS, stopping at human-approved content drafts with no publishing, scheduling, analytics, public output, or auth changes.

## Required artifacts

- `request.md` (this file)
- `discovery.md`
- `impacted-files.json`
- `risk-scorecard.json`
- `dag-plan.json`
- `rollback-plan.md`

## Validation

- `git diff --check` on the run artifact directory only.
- No source-code changes.
