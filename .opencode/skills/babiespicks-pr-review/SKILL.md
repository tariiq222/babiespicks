---
name: babiespicks-pr-review
description: Use when reviewing BabiesPicks pull requests or diffs for correctness, tests, RTL/i18n, NestJS/Prisma safety, and project conventions.
---

# BabiesPicks PR review

Use this skill to review BabiesPicks changes before merge or as part of the Orchestrator verification flow. It is review-only guidance and must not perform git automation.

## Review scope

- Monorepo: pnpm 10 + Turborepo
- Web: `apps/web` with Next.js 16, Tailwind v4, next-intl
- API: `apps/api` with NestJS 11, Prisma 6, PostgreSQL, SWC
- Shared packages: `packages/shared-types`, `packages/ui`, `packages/config`

## Checks

1. Confirm the change follows the local `AGENTS.md` conventions.
2. Verify affected code paths are covered by tests or an explicit test plan.
3. For web changes, check Arabic/English messages, RTL layout, accessibility, and hydration safety.
4. For API changes, check DTO validation, NestJS module boundaries, error handling, and rate-limit compatibility.
5. For Prisma changes, check schema impact, query safety, indexing, and migration or `db push` implications.
6. For shared types, check frontend/backend contract compatibility.
7. Check no secrets, tokens, local env values, debug logs, or generated artifacts are introduced.
8. Check performance risks: N+1 queries, unbounded fetches, heavy client bundles, or blocking hot paths.

## Severity model

- BLOCK: must fix before merge; correctness, security, data loss, broken build, or severe RTL/i18n breakage.
- MAJOR: likely user-visible issue or maintainability risk.
- MINOR: should fix soon but not merge-blocking.
- NIT: style or clarity suggestion.

## Output format

```text
Verdict: APPROVE | REQUEST_CHANGES | REJECT

Findings:
- [SEVERITY] file:line — issue
  Why: ...
  Fix: ...

Tests to run:
- pnpm turbo lint
- pnpm turbo type-check
- pnpm turbo test
```

## Do not

- Do not run or suggest automatic commit, push, merge, rebase, or PR creation from this skill.
- Do not replace the Orchestrator 9-phase pipeline or 5-layer verification gate.
