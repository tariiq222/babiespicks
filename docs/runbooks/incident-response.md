# BabiesPicks — Incident Response Runbook

## Overview

This runbook defines the incident response process for BabiesPicks. All engineers on-call must follow this process during any service disruption.

**Monitoring:** GlitchTip at `https://errors.webvue.pro`  
**Deployment:** Dokploy  
**API:** `api.babiespicks.com` (NestJS, port 3001)  
**Web:** `babiespicks.com` (Next.js, port 3000)  
**Health check:** `GET https://api.babiespicks.com/health`

---

## Severity Levels

| Level | Name | Definition | Response SLA | Resolution SLA |
|---|---|---|---|---|
| **P0** | Critical | Site completely down or data loss in progress | 15 minutes | 1 hour |
| **P1** | Major | Core feature broken (products, search, checkout) | 1 hour | 4 hours |
| **P2** | Minor | Non-core feature broken or degraded performance | 4 hours | 24 hours |
| **P3** | Low | Cosmetic issue, typo, minor UX problem | Next business day | Next sprint |

### P0 — Critical
- Site is completely unreachable
- Database corruption or data loss occurring
- Security breach detected
- Payment processing totally failed

### P1 — Major
- Product pages not loading for >50% of users
- Search returning errors
- AI pipeline completely stopped
- Admin panel inaccessible

### P2 — Minor
- Slow page loads (>5s) for some users
- Individual API endpoints returning errors
- Image optimization failing
- Newsletter subscription broken

### P3 — Low
- Visual misalignments
- Translation missing in non-primary locale
- Minor copy errors
- Non-critical analytics missing

---

## First Response Checklist

When an incident is reported:

1. **Acknowledge** — Respond in the incident channel within your SLA window.
2. **Assess severity** — Use the table above to assign P0/P1/P2/P3.
3. **Check health endpoint:**
   ```bash
   curl https://api.babiespicks.com/health
   ```
4. **Check GlitchTip** — Go to `https://errors.webvue.pro`, filter by project (`babiespicks-api` or `babiespicks-web`), look for recent error spikes.
5. **Check Dokploy** — Review deployment logs and container status for recent deploys.
6. **Check Cloudflare** — Review if a CDN/DNS issue is causing the problem.
7. **Declare incident** — Post to the incident channel with: severity, what's broken, what you're doing next.
8. **Open a war room** — For P0/P1, spin up a call immediately.

---

## Specific Runbooks

| Scenario | Runbook |
|---|---|
| Database down | [database-down.md](./database-down.md) |
| API 5xx spike | [api-5xx-spike.md](./api-5xx-spike.md) |
| Slow pages | [slow-pages.md](./slow-pages.md) |
| OpenRouter/AI down | [openrouter-down.md](./openrouter-down.md) |

---

## Escalation Contacts

| Service | Contact | Notes |
|---|---|---|
| **Cloudflare** | [dash.cloudflare.com](https://dash.cloudflare.com) | DNS, CDN, DDoS |
| **Dokploy** | [Dokploy docs](https://docs.dokploy.com) | Container restarts, builds |
| **OpenRouter** | [openrouter.ai/status](https://openrouter.ai/status) | AI model availability |
| **Resend** | [resend.com/overview](https://resend.com/overview) | Email delivery |
| **GlitchTip** | `https://errors.webvue.pro` | Error monitoring |

---

## Communication Templates

### Initial Incident Notice
```
[INCIDENT - P{severity}] {short description}
Started: {time}
Impact: {who is affected}
Status: Investigating
Next update: {time + 30 min}
```

### Status Update
```
[UPDATE - P{severity}] {short description}
Status: {Investigating | Identified | Fixing | Monitoring}
What we know: {findings}
What we're doing: {actions}
Next update: {time}
```

### Resolution Notice
```
[RESOLVED - P{severity}] {short description}
Resolved at: {time}
Duration: {X hours Y minutes}
Root cause: {brief description}
Fix applied: {what was done}
Post-mortem: {link or "scheduled for {date}"}
```

---

## Post-Incident Review Template

Complete within 48 hours for P0/P1, one week for P2.

```markdown
## Post-Incident Review — {date} — {short title}

**Severity:** P{N}
**Duration:** {start time} → {end time} ({total duration})
**Impact:** {who was affected and how}
**Detected by:** {monitoring alert | customer report | engineer}

### Timeline
- HH:MM — {event}
- HH:MM — {event}
- HH:MM — Resolved

### Root Cause
{2-3 sentences describing the technical root cause}

### Contributing Factors
- {factor 1}
- {factor 2}

### What Went Well
- {thing 1}
- {thing 2}

### What Went Poorly
- {thing 1}
- {thing 2}

### Action Items
| Action | Owner | Due date |
|---|---|---|
| {action} | {name} | {date} |
```
