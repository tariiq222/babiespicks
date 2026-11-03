# International catalog wiring implementation plan

**Goal:** Close the three engineering gaps accepted by the owner's “ابدأ”: marketplace store administration through MCP, catalog-wide filters with pagination, and home/product consumption of the shared offer engine.

**Authority:** Existing international design/plan and AGENTS.md. Existing main checkout, no new branch/worktree. Preserve unrelated team/evidence/temp artifacts. No source activation, external prompt update, additional writer, paid inference or test mutation against production. The previous release authorization remains conditional on complete acceptance; local work does not itself prove release readiness.

**Architecture:** Domain remains the owner of store/market validation and purchase-target rules. Existing catalog/detail DTOs remain the web boundary; the reader makes eligibility/filter/sort decisions before pagination and exposes source-approved money only. React renders the decision, preserves context, and never relabels legacy SAR or infers delivery. Keep the current legacy fallback only when no international observations exist.

## Shared interface decisions

- Extend `CatalogPageFilters` with optional `q`, `brand`, `price`, `discount`, `rated`, `worth`, `sort`; existing `category`/`locale` stay. `ShoppingContext.budget` supplies an optional exact money ceiling.
- `CatalogPageItem` retains `product`, `offers`, `legacyPrice`; quote DTO may add optional `store:{id,name,slug}|null` and `purchasePath:string|null`, populated server-side. Existing clients tolerate absent additions. The UI must not synthesize an unchecked offer purchase link.
- `CatalogPage.filterOptions` describes every context-eligible searched result, before page slicing; facets do not collapse to page24. Add optional `priceCurrency:string|null` to the page to state the unit of price bands; absent/mixed currency never means guessed SAR. Matching `total` describes all filtered eligible results.
- Use one time/source/FX snapshot per request. No unbounded catalog/history materialization: SQL reads are bounded or use aggregate/distinct projections; document any necessary bounded scanning for exact engine eligibility. Latest observations must win before availability/freshness filtering. Cursor ordering is deterministic; changing filters/context restarts pagination.
- Monetary filters require a matching original unit or a valid approved conversion; never compare USD amounts as SAR. Price ordering stays inside compatible groups; no cheapest overall claim across currency/tax/delivery groups.
- A product detail consumes `getProductOffers` alongside the existing product metadata. Preserve all valid legacy store rows on a legacy-only detail. International rows with unavailable/unapproved observations must not resurrect legacy prices.
- Explicit store `trackingId` takes precedence over scoped environment, then the Saudi-only generic compatibility variable, then a matching store URL tag. Store market must match the exact canonical Amazon host. Missing/null fields preserve existing clients. Reject rehoming a store across markets while linked listings exist; do not infer verification from a title.
- Instruction version for the new writable store fields becomes `2026-11-03.1`; source flags remain disabled. External project/task synchronization stays unverified until separate read-back.

## Task 1 — Domain store administration and exact purchase identity

Owner: domain worker. Files: contracts.ts, index.ts, prices.ts, relevant domain tests; narrowly necessary marketplace/shared contract changes only. No web writes.

- [x] RED: MCP accepts validated nullable marketplaceCode/trackingId/nameAr/nameEn; rejects mismatched/spoofed hosts and invalid changes, preserves omitted metadata, and keeps publishing grant/idempotency boundaries.
- [x] Implement store fields and explicit tracking precedence; verify complete selected store state inside the transaction when fields are omitted on update.
- [x] Protect exact offer observation targets from superseded observations (including a newer unavailable observation), without substituting another seller/listing/market. Preserve source-disabled/publication/legacy boundaries.
- [x] Run focused domain tests + domain type-check. Record actual RED/GREEN and affected paths in local task report.

## Task 2 — Catalog reads, global facets, filtering and stable pages

Owner: reader worker. Files: public-queries.ts, its tests/new server helpers, shared/lib/api.ts type additions and server/queries.ts exports only. No component/page/domain writes.

