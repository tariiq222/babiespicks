# Tests

Recorded validation results for Phase 1:

| Command | Result |
| --- | --- |
| `pnpm --dir apps/api prisma:generate` | Passed |
| `pnpm --dir apps/api test src/features/affiliate-ai-os` | Passed: 5 files, 21 tests |
| `pnpm --dir apps/api type-check` | Passed |
| `pnpm --dir apps/web type-check` | Passed |
| `git diff --check` | Passed: full worktree |
| `git diff --check -- docs/ai-affiliate-os/phase-1-offer-pipeline.md .opencode/runs/ai-affiliate-os-phase-1` | Passed |

Behavior covered by focused tests includes:

- Trend signal controller list/get/create routing.
- Manual trend signal creation without drafting or publishing.
- Product draft controller approval-only routing with no publish method.
- Draft creation from trend signals with dedupe behavior.
- Draft approval, rejection, needs-edit transitions, and audit-only approval.
- Direct publish fails closed.
- Draft evaluation creates or updates reviewable product scores only.

No additional app source tests were run by this documentation artifact step.
