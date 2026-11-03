# Daily publishing implementation plan

> **For agentic workers:** Use the existing execution lane; root integrates and verifies. Do not create another writer or checkout.

**Goal:** Replace the cancelled monthly goal with 3–6 unique, well researched products per Riyadh day.

**Architecture:** The existing publisher uses MCP for all content writes. A daily read counter guides its two scheduled batches; existing authorization, versioning and idempotency remain unchanged. Bounded section reads prevent truncated product responses from blocking safe review.

**Tech stack:** TypeScript, Prisma/PostgreSQL, MCP, existing Rakazo bots and routines.

**Spec:** Owner request, 3 November 2026: cancel the monthly target; publish 3–6 high-rated products daily without duplicates. Multi-site general-web research remains required.

## Constraints and review focus

- Preserve the same main checkout and unrelated files; publish only the reviewed change after checks.
- The daily count uses first publication, including subsequently archived records, in Asia/Riyadh. Price updates, translations and republication never add to it.
- The monthly quota and old review backlog cannot block new daily products. Do not change the routine to monthly.
- Research the exact model across at least two distinct sites, including a source outside Amazon. Require sourced Amazon stars ≥4/5 and a supported editorial WORTH_IT score ≥7.5/10. Never invent scores or lower standards to reach the number.
- Before creating, scan existing draft, review, published and archived identities: ASIN, model, pack and existing slug. Complete an existing record where appropriate.
- Preserve models, keys, grants, team membership and price-updater schedule. Do not trigger an extra paid model test or test write on production.
- Reject mixed-version section reconstruction; existing product reads remain compatible.

## Tasks and acceptance

- [x] Domain worker: replace the monthly MCP counter/schema/capability with a daily minimum 3 and maximum 6; test Riyadh midnight, invalid dates, archive/republication and counts above 6.
- [x] Domain worker: add bounded product-section reads with version/hash checks; test complete reconstruction and stale reads without changing stored content.
- [x] Root: update canonical instructions and the same publisher routine to 10:00 and 16:00 Riyadh, at most three new products per run and six per day. Read settings back and compare unchanged configuration.
- [x] Root: verify PostgreSQL behavior locally, integrated type/lint/tests/build, inspect actual diff and review risks.
- Root post-commit gate: commit/push the scoped change under the existing publication authorization; verify exact deployment, live capabilities/counter/section reads and Rakazo MCP connection before enabling the saved routine.

Configuration verification and deployment do not establish that a scheduled research/publishing batch has executed.

Local acceptance: type-check/lint/build passed; full suite471passed/92skipped; isolated PostgreSQL3passed; independent review clean. Exact deployment and native routine read-back are retained in the private execution receipt after this commit. Token attribution is incomplete: late coordinator baseline, reused worker sessions, and receipt attachment failed with KeyError participants; no total or savings claim.
