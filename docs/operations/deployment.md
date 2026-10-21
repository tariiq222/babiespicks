# BabiesPicks production on OpenShip

Deployment source: `tariiq222/babiespicks`, `main`, via the connected OpenShip GitHub App. Auto-deploy is enabled. Production Compose: `deploy/openship/compose.yml`; project root directory: `deploy/openship`. Project `BabiesPicks`, slug `babiespicks`, on the existing webvue host. No old host database was reset or migrated.

## Services

- `db`: PostgreSQL16, private project network, no published database port.
- `migrate`: one-shot readiness wait followed by `pnpm db:deploy`; schema failure is not retried blindly. Expected terminal state is Exited0.
- `web`: Next.js, internal port3000, health `/api/ready`.
- `mcp`: single OAuth/MCP replica, internal port8765, health `/ready`.

The OpenShip Compose parser supports build arguments but does not preserve build.target. The canonical Dockerfile's `RUNTIME_STAGE` build argument selects `web`, `mcp` or `tools` as the final release image. Default remains `web`.

Persistent PostgreSQL and media live under `/var/lib/webvue-apps/babiespicks/production/`. Web mounts media read-only and MCP mounts it read-write as UID1000. Do not delete the data directories or use volume-removing cleanup.

## Domains

- `babiespicks.com`: web, Cloudflare proxied.
- `www.babiespicks.com`: web, canonical redirect enforced by Next.js; Cloudflare proxied. OpenShip's domain metadata alone did not emit the redirect in this deployed version.
- `api.babiespicks.com`: web for retained /go redirects and current web API, Cloudflare proxied. The retired Nest API is not restored.
- `mcp.babiespicks.com`: MCP, DNS-only, trusted Let's Encrypt certificate. Cloudflare Browser Integrity Check rejected the default Python client, so the MCP hostname bypasses the browser proxy while application authentication remains mandatory.

All four hostnames have managed origin certificates. OpenShip owns runtime target ports and domain bindings. Public endpoints must explicitly map web to3000 and MCP to8765. The database and application host bindings are not public: web/MCP host ports use loopback.

## Secrets and access

Production secrets are independent from other projects. OpenShip stores POSTGRES_PASSWORD, REVALIDATE_SECRET, MCP_OAUTH_SECRET and MCP_ADMIN_PASSWORD as secret variables. Root-only operational copy: `/etc/webvue/babiespicks/production.env`. No credentials belong in Git or build arguments.

MCP URL: `https://mcp.babiespicks.com/mcp`. OAuth uses exact resource/audience and PKCE; publishing also requires the owner's explicit checkbox in the authorization form. No static token is enabled. The owner password is in the private operational secret store, not this document. Read-only production acceptance completed OAuth/PKCE, initialized MCP, listed20 tools, read capabilities and revalidated web caches; it did not create or publish content.

## Rollout and recovery

First source deployment: a7d1268c0c5ad73c4a62235ef94adff8a824cd34. Database starts empty by design after local mock cleanup. Old origin178.105.84.5 was not modified; its data remain unverified and were not treated as empty.

Use GitHub main for future source changes; OpenShip reports deployment commitSha and per-service images. Confirm db healthy, migrate Exited0, web/MCP healthy, public readiness, OAuth metadata and unauthenticated401. A control-plane ready label does not replace those probes.

Before data-changing releases, back up the project database/media and verify recovery on an isolated database. Rollback by a reviewed Git revert or known image through OpenShip; retain persistent data and examine schema compatibility first. DNS before/after snapshots are retained privately with the deployment work, and root-only copies belong in the operator backup directory. Rolling DNS back to the old host does not prove its stopped application can serve.
