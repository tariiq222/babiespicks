# BabiesPicks — instructions

## Architecture

Next.js public web + independent OAuth/MCP content service + PostgreSQL. `packages/domain` owns mutation, authorization, version/idempotency and affiliate/price rules; `packages/db` owns Prisma schema and additive migrations. Web queries must filter `publishStatus=PUBLISHED` before projecting public data. Drafts must not leak via detail routes, search, related links, sitemap or legacy offer fallbacks.

Historical NestJS/agents/Dify/search sources were removed at the owner’s cleanup request. Recover original code only from Git base 87e0b40fc95b9fd2a1e62811d940f401caf0712c if needed; never start old cron or publishers alongside new writers. Legacy tables and additive migration/import tools remain solely to preserve future production migration. Do not read or copy Tariq Blog secrets or datasets.

## Current public scope

The owner narrowed public scope to offers, available prices, coupons and MCP management on 21 October 2026. Retired tools/comparison/ranking/category/editorial/search URLs redirect to locale home; FAQ/contact redirect to about. Preserve these redirects. No public editorial-score or mailing promises. Domain schemas and historical tables remain for data integrity; they do not imply a public feature.

## Commands

Node22+, pnpm10.11.0. `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm dev`, `pnpm dev:mcp`, `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`.

Tests with `TEST_DATABASE_URL` require an isolated database ending `_test`. Browser/acceptance mutation tests require localhost and must never target production. Never use production as a smoke-test write target. `pnpm db:deploy` changes schema; `pnpm migrate:legacy` defaults to read-only dry-run and has explicit write guards.

## Contracts

- States: DRAFT, REVIEW, PUBLISHED, ARCHIVED. Product/content edits require expectedVersion and operation idempotencyKey. Check versions atomically, save revisions in the same transaction. Identical overlapping retries return saved result; different edits conflict.
- Identity/canPublish comes from validated server credentials only. Static MCP tokens cannot publish. Published edits require owner publishing grant and explicit allowPublishedEdit because they are public immediately. Status changes need confirm:true and owner grant.
- No internal AI calls or automated fact fabrication. Sources and checkedAt accompany editorial claims. Preserve unknown values; scores are optional, 0–10, weighted with existing thresholds.
- Price observations do not change editorial versions or verdicts. Choose newest observation per store before availability/freshness/price comparison. Validate merchant identity against the selected store even inside network deep links. Currency SAR only in current price-write contract.
- Preserve old IDs/slugs and public routes. No blind merge by similar titles. Import unapproved translations separately from already published records.
- Media uploads are public hashed assets, not private draft storage. No arbitrary paths/SVG; PNG/JPEG/WebP, 1MB limit, bounded incoming request streams.
- OAuth issuer/resource are canonical config, not forwarded Host headers. Single MCP replica with ephemeral registrations/codes; secret rotation revokes all signed tokens.
- Cache invalidation failure after a saved write is a warning with retry-only operation, not a failed write to repeat.

## Delivery

Inspect Git, preserve unrelated changes, isolate work as needed. No commit/push/merge/deployment or destructive cleanup without user authorization. Existing production state/credentials must be verified independently. Additive schema updates retain legacy tables; use runbooks and backup/restore evidence before cutover. Report local, Docker, staging and production evidence separately; no unsupported speed/quota-savings claims.
