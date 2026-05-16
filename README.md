# BabiesPicks

> منصة سعودية ذكية لمراجعة منتجات الأمومة والطفل بالذكاء الاصطناعي

**AI-powered Saudi baby product review platform**

## Live

- **Website:** https://babiespicks.com
- **API:** https://api.babiespicks.com
- **Errors:** https://errors.webvue.pro (GlitchTip)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, Tailwind CSS 4, next-intl |
| Backend | NestJS 11, Prisma 6, PostgreSQL 16 |
| AI | OpenRouter (Claude Sonnet 4, Gemini Flash, GLM-4.5-Air) |
| Infra | Dokploy, Cloudflare, Docker |
| Monitoring | GlitchTip (Sentry-compatible) |

## Architecture

**Vertical Slice Architecture** — each feature is self-contained.

```
apps/
  web/          → Next.js frontend (RTL Arabic + English)
  api/          → NestJS backend
    src/
      features/   → Business slices (products, search, affiliate, auth, cron)
      agents/     → AI agent slices (data-acquisition, review-analyzer, verdict-engine, content-writer, quality-guard, publisher, coordinator)
      infrastructure/ → Shared (database, openrouter, queue)
packages/
  shared-types/ → TypeScript types
  ui/           → Shared components
  config/       → ESLint, TSConfig
```

## Quick Start

```bash
# Prerequisites: Node 22+, pnpm 10+
git clone https://github.com/tariiq222/babiespicks.git
cd babiespicks
pnpm install

# Setup SSH tunnel to DB (needed for local dev)
ssh -f -N -L 5433:localhost:54320 deqah

# Copy env
cp apps/api/.env.example apps/api/.env
# Edit .env with your DATABASE_URL and OPENROUTER_API_KEY

# Run dev
pnpm turbo dev
# Frontend: http://localhost:3000
# API: http://localhost:3001
```

## AI Pipeline

```
URL → DataAcquisition → ReviewAnalyzer → VerdictEngine → Publisher
                                          ContentWriter → QualityGuard → Publisher
```

**Verdict Types:**
- 🟢 WORTH_IT (≥7.5/10)
- 🟡 WORTH_IT_WITH (6.0-7.4, with conditions)
- 🟣 WAIT (4.5-5.9)
- 🔴 NOT_WORTH_IT (<4.5)

**5 Axes:** Safety (25%), Quality (25%), Reviews (20%), Price (15%), Long-term Value (15%)

## Deployment

Auto-deployed via Dokploy on push to `main`.

- Web: `infrastructure/docker/Dockerfile.web`
- API: `infrastructure/docker/Dockerfile.api`

## Database

20 products, 15 content pages, 6 categories, 4 stores.

```bash
# Seed data
cd apps/api && npx ts-node src/seed.ts

# Backup (runs daily at 4 AM on server)
ssh deqah "/etc/dokploy/scripts/backup-babiespicks.sh"
```

## License

Private. © 2026 BabiesPicks.
