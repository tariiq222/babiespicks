# Marketplace affiliate tags implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. All work remains uncommitted and unpublished at the owner's request.

**Goal:** Prevent the Saudi runtime tag from being written to US Amazon links, and record the newly created US Associates account without implying API approval.

**Architecture:** Keep `wrapAffiliateUrl` and its consumers' interfaces. Select `AMAZON_ASSOCIATES_TAG_SA` or `_US` by the validated marketplace; the generic variable is a Saudi compatibility fallback only. A selected store URL may supply its own tag only after its host and marketplace match the purchase destination. Reject missing tags, mismatched markets and unverified legacy US stores.

**Tech Stack:** TypeScript, Vitest, Next.js, MCP, Docker Compose.

**Spec:** Owner's 2026-11-03 “كمل انت” following the three choices; coordinator selects option 1. Existing AGENTS.md publication/source restrictions apply.

## Global constraints

- Preserve existing dirty-tree work; modify in place because this fix depends on the unpublished international implementation.
- No commit, push, deployment, database mutation, external-agent prompt change or US runtime-tag activation.
- `internationalOffers.enabled` remains false; instruction version remains `2026-11-02.2` because the external operating contract is unchanged.
- US account `babiespicks-20` exists; payment/tax setup and Amazon review remain pending; API access was not requested or verified.

## Review focus

- Both market tags coexist: US must never receive the generic Saudi override.
- Missing/blank market configuration must fail even if an observation carries a tag.
- Scoped SA configuration overrides generic SA, preserving legacy SA/store-tag fallback.
- Spoofed hosts, store/market mismatch and unverified legacy US identity stay rejected.
- Config reaches both web and MCP; tests use fake tags and never live purchase redirects.

### Task 1: Market-scoped tag resolution and operating record

**Files:** `packages/domain/src/prices.ts`, its affiliate tests and dependent query/database test fixtures; `.env.example`, `apps/mcp/.env.example`, both Compose files; operations source/account, release and synchronization documentation.

**Interfaces:** Existing `wrapAffiliateUrl(raw, storeSlug, env, store): string` and purchase resolvers remain unchanged. Missing configuration raises `INVALID_INPUT`; callers keep their existing null/hide behavior.

- [x] Add regression cases for concurrent market tags, SA precedence, missing/blank tags, verified-store fallback, foreign legacy identity, and unsupported Amazon subdomains. Run the focused affiliate test and observe the relevant failures.
- [x] Implement market-scoped resolution; use same-market store URL fallback; reject absent configuration. Model configured fake store tags in existing fixtures rather than changing their acceptance assertions.
- [x] Pass the two new environment variables to web and MCP in both Compose definitions; leave US value empty and existing SA setting compatible. Update account evidence and runtime precedence docs; keep external prompts unverified.
- [x] Run focused tests, repository type-check, lint and credential-free unit tests. Review the incremental diff against the saved dirty-tree baseline. No database/browser acceptance rerun is claimed.
- [x] Obtain one read-only review of this incremental patch; address material findings and record evidence in `work/acceptance/2026-11-03-market-tags/`.

## Execution record

Pre-flight: one task, no shared interfaces between workers; inline implementation. No new worktree or commits: explicit owner scope requires preserving this exact unpublished tree. Measurement baseline was captured after initial inspection; full-task consumption is unknown. The local receipt adapter failed on an existing ledger record (`KeyError: participants`); no routing state was repaired.

Task 1: complete locally. Focused: 46 passed / 9 skipped; repository: 364 passed / 76 skipped; type-check and lint exit 0; both Compose definitions validate scoped-tag interpolation with fake settings. Fresh read-only reviewer found no Critical/Important issues. Its minor missing-image concern was rejected by direct is_file/stat evidence (90,666 bytes; ignored by rg file listing). No commit, branch, worktree, push, deployment or database mutation.
