# AGENTS.md

## Repo overview

BabiesPicks — AI-powered Saudi baby product review platform. pnpm 10 + Turborepo monorepo, Node 22+.

| App / Package | Path | Stack |
|---|---|---|
| **web** | `apps/web` | Next.js 16, Tailwind CSS 4, next-intl (ar/en, default ar, RTL) |
| **api** | `apps/api` | NestJS 11, Prisma 6, PostgreSQL 16, SWC builder |
| shared-types | `packages/shared-types` | TypeScript types shared across apps |
| ui | `packages/ui` | Shared UI components |
| config | `packages/config` | ESLint / TSConfig presets (placeholder) |

## Commands

```bash
pnpm install                          # install all deps
pnpm turbo dev                        # web :3000 + api :3001
pnpm turbo build                      # build all
pnpm turbo lint                       # lint all
pnpm turbo test                       # vitest (globals: true)
pnpm turbo type-check                 # tsc --noEmit per app

# Single app
pnpm turbo dev --filter=@babiespicks/web
pnpm turbo dev --filter=@babiespicks/api
pnpm turbo build --filter=@babiespicks/api

# Prisma (run from apps/api)
cd apps/api
pnpm exec prisma generate             # after schema changes
pnpm exec prisma migrate dev          # create migration
pnpm exec prisma db push              # push schema without migration
pnpm exec prisma studio               # GUI browser

# Seed
cd apps/api && npx ts-node src/seed.ts
```

## Architecture

**Vertical Slice Architecture** — each feature is self-contained with its own module, controller, service, DTOs, and tests.

### API structure (`apps/api/src/`)

```
features/          → Business slices
  products/        → CRUD, cursor pagination, locale-aware includes
  affiliate/       → Click tracking
  search/          → Product search
  categories/      → Category tree
  content/         → ContentPage (best-lists, reviews, guides)
  coupons/         → Store coupons
  cron/            → Scheduled jobs (@nestjs/schedule)
  newsletter/      → Email collection (Resend)
  auth/            → better-auth
  stores/          → Store management
  verdicts/        → AI verdict data

agents/            → AI pipeline slices
  coordinator/     → Orchestrates the pipeline
  data-acquisition/→ Scrapes product data (Cheerio)
  review-analyzer/ → Analyzes reviews via AI
  verdict-engine/  → Scores products on 5 axes
  content-writer/  → Generates bilingual content
  quality-guard/   → Validates AI output
  publisher/       → Publishes to channels

infrastructure/    → Shared services
  database/        → PrismaService (@Global)
  openrouter/      → OpenRouter AI client (OpenAI SDK)
  queue/           → BullMQ (placeholder)
```

### Web structure (`apps/web/src/`)

```
app/
  [locale]/        → next-intl dynamic locale (ar|en)
    products/      → Product pages
    categories/    → Category pages
    best/          → Best-of lists
    search/        → Search
    about/, privacy/, terms/  → Static pages
    admin/         → Admin section
shared/
  components/      → Reusable components (site-header, verdict-pill, sar-price, etc.)
  hooks/           → Custom hooks
  lib/             → API client, GlitchTip init
i18n/              → next-intl config (routing.ts, request.ts, navigation.ts)
styles/            → Additional styles
```

## Key conventions

- **i18n**: Arabic is default locale. All routes are `/(ar|en)/...` with `localePrefix: 'always'`. Translation files in `apps/web/messages/{ar,en}.json`.
- **RTL**: Layout flips via `dir="rtl"` on `<html>`. Use `.flip-x` class for icons. Currency uses `.sar` class with `direction: ltr; unicode-bidi: isolate`.
- **Path alias**: Web uses `@/*` → `./src/*`. API uses relative imports.
- **Prisma**: Schema at `apps/api/prisma/schema.prisma`. No migrations directory yet — using `db push`. Run `prisma generate` after any schema change before building.
- **Database access**: `PrismaService` is `@Global()` — inject it anywhere without importing `DatabaseModule`.
- **AI models**: Via OpenRouter SDK (`@openrouter/sdk` + `openai` client). Models: Claude Sonnet 4, Gemini Flash, GLM-4.5-Air.
- **Validation**: NestJS `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform` enabled globally.
- **Rate limiting**: ThrottlerGuard applied globally — 3/sec, 100/min, 1000/hr.
- **Tests**: Vitest with `globals: true`. Test files at `__tests__/*.spec.ts` inside each feature. Tests are minimal stubs currently.
- **Fonts**: IBM Plex Sans Arabic (Arabic) + Inter (Latin), loaded via Google Fonts CDN.
- **Icons**: Tabler Icons via webfont CDN.
- **Design tokens**: Defined as CSS custom properties in `apps/web/src/app/globals.css` using Tailwind v4 `@theme` block. Key colors: sage, cream, charcoal, terracotta, lavender. Verdict colors map to verdict types.

## Database

Local dev requires SSH tunnel to remote PostgreSQL:
```bash
ssh -f -N -L 5433:localhost:54320 deqah
```

Env file: `apps/api/.env` (copy from `apps/api/.env.example` or root `.env.example`). Key vars: `DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`, `BETTER_AUTH_SECRET`, `GLITCHTIP_DSN`.

## Deployment

Auto-deploy on push to `main` via Dokploy.

- Web: `infrastructure/docker/Dockerfile.web` → standalone Next.js output, port 3000
- API: `infrastructure/docker/Dockerfile.api` → NestJS dist, port 3001
- Monitoring: GlitchTip at `https://errors.webvue.pro` (Sentry-compatible)

## AI pipeline

```
URL → DataAcquisition → ReviewAnalyzer → VerdictEngine → Publisher
                                          ContentWriter → QualityGuard → Publisher
```

Verdict scoring: Safety 25%, Quality 25%, Reviews 20%, Price 15%, Long-term Value 15%.
Verdict types: WORTH_IT (≥7.5), WORTH_IT_WITH (6.0-7.4), WAIT (4.5-5.9), NOT_WORTH_IT (<4.5).

## Gotchas

- API uses **CommonJS** (`module: "commonjs"`) with decorators — not ESM. Web uses ESM/bundler resolution.
- NestJS builds with **SWC** (`nest-cli.json` → `builder: "swc"`), not tsc.
- `apps/api/.env` is gitignored separately (line 39 of `.gitignore`). The root `.env.example` has all vars.
- Tailwind v4 — no `tailwind.config.js`. All config is in `globals.css` `@theme` block and `postcss.config.mjs`.
- `output: 'standalone'` in Next.js config — the Docker build copies from `.next/standalone`.
- CORS allows `babiespicks.com`, `www.babiespicks.com`, and `localhost:3000`.
