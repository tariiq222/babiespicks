# Runbook: API 5xx Spike

**Severity:** P0–P1  
**Service:** NestJS API (`api.babiespicks.com`)  
**Indicators:** Error rate >1% sustained for 5 minutes, or any 500 on critical paths

---

## Symptoms

- GlitchTip shows a sudden spike in `500 Internal Server Error` or `503 Service Unavailable`
- Users report product pages, search, or checkout failing
- `GET /health` returns `{"status": "degraded"}` or is unreachable
- Dokploy shows container in restart loop or unhealthy state

---

## Diagnosis Steps

### 1. Check GlitchTip for error patterns
```
https://errors.webvue.pro
```
- Filter by project: `babiespicks-api`
- Sort by **Last Seen** — identify the dominant error type
- Look for: `TypeError`, `PrismaClientKnownRequestError`, `HttpException`, `Error: connect ECONNREFUSED`

### 2. Check recent deploys
- Go to Dokploy → babiespicks-api → **Deployments**
- Did a deploy go out in the last 30 minutes? Correlate with the error spike start time.

### 3. Check container health in Dokploy
- Go to Dokploy → babiespicks-api → **Logs**
- Look for: `FATAL`, `Unhandled rejection`, `Cannot read properties of undefined`, OOM kills

### 4. Check memory and CPU
- Go to Dokploy → babiespicks-api → **Metrics**
- Memory >80%? Likely a memory leak from the AI pipeline or large payload
- CPU >90% sustained? Check if a cron job or AI task is stuck

### 5. Identify the error type
| Error | Likely cause |
|---|---|
| `PrismaClientKnownRequestError` | Database query issue |
| `TypeError: Cannot read properties` | Null/undefined in service logic |
| `ThrottlerException` | Rate limit hit by a client |
| `ECONNRESET` / `ECONNREFUSED` | Upstream service (DB, OpenRouter) down |
| `PayloadTooLargeError` | Request body too large |

---

## Resolution Steps

### Option A: Rollback the deploy (fastest for deploy-caused spikes)
1. Go to Dokploy → babiespicks-api → **Deployments**
2. Find the last known-good deployment
3. Click **Redeploy** on that version
4. Monitor logs — the service should restart with the old image
5. Verify: `curl https://api.babiespicks.com/health`

### Option B: Restart the service (for memory leak / stuck process)
1. Go to Dokploy → babiespicks-api
2. Click **Restart**
3. Watch the logs for successful startup (`NestJS application is running`)
4. Verify: `curl https://api.babiespicks.com/health`

### Option C: Scale up (for traffic spike causing resource exhaustion)
1. Go to Dokploy → babiespicks-api → **Settings**
2. Increase replica count or memory limit
3. Redeploy
4. Monitor metrics

### Option D: Fix and hotfix (for code bug)
1. Identify the bug from GlitchTip stack trace
2. Apply minimal fix in a feature branch
3. Run `pnpm turbo type-check --filter=@babiespicks/api`
4. Create PR, merge to main, let Dokploy auto-deploy
5. Monitor GlitchTip for error rate to drop

---

## Specific Error Patterns

### ThrottlerException spike
Cause: A bot or scraper is hammering the API.
```bash
# Check Cloudflare firewall events for the IP
# Go to Cloudflare → Security → Events
# Add a rate-limit or block rule for the offending IP
```

### AI pipeline flooding memory
Cause: CronModule triggered a large AI batch job.
```bash
# Check cron logs in Dokploy
# Temporarily disable cron in Dokploy env vars:
# DISABLE_CRON=true
# Then restart the service
```

---

## Post-Incident

- Confirm error rate returned to baseline in GlitchTip
- Mark resolved errors as resolved in GlitchTip
- If deploy-caused: add a pre-deploy smoke test step
- File post-incident review if P0/P1 (see [incident-response.md](./incident-response.md))