- [x] RED: a category/brand existing beyond page1 appears in facets; filters/q/context/budget apply before slicing; totals/nextCursor refer to all matching rows; final page has no cursor and state changes reset the cursor.
- [x] Make catalog and detail projections expose only published/active/source-eligible current offers, or valid legacy fallbacks. Keep pending delivery explicit and block unavailable source prices.
- [x] Reuse the engine for exact quotes; attach optional safe store/purchase projections with the existing domain resolver. Never duplicate ownership or allow a stale observation to be replaced.
- [x] Extend current UI filter semantics to the new read boundary with exact units, compatible-group sorting and full-set facets. Keep per-query SQL/history bounded and describe the chosen tradeoff.
- [x] Run focused public-query/HTTP tests + relevant type checks; record proof and query behavior in task report.

## Task 3 — Home/detail/catalog components and navigation

Owner: web worker, after DTO contract above is agreed. Files: locale home/product pages, offer/product grids/cards/detail/sticky/store links, catalog filters and safe projection helpers/render tests. Do not edit public-queries.ts or api.ts owned by Task2.

- [x] RED: international-only eligible fixtures render through home/detail; disabled sources do not expose money/links; legacy-only rows retain real SAR; pending delivery is labelled without a cheapest/shipping promise.
- [x] Wire home to getCatalogPage and product to getProductOffers; pass the server DTO through cards/detail/sticky/structured data, with matching source money and exact purchasePath. No context-derived relabelling or recomputed FX.
- [x] Preserve existing category/brand/price/discount/rating/verdict/search controls and query-only categories; implement next-page navigation preserving preferences and filters. Show total separately from this page's count. Honor existing optional budget Money with explicit unit; add a concise amount/unit control only where it fits the established filters.
- [x] Retain sourced shopper ratings vs editorial assessment, retired redirects, canonical/hreflang, accessibility and explicit empty preference clears. Pending or missing prices have honest empty states.
- [x] Run focused render/context tests and targeted lint only; record report. Root owns whole-repo checks/browser.

## Task 4 — Integration, plan/account instructions and acceptance

Owner: root. Cross-author review of frozen lane diffs, then focused integrated and full unit tests, type-check/lint/build. Use isolated local PostgreSQL/HTTP and actual browser controls to verify both locales, countries and currencies, pagination, facets after page1, legacy/detail links, pending/unapproved prices, typed budget and context changes. Never click production affiliate links or run provider inference. Update original plan status with precise completed/partial/blocked evidence; new source approval and external-agent synchronization remain explicitly incomplete. Publish only after conditional release acceptance is satisfied.

## Execution record

Baseline: main at52ba693de5046abe733af1dd6b22334a997fe384 with only preserved local team/evidence/temp directories untracked. Read-only review is complete; these engineering fixes are authorized. Native delegation uses non-overlapping file scopes in the owner's explicitly required same checkout, overriding per-lane worktree guidance. Coordinator baseline captured after initial inspection; complete token/quota attribution remains unknown.

Concurrent owner commit: HEAD/origin/main advanced to962dfe464d6d1e5f84b2cf21eb384e9a573b1e5d (share preview/Arabic home copy). Preserve those committed edits; final integration baseline is962dfe4, not52ba693. Domain may also edit offer-mutations.ts/spec and a focused shared store row-lock helper so store rehoming and listing creation serialize on the same store row; no new schema. Legacy null→explicit market is allowed only when all linked listing markets and the exact URL agree.

Acceptance record: local unit458passed/89skipped; real SQL new6passed plus prior five suites42passed; native integration13passed/0failed/3skipped. Type-check/lint/build exit0. Browser16context cells plus6actual desktop/mobile interactions passed with no console errors. Source approval/external synchronization stay blocked/unverified. Canonical resolver now checks source enablement, latest exact scope and preferred destination before returning a target. Root additionally repaired browser expiry explanation and analytics identity keys (RED2→GREEN12); cross-author review found no important issue in that repair. Cross-author cursor/empty-offer/representative quote/old receipt findings were fixed with recorded regressions.
