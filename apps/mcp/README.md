# BabiesPicks MCP

Independent Node 22 service. Hono exposes the official MCP SDK's stateless Streamable HTTP transport at `/mcp`. The service imports `@babiespicks/domain` for tool definitions, validation and persistence; it does not run NestJS or a model provider.

## Run locally

Configure the names in `.env.example` with **BabiesPicks-only** values. At least a static editor token or the pair `MCP_OAUTH_SECRET` + `MCP_ADMIN_PASSWORD` is required. Environment files are not loaded implicitly; inject them through the shell/container, or start a built service from this directory with `node --env-file=.env dist/index.js`.

```sh
pnpm --filter @babiespicks/mcp build
pnpm --filter @babiespicks/mcp start
```

`MCP_PORT` selects the listener port (default 8765); `PORT` is accepted as a fallback. `MCP_PUBLIC_URL` is a canonical origin, for example `https://mcp.example.test`. HTTPS is required except for exact loopback hosts during development. Do not infer the issuer from reverse-proxy headers. Configure a single service replica behind HTTPS. The bundle includes workspace domain/database source; Prisma and the MCP/HTTP dependencies remain external runtime packages, including the generated Prisma engine.

`GET /health` is liveness. `GET /ready` runs `SELECT 1` and returns a generic 503 when unavailable. Neither endpoint exposes connection information. `/mcp` requires a bearer token, checks supplied browser origins, and limits request bodies to 2 MiB. OAuth request bodies are limited to 16 KiB. Domain image upload accepts at most 1 MiB of PNG/JPEG/WebP bytes. `MEDIA_ROOT` must be persistent storage shared with the web service; image uploads are public assets and should contain no private draft material.

## OAuth connection and publishing

Connect an MCP client to `${MCP_PUBLIC_URL}/mcp`. Discovery is available at `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-protected-resource`, and `/.well-known/oauth-authorization-server` when OAuth is configured. The exact resource/audience is `${MCP_PUBLIC_URL}/mcp`; the issuer is `${MCP_PUBLIC_URL}`.

Dynamic registration records exact HTTPS or loopback redirect URIs. Authorization uses the owner's independent password, a one-use browser transaction with an HttpOnly SameSite cookie and same-origin form submission, followed by a single-use authorization code and S256 PKCE. Both authorization and token requests must include the exact `resource`. Only authorization-code grants and public clients (`token_endpoint_auth_method: none`) are supported.

Publication defaults **off**. It needs both `ENABLE_MCP_PUBLISH=true` and the owner's explicit checkbox in the OAuth form. Neither tool arguments, client metadata nor token-exchange parameters grant publication. A static token remains an editor even when the publishing switch is enabled. Public catalog changes and edits to already published content are subject to the domain's publishing rules; published edits also require `allowPublishedEdit:true`, current `expectedVersion`, and a stable `idempotencyKey`.

Access tokens last 30 days and have no refresh token. Codes/browser transactions expire after ten minutes; registrations expire after 24 hours. Pending state and registrations are in memory, bounded and lost on restart; new authorization flows then need registration again. Valid signed access tokens remain valid across restart when the secret remains unchanged. Rotate `MCP_OAUTH_SECRET` to revoke all OAuth tokens, or disable publication and restart to revoke publishing globally. There is no per-token revocation service. Failed password attempts have a global 30-per-15-minute limit; registration has a global 100-per-minute limit. Configure an external request-rate limit for deployments exposed to untrusted traffic.

## Content tools and cache updates

`tools/list` mirrors the domain's `TOOL_DEFINITIONS`, with an additional `bp_revalidate` transport tool. `tools/call` passes the actor as trusted server context; it does not merge input claims into identity. Known domain errors preserve their code/message. Unexpected errors return `INTERNAL_ERROR` without exception details. Input JSON Schema validation is also performed by the MCP SDK before domain dispatch.

After every successful mutation, the service optionally POSTs to `WEB_REVALIDATE_URL`, using `Authorization: Bearer REVALIDATE_SECRET` and `{"tags":["products","content-pages","offers","coupons","stores"]}`. Requests time out after five seconds and never follow redirects. Both settings must be configured together. Docker can explicitly enable `WEB_REVALIDATE_ALLOW_INTERNAL_HTTP=true` for the exact internal target `http://web:3000/api/revalidate`; other plain HTTP hosts remain rejected, and OAuth HTTPS rules are unchanged. Failed or unconfigured revalidation returns the saved data with `revalidation.status` and a `SAVED_REVALIDATION_*` warning. `bp_revalidate` retries invalidation only, without repeating the saved write. Reads and rejected writes do not invalidate caches. Public database queries currently read fresh data directly; cache invalidation remains part of the transport contract.

## Verification

```sh
pnpm --filter @babiespicks/mcp test
pnpm --filter @babiespicks/mcp type-check
pnpm --filter @babiespicks/mcp build
```

The PostgreSQL lifecycle test is skipped unless `TEST_DATABASE_URL` is explicitly supplied. It refuses hosts outside loopback or database names without `simplification_test`; it never falls back to `DATABASE_URL`, resets tables or connects to production. It creates uniquely named fixtures and retains their database audit records. Temporary image files created by that test are removed afterward. An optional loopback `TEST_WEB_URL` additionally verifies draft/public/archived product visibility and the real purchase redirect. Run these only against an isolated web service pointing to the same test database.

Coverage includes malformed/foreign/expired tokens, publisher separation, real OAuth registration/approval/PKCE and code replay, browser transaction integrity, actual SDK initialize/tools/list/tools/call, domain schemas, expected versions, idempotency conflicts, media, publication lifecycle, and saved-write/cache-warning behavior. A local suite is not production acceptance or a live ChatGPT connector acceptance.
