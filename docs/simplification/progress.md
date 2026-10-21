# SDD ledger — plan: docs/simplification/plan.md
Base: 87e0b40fc95b9fd2a1e62811d940f401caf0712c. Worktree codex/babiespicks-simplification.
Ruling: manual worktree outside primary checkout because native projectless worktree tool cannot target this repository. No commit/push authorized.
Ruling: user approved full implementation; production state unknown, no assumption that stopped site has no data. Read-only live inspection first.
Ownership: parent db/domain/root/infrastructure/migration; web worker apps/web; MCP worker apps/mcp. No overlapping writers.
Pre-flight: data->domain->MCP/web contracts fixed in messages; no alternate state names. Existing SQL migration 0030 is loose file, must inventory and preserve.
Ruling: preserve legacy schema/tables and code until replacement verification; exclude legacy runtime from final startup rather than destructive data cleanup.
Task 1: in progress. Static repo/route/schema inventory; live access being verified.
Task 1: local inventory complete; HTTPS and SSH timeout. Production/schema ownership not proven; no live mutation.
Task 2: additive shared schema + migration deployed to isolated PostgreSQL; legacy import RED→GREEN, repeated import protected by mappings/revisions; subscribers preserved from legacy JSON.
Task 3: shared domain complete locally; real PostgreSQL concurrency/publication/idempotency/prices tests green.
Task 4: MCP OAuth/SDK complete locally; static editor cannot publish, owner grants trusted, input JSONSchema input-mode fixed after SDK integration failure.
Task 5: public web reads direct DB; publication guards, coupons/newsletter/media/redirects/native health; old admin mutations410; Markdown sanitization and0–10 score fix.
Task 6: external workflow runbook complete. Daily scheduler not created: live connection/operator/schedule/publication boundaries remain unconfigured. Existing social work retained without execution.
Task 7: web+MCP bundles and Docker images built. Real MCP→DB→web lifecycle verified, cache invalidation tested across running containers. Isolated dump/restore passed.
Task 8: legacy API/Dify/search moved to legacy and excluded from runtime/workspace. Production cutover and retirement validation remain blocked by unavailable access; no commit, push, merge or deployment performed.
Final review: fresh GPT-6.1 Sol/high reviewer found four Important defects and a coupon-slug compatibility defect. Fixed all with reproduced failing tests/integration cases: unapproved translation import; selected merchant identity; added verdict visibility; overlapping identical retries. Coupon Unicode slug covered by real HTTP acceptance.
Final: Ruling: retain legacy source/tables and preserve worktree/ledger because changes uncommitted and production cannot be reached — no destructive cleanup or false production completion.
Final: Ruling: first-cutover rollback cannot safely restart historical public NestJS detail routes; require publication-safe compatibility image or temporary maintenance/forward-fix. Additive database retained; never restore stale backup over newer writes.
Final: Ruling: root tool scripts use ESM (package type module) after actual CLI execution exposed top-level-await transpilation failure. Existing runtime packages remain separately scoped.
Final: Ruling: old source-text assertions for retired admin proxy were replaced with behavioral410/no-forward tests; legacy NestJS tests retained in archive, excluded from new runtime suite.
Final: Ruling: mobile browser found implicit grid track overflow from360px placeholder; fixed real layout at375px rather than hiding overflow globally. Browser confirmation pending final container refresh.
Measurement: sol61-all-v1; workers/reviewer native GPT-6.1 Sol/high. Exact whole-task token attribution unknown: coordinator baseline late, native child session UUID counters unavailable. No savings/allowance claim.
Final browser confirmation:375px Arabic no overflow after real image rebuild;1440px English LTR no overflow, zero console errors. Shared media upload/read-only web serving passed in Docker; actual cross-container cache invalidation passed. Final acceptance33 routes, tests89/89, typecheck/lint/build/diff checks green. Production transition remains unexecuted; user-visible report saved in conversation outputs.

## Owner-requested mock/legacy cleanup
Owner explicitly authorized cleanup of current mock and all local remnants. Removed legacy source and dead workspace packages/root Turbo/OpenCode draft; additive DB import schema retained. Created fresh babiespicks_preview, repointed running web+MCP, verified48 application tables0 rows, removed shared generated test media. Web worker owns bilingual honest copy/form/empty-state cleanup. Test database stays isolated; no production touched.


اكتمل تنظيف المعاينة المحلية: أزيل Telegram وقسم الاشتراك وروابطه، وأزيلت بيانات الموك وقواعد الاختبار المحلية، مع نجاح 96 اختبارًا والفحوص والبناء والتحقق بالمتصفح. راجع cleanup.md للأدلة والنطاق.


تضييق النطاق بطلب المالك إلى MCP والعروض: راجع offers-focus.md. أزيلت واجهات الأدوات والتقييم والمقارنة والأقسام الخارجة عن النطاق مع إبقاء تحويلات الروابط القديمة.
