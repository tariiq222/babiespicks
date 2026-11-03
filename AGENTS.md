# BabiesPicks — instructions

## Architecture

Next.js public web + independent OAuth/MCP content service + PostgreSQL. `packages/domain` owns mutation, authorization, version/idempotency and affiliate/price rules; `packages/db` owns Prisma schema and additive migrations. Web queries must filter `publishStatus=PUBLISHED` before projecting public data. Drafts must not leak via detail routes, search, related links, sitemap or legacy offer fallbacks.

Historical NestJS/agents/Dify/search sources were removed at the owner’s cleanup request. Recover original code only from Git base 87e0b40fc95b9fd2a1e62811d940f401caf0712c if needed; never start old cron or publishers alongside new writers. Legacy tables and additive migration/import tools remain solely to preserve future production migration. Do not read or copy Tariq Blog secrets or datasets.

## Current public scope

On 2 November 2026, the owner chose a global site identity, with Saudi Arabia and the United States as the initial delivery destinations. Offers may come from any Amazon marketplace with appropriate delivery evidence, with or without Prime. Treat browsing location, delivery destination, language, display currency and marketplace as separate concepts. Do not infer item-level delivery, Prime eligibility or free shipping from the marketplace alone; verify against the item, seller and destination.

The owner narrowed public scope to offers, available prices, coupons and MCP management on 21 October 2026. Retired tools/comparison/ranking/category/editorial/search URLs redirect to locale home; FAQ/contact redirect to about. Preserve these redirects. Product pages show sourced Amazon ratings separately from BabiesPicks editorial assessments at the owner's request on 22 October 2026; no mailing promises. Home page category and attribute filters use query parameters, not category URLs, at the owner's request on 30 October 2026; `/categories` stays redirected. Everything those filters read must stay writable through MCP, including optional product age bounds used by the chat. Domain schemas and historical tables remain for data integrity; they do not imply a public feature.

## Commands

Node22+, pnpm10.11.0. `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm dev`, `pnpm dev:mcp`, `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`.

Tests with `TEST_DATABASE_URL` require an isolated database ending `_test`. Browser/acceptance mutation tests require localhost and must never target production. Never use production as a smoke-test write target. `pnpm db:deploy` changes schema; `pnpm migrate:legacy` defaults to read-only dry-run and has explicit write guards.

## Contracts

- States: DRAFT, REVIEW, PUBLISHED, ARCHIVED. Product/content edits require expectedVersion and operation idempotencyKey. Check versions atomically, save revisions in the same transaction. Identical overlapping retries return saved result; different edits conflict.
- Identity/canPublish comes from validated server credentials only. Static MCP tokens cannot publish. Published edits require owner publishing grant and explicit allowPublishedEdit because they are public immediately. Status changes need confirm:true and owner grant.
- No automated fact fabrication. The only internal AI call is the public shopping chat (owner decision, 30 October 2026): GLM through Deploy, read-only tools over published data, scoped to this site's products, discounts, coupons and recommendations. Prices, ratings and coupon codes come from the database, never model text; replies are validated in code before display; medical and off-topic requests get fixed replies; no conversation text is stored. Sources and checkedAt accompany editorial claims. Preserve unknown values; scores are optional, 0–10, weighted with existing thresholds.
- Price observations do not change editorial versions or verdicts. Choose newest observation per store before availability/freshness/price comparison. Validate merchant identity against the selected store even inside network deep links. Currency SAR only in current price-write contract.
- Preserve old IDs/slugs and public routes. No blind merge by similar titles. Import unapproved translations separately from already published records.
- Media uploads are public hashed assets, not private draft storage. No arbitrary paths/SVG; PNG/JPEG/WebP, 1MB limit, bounded incoming request streams.
- OAuth issuer/resource are canonical config, not forwarded Host headers. Single MCP replica with ephemeral registrations/codes; secret rotation revokes all signed tokens.
- Cache invalidation failure after a saved write is a warning with retry-only operation, not a failed write to repeat.

## Delivery

Inspect Git, preserve unrelated changes, isolate work as needed. No commit/push/merge/deployment or destructive cleanup without user authorization. Existing production state/credentials must be verified independently. Additive schema updates retain legacy tables; use runbooks and backup/restore evidence before cutover. Report local, Docker, staging and production evidence separately; no unsupported speed/quota-savings claims.

## Content and price agents

The external content agent and any price updater are first-class project components, distinct from the public read-only shopping chat. Their canonical operating instructions are `docs/operations/content-agent-instructions.md`. Include their instruction versions, MCP tool guidance, scheduled-task prompts and acceptance evidence in changes affecting catalog scope, money, delivery, membership or publication. A repository edit does not update a running external project or scheduled prompt; verify synchronization separately without starting an extra writer.

Read live `tools/list` schemas and `bp_get_capabilities` before work; compare `internationalOffers.agentInstructionVersion` (`2026-11-03.2`, previously `2026-11-03.1`) with the instructions in use, and treat `enabled:false` or an older version as deferral of unsupported currencies and delivery evidence. Global scope is product direction, not proof of deployed international support. `bp_record_price` keeps its legacy SAR-only contract; never relabel or manually convert a foreign price to bypass it, fabricate delivery evidence, or assume one affiliate tag works across marketplaces. Unsupported observations remain pending with their real source context. Existing publishing grants retain their exact scope; changing instructions does not grant new publishing or scheduling authority. Applying the text to the external project and scheduled task is a separate manual step with read-back evidence recorded in `docs/operations/agent-sync.md`; until that evidence exists the external surfaces are unverified, not synchronized.

The proposal is `docs/architecture/target-design.md`; the execution plan is `docs/superpowers/plans/2026-11-02-international-marketplaces.md`. Neither document means the proposed behavior is implemented or approved for deployment.

Owner operating decision, 3 November 2026: MCP is the content control plane for the existing Rakazo team. Target 50 unique first-published products per Gregorian month in Asia/Riyadh, with general-web, multi-site editorial research. Count first publication separately from price updates, translations and republication. The publication-progress tool reports structural review-reference coverage, not proof that references are independent or correct. The publisher must inspect sources and keep BabiesPicks editorial assessments separate from Amazon stars. Existing Saudi SAR page-verification/MCP publishing does not require a new Amazon API integration; unsupported international observations remain deferred, never relabelled. See docs/operations/rakazo-team.md.
