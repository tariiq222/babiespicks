# Inventory and boundaries

Base Git commit87e0b40fc95b9fd2a1e62811d940f401caf0712c, original checkout `/Users/tariq/code/babiespicks`, isolated implementation `/Users/tariq/code/worktrees/babiespicks-simplification` on `codex/babiespicks-simplification`.

Old modules: NestJS catalog/products/content/search/categories/stores/coupons/newsletter, affiliate redirects, agents/coordinator/content/SEO/discovery/verdict/social/publisher, cron/scheduler, AI OS, Affiliate AI OS, Dify. Frontend had dynamic ar/en pages, admin/auth/proxy and public calls to separate API. Complete public page list recorded in route-contracts.json.

Old workspace baseline:543 test assertions passed; two existing suite initialization failures referred to nonexistent root prisma/schema.prisma. The first broad baseline overlapped MCP worker's intentionally missing auth implementation, producing one additional transient suite error; that third error was not an old-repository failure. Historical tests remain under legacy; the simplified app has its own behavior/integration suite.

Existing tables/IDs/history retained in shared schema. Discovered migration drift: loose0030 SQL outside Prisma migration directories used snake_case while Prisma models use camelCase. New additive migration restores missing schema elements on clean migration history and fails on incompatible legacy table shapes; production must be inspected/restored before running it.

Old public list predicate Product.isActive and ContentPage.isPublished determine legacy listed visibility in one-time mapping. New public queries require canonical publication. Invalid or conflicting cases appear in dry-run report. Article drafts with colliding slugs are imported separately; no insertion of unapproved translation into published content.

No production DB or filesystem inventory obtained: both domain HTTPS probes and recorded SSH host timed out. DNS currently resolves through Cloudflare; this is not proof of origin health or server identity. No remote power/start/restore action performed. Existing data must never be assumed empty.
