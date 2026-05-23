# Dify Discovery Flow — Design Doc

**Date**: 2026-05-23
**Status**: Design (awaiting implementation)
**Owner**: Tariq

## 1. Purpose

Build a Dify Workflow that automates the discovery of trending baby/maternity products from public sources (Google, Reddit, YouTube), finds them on Amazon SA / Noon, runs the existing review-analysis + verdict + content pipeline, and lands the result as a `PENDING_APPROVAL` draft in the BabiesPicks admin panel.

Dify is the **orchestrator + prompt editor**. The Admin Panel remains the sole source of truth for data, review, and publishing actions. Dify does not own state.

## 2. Goals & Non-Goals

### Goals
- Replace the existing `runDiscoveryPipeline` trigger surface with a Dify workflow so non-developers (Tariq) can tweak prompts and routing visually.
- Add new trend sources (Google, Reddit, YouTube) not currently supported in `apps/api/src/agents/discovery/`.
- End-to-end: candidate trends → marketplace lookup → product page draft, all without manual intervention until the approval step.
- Idempotent and re-runnable.

### Non-Goals
- Replace any existing NestJS agent service (review-analyzer, verdict-engine, content-writer, quality-guard stay as-is).
- Move data persistence into Dify. All writes go through NestJS.
- Publishing automation: drafts remain `PENDING_APPROVAL` until a human approves in the admin panel.
- Public scraping. All marketplace data goes through the existing NestJS safety/circuit-breaker layer.

## 3. Architecture

```
┌─────────────┐                                                            
│  Admin OS   │ ────── manual trigger ────────┐                            
└─────────────┘                                │                            
┌─────────────┐                                ▼                            
│ NestJS cron │ ────── scheduled trigger ──▶ ┌──────────────────────────┐
└─────────────┘                              │ Dify Workflow            │
                                             │ babiespicks-discovery    │
                                             │                          │
                                             │ 1. Trend Search          │
                                             │    (Tavily/SerpAPI,      │
                                             │     Reddit, YouTube)     │
                                             │ 2. Score & Rank (LLM)    │
                                             │ 3. Marketplace Lookup ───┼──┐
                                             │ 4-7. Process Product ────┼──┤
                                             └──────────────────────────┘  │
                                                                           ▼
                                                                  ┌────────────────┐
                                                                  │ NestJS API     │
                                                                  │  /agents/dify/*│
                                                                  └────────────────┘
                                                                           │
                                                                           ▼
                                                                    ┌──────────┐
                                                                    │ Postgres │
                                                                    │ + Admin  │
                                                                    │ Panel UI │
                                                                    └──────────┘
```

**Principles**:
- **Dify owns**: workflow logic, prompts, model selection, retry strategy, branching.
- **NestJS owns**: all DB writes, scraping safety, marketplace API access, business rules (idempotency keys, dedup, status transitions).
- **Admin Panel owns**: review, edit, approve, reject, publish.

## 4. Workflow Steps (in Dify)

### Step 1: Trend Search
Three parallel Dify tool nodes:
- **Tavily Search** × 3 queries:
  - `best baby products 2026`
  - `trending baby gear Saudi Arabia`
  - `viral baby products TikTok parents`
- **YouTube Search** × 1: `baby product review 2026 site:youtube.com`
- **Reddit Search** × 2 subreddits: `r/Parenting`, `r/beyondthebump` — most-mentioned product names from hot posts.

A **code node** unifies all results into `{ name, source, snippet, url, raw_mentions }[]`.

### Step 2: Score & Rank
**LLM node** (`claude-sonnet-4-6` via `cli-proxy-api`):
- Input: unified candidate list
- Prompt: rank by (a) is-actual-product, (b) cross-source mentions, (c) Saudi market fit.
- Output (structured JSON): `[ { name, trend_score: 1-10, discovery_reason, category } ]` (top 10).

### Step 3: Marketplace Lookup
**HTTP node** → `POST {NESTJS}/agents/dify/marketplace-search`
- Body: `{ name, category }`
- NestJS tries Noon first, then Amazon SA, using existing circuit-breaker.
- Returns: `{ url, platform, sku, available, existing_product_id?: string }`
- If `existing_product_id` set, skip; continue with next candidate.

### Step 4-7: Process Product
**HTTP node** → `POST {NESTJS}/agents/dify/process-product`
- Body: `{ url, platform, trend_score, discovery_reason }`
- Internally runs `runProductPipeline(url, storeSlug)` from existing `CoordinatorService`.
- Pipeline does: data-acquisition → review-analyzer → verdict-engine → content-writer → SEO audit → quality-guard.
- Returns: `{ product_id, content_page_id, status: 'PENDING_APPROVAL', summary }`

### Step 8: Loop & Aggregate
Dify loops Steps 3-7 for each of the top 10 candidates with a 5-second delay between products (to match the existing rate-limit pattern).

