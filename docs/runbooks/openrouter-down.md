# Runbook: OpenRouter / AI Pipeline Down

**Severity:** P1–P2  
**Service:** OpenRouter AI (`openrouter.ai`), AI agents pipeline  
**Impact:** Content generation stops; existing product data is unaffected; no new AI verdicts or summaries

---

## Symptoms

- GlitchTip shows errors from `OpenRouterModule` or AI agent files:
  - `Error: 503 Service Unavailable` from `api.openrouter.ai`
  - `Error: Request timeout` from Claude/Gemini/GLM model calls
  - `CoordinatorService` or `VerdictEngineService` errors
- No new products are being processed through the AI pipeline
- Admin panel shows products stuck in `PROCESSING` status
- Cron jobs complete without errors but produce no output

---

## Diagnosis Steps

### 1. Check OpenRouter status page
```
https://openrouter.ai/status
```
- If there's an ongoing incident, wait for it to resolve
- Check which models are affected (Claude Sonnet 4, Gemini Flash, GLM-4.5-Air)

### 2. Check your API key balance and rate limits
```bash
# Check balance via OpenRouter API
curl https://openrouter.ai/api/v1/auth/key \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```
- If balance is low, top up at `https://openrouter.ai/credits`
- If rate-limited, check the `X-RateLimit-*` headers in GlitchTip error details

### 3. Check GlitchTip for the specific error
```
https://errors.webvue.pro
```
- Filter by `babiespicks-api`
- Look for errors from: `CoordinatorService`, `ReviewAnalyzerService`, `VerdictEngineService`, `ContentWriterService`
- The error message and stack trace will tell you which model and which pipeline step is failing

### 4. Test OpenRouter directly
```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4",
    "messages": [{"role": "user", "content": "Say OK"}]
  }'
```
- `200 OK` → OpenRouter is up, the issue is in the app code
- `503` → OpenRouter is down for this model, try another
- `401` → API key issue

### 5. Check the AI pipeline models in use
Models used by BabiesPicks (see `infrastructure/openrouter/`):
- `anthropic/claude-sonnet-4` — main reasoning model
- `google/gemini-flash-1.5` — fast/cheap tasks
- `thudm/glm-4.5-air` — supplementary

If one model is down, check if others are available and can be used as fallback.

---

## Resolution Steps

### Option A: Wait for OpenRouter to recover
If OpenRouter status shows an ongoing incident:
1. Monitor `https://openrouter.ai/status`
2. The pipeline will retry on the next cron trigger automatically
3. No action needed unless the outage exceeds 4 hours (P1 → escalate)

### Option B: Switch to a fallback model
If one model is down but others are available:
1. Identify the failing model from GlitchTip
2. Update the model constant in `apps/api/src/infrastructure/openrouter/`:
   ```typescript
   // Temporarily switch from claude-sonnet-4 to gemini-flash
   const MODEL = 'google/gemini-flash-1.5';
   ```
3. Deploy the change via Dokploy
4. Monitor GlitchTip for the pipeline to resume

### Option C: Manually trigger the pipeline
If OpenRouter is back but the cron didn't fire:
1. Go to the Admin panel → Coordinator
2. Trigger a manual pipeline run for pending products
3. Or call the coordinator endpoint directly:
   ```bash
   curl -X POST https://api.babiespicks.com/admin/coordinator/trigger \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

### Option D: Disable AI pipeline temporarily
If the outage is prolonged and you need to stop error noise:
1. Add env var in Dokploy: `DISABLE_AI_PIPELINE=true`
2. Restart the API service
3. This stops new AI jobs from being queued while leaving existing data intact
4. Remember to remove this var when OpenRouter recovers

---

## Impact Assessment

| What breaks | What still works |
|---|---|
| New product AI analysis | Existing product pages |
| AI verdict generation | Search |
| Bilingual content writing | Affiliate links |
| Quality guard checks | Categories |
| | Newsletter |
| | All static content |

**User-facing impact is low** — all existing product data continues to be served normally. Only new product onboarding is blocked.

---

## Post-Incident

- Check how many products were queued during the outage
- Manually trigger pipeline to process backlog once OpenRouter recovers
- If a model was switched, revert to primary model after confirming stability
- If rate limits were hit, review AI request volume and consider batching optimizations
- File post-incident review if outage exceeded 4 hours (see [incident-response.md](./incident-response.md))
