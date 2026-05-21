---
name: babiespicks-security-guidance
description: Use when reviewing or planning security-sensitive BabiesPicks changes involving NestJS, Prisma, authentication, validation, secrets, PII, or external integrations.
---

# BabiesPicks security guidance

Use this skill for security-sensitive BabiesPicks work. It is advisory and review-focused; it does not install hooks or run enforcement automatically.

## Project security context

- API: NestJS 11 with global `ValidationPipe` using whitelist, forbidden non-whitelisted fields, and transform.
- Database: Prisma with PostgreSQL.
- Auth: better-auth.
- Rate limiting: Nest throttler guard globally.
- Monitoring: GlitchTip/Sentry-compatible DSN.
- External services: OpenRouter/OpenAI SDK, Resend, scraping via Cheerio, Redis/BullMQ placeholder.

## Security checklist

1. Validate all external input through DTOs, route params, query parsing, or schema guards.
2. Never trust tenant, user, role, or privileged identity from the request body.
3. Keep secrets in env or keychain; never hardcode or echo tokens, DSNs, API keys, cookies, or database URLs.
4. Avoid PII in logs, errors, analytics, prompts, or monitoring breadcrumbs.
5. Use safe Prisma query patterns; avoid raw SQL unless parameterized and justified.
6. Ensure authz checks are colocated with sensitive business operations.
7. Keep CORS scoped to approved origins.
8. Treat scraping and external AI calls as untrusted boundaries: rate-limit, timeout, validate, and sanitize outputs.
9. For generated content, avoid unsupported medical/safety claims about baby products.
10. For file, URL, or webhook-like features, check SSRF, path traversal, size limits, and content-type validation.

## Red flags

- `eval`, dynamic code execution, unsafe HTML insertion, or unsanitized markdown rendering.
- Raw SQL string interpolation.
- Secrets in repository files, test fixtures, logs, or prompts.
- Catch blocks that hide security-relevant failures.
- Public endpoints that expose admin or ingestion capabilities.

## Output

Use severity-graded findings:

- HIGH: exploitable vulnerability, secret exposure, auth/authz bypass, PII leak.
- MEDIUM: defense gap or risky pattern requiring remediation.
- LOW: hardening recommendation.

Include exact file references when available and a minimal safe remediation.