### Step 9: Final Summary
Dify returns to caller: `{ total_candidates, processed, succeeded, failed, drafts: [{ name, content_page_id, trend_score }] }`. The admin panel displays this in the run history.

## 5. NestJS Endpoints (new)

All under `apps/api/src/features/dify-orchestration/`.

### `POST /agents/dify/marketplace-search`
- Auth: API key `X-Dify-Token` (random secret in env)
- Idempotency: `X-Idempotency-Key` header required
- Body: `{ name: string, category?: string }`
- Response: `{ ok: true, data: { url, platform, sku, available, existing_product_id? } }`

### `POST /agents/dify/process-product`
- Auth + idempotency same
- Body: `{ url, platform, trend_score?, discovery_reason? }`
- Calls `coordinator.runProductPipeline(url, platform)`, then writes `dify_run_metadata` row.
- Response: `{ ok: true, data: { product_id, content_page_id, status, summary } }`

### `POST /agents/dify/health`
- No auth. Returns `{ ok: true, version, deps: { db: 'up', circuit_breaker: 'closed' } }`.
- Dify uses this in a pre-flight check node.

### Error contract (all endpoints)
`{ ok: false, error: { code: string, message: string, retryable: boolean } }`
- `retryable: true` for transient errors (DB connection, upstream timeout).
- `retryable: false` for validation errors, hard 404s.

## 6. Data Model Changes

### New columns on `ContentPage`
- `discovery_source` TEXT NULL (`'dify-workflow' | 'manual' | 'cron'`)
- `trend_score` SMALLINT NULL (0-10)
- `dify_run_id` UUID NULL (groups all drafts from one Dify run)

### New table `dify_runs`
- `id` UUID PK
- `started_at` TIMESTAMPTZ
- `finished_at` TIMESTAMPTZ NULL
- `total_candidates` INT
- `succeeded` INT
- `failed` INT
- `triggered_by` TEXT (`'manual' | 'cron'`)
- `triggered_by_user_id` UUID NULL
- `error` JSONB NULL

### Migration
New Prisma migration in `apps/api/prisma/migrations/`. Never edit prior migrations.

## 7. Error Handling

### In Dify
- 3 retries per step, exponential backoff (1s, 2s, 4s).
- LLM fallback chain: Claude Sonnet 4.6 → Gemini 2.5 Pro → GPT-5.5. Defined in the LLM node config.
- 5xx from NestJS → retry. 4xx → fail-fast, log.
- Empty scoring (no candidates ≥ 5/10): workflow terminates with `result: 'no_strong_trends'` (not an error).

### In NestJS
- Wraps existing `CircuitBreakerService`.
- All endpoints return the unified error contract.
- GlitchTip captures uncaught exceptions, tagged with `dify_run_id` and `trace_id`.

### Observability
- `trace_id` header propagates from Dify to NestJS.
- Dify run logs visible in Dify UI.
- NestJS logs go to existing rotating log files + GlitchTip.
- `dify_runs` table is the durable record of every run.

## 8. Security

- New env var `DIFY_API_TOKEN` (32-byte hex) shared between Dify (in env) and NestJS (in env).
- NestJS endpoints under `/agents/dify/*` require `X-Dify-Token` header match.
- No public exposure of the endpoints beyond what Traefik already serves.
- `cli-proxy-api` continues to be accessed only via internal Docker network (`dokploy-network` / `dify-app-zlt28y_default`).

## 9. Testing

### Unit (NestJS)
- Mock-based tests for each new endpoint.
- Idempotency: same `X-Idempotency-Key` → identical response, no duplicate DB rows.
- Auth: missing/wrong `X-Dify-Token` → 401.

### Integration
- Dify dev workspace points at NestJS staging.
- Fixture: pre-seeded "fake trending products" JSON, replayed via a `MOCK_TRENDS=1` env var.
- Verify drafts land in DB with correct `discovery_source` and `trend_score`.

### End-to-end
- Manual trigger from Admin OS → confirm drafts appear in admin draft list.
- Cron trigger → same outcome with `triggered_by: 'cron'`.

### Smoke
- `GET /agents/dify/health` runs in NestJS CI.
- Dify "health node" runs at the start of every workflow execution.

## 10. Rollout

1. Implement NestJS endpoints + migrations, deploy to staging.
2. Build Dify workflow against staging.
3. Run a manual end-to-end on 1 fake candidate; verify draft.
4. Run on 3 real Google-search candidates; verify drafts.
5. Enable cron in production (1× daily, off-peak).
6. Monitor first week; expand to more queries / sources.

## 11. Open Questions

None currently. (If trend-search rate limits hit Tavily/SerpAPI free tier, we will route through a paid tier or add caching — out of scope for v1.)
