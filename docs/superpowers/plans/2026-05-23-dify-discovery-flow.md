# Dify Discovery Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a Dify Workflow as an external orchestrator that calls a new `apps/api/src/features/dify-orchestration/` slice in the NestJS API, so trend-discovered baby products land as `PENDING_APPROVAL` drafts visible in the admin panel.

**Architecture:** NestJS exposes three guarded HTTP endpoints (`health`, `marketplace-search`, `process-product`) under `/agents/dify/`. Dify workflow calls them with `X-Dify-Token` + `X-Idempotency-Key`. All persistence stays in NestJS; Dify owns prompts and routing only. New columns on `content_pages` (`discovery_source`, `trend_score`, `dify_run_id`) plus new `dify_runs` table record provenance.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 16, vitest, Dify 1.14 (workflow YAML import), pnpm + Turborepo.

**Spec:** `docs/superpowers/specs/2026-05-23-dify-discovery-flow-design.md`

---

## File Structure

### Create
- `apps/api/src/features/dify-orchestration/dify-orchestration.module.ts`
- `apps/api/src/features/dify-orchestration/dify-orchestration.controller.ts`
- `apps/api/src/features/dify-orchestration/dify-orchestration.service.ts`
- `apps/api/src/features/dify-orchestration/dify-auth.guard.ts`
- `apps/api/src/features/dify-orchestration/idempotency.interceptor.ts`
- `apps/api/src/features/dify-orchestration/dto/marketplace-search.dto.ts`
- `apps/api/src/features/dify-orchestration/dto/process-product.dto.ts`
- `apps/api/src/features/dify-orchestration/dto/dify-response.ts`
- `apps/api/src/features/dify-orchestration/__tests__/dify-auth.guard.spec.ts`
- `apps/api/src/features/dify-orchestration/__tests__/idempotency.interceptor.spec.ts`
- `apps/api/src/features/dify-orchestration/__tests__/dify-orchestration.controller.spec.ts`
- `apps/api/src/features/dify-orchestration/__tests__/dify-orchestration.service.spec.ts`
- `apps/api/prisma/migrations/<timestamp>_dify_discovery_columns/migration.sql`
- `infrastructure/dify/discovery-flow.yml` (Dify workflow DSL, importable)
- `infrastructure/dify/README.md` (how to import + env vars to set in Dify)

### Modify
- `apps/api/src/app.module.ts` — register `DifyOrchestrationModule`
- `apps/api/prisma/schema.prisma` — add columns + `DifyRun` model
- `apps/api/.env.example` — add `DIFY_API_TOKEN`
- `infrastructure/.env.example` (root) — same

### Test
- All `*.spec.ts` files under `apps/api/src/features/dify-orchestration/__tests__/`

---

## Task 1: Add Prisma Schema for Discovery Provenance

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_dify_discovery_columns/migration.sql` (generated)

- [ ] **Step 1: Add columns + new model to schema.prisma**

Find the `model ContentPage` block and add the three columns at the bottom of its scalar list (before relations):

```prisma
model ContentPage {
  // ... existing fields ...
  discoverySource  String?    @map("discovery_source")
  trendScore       Int?       @map("trend_score")  @db.SmallInt
  difyRunId        String?    @map("dify_run_id")  @db.Uuid
  difyRun          DifyRun?   @relation(fields: [difyRunId], references: [id])

  @@index([difyRunId])
}
```

At the end of the file, add the `DifyRun` model:

```prisma
model DifyRun {
  id                  String        @id @default(uuid()) @db.Uuid
  startedAt           DateTime      @default(now()) @map("started_at")
  finishedAt          DateTime?     @map("finished_at")
  totalCandidates     Int           @default(0)     @map("total_candidates")
  succeeded           Int           @default(0)
  failed              Int           @default(0)
  triggeredBy         String        @map("triggered_by")
  triggeredByUserId   String?       @map("triggered_by_user_id") @db.Uuid
  error               Json?
  contentPages        ContentPage[]

  @@map("dify_runs")
  @@index([startedAt])
}
```

- [ ] **Step 2: Generate migration (do not apply yet)**

Run: `cd apps/api && pnpm prisma:migrate:create --name dify_discovery_columns`
Expected: New folder `prisma/migrations/<ts>_dify_discovery_columns/` with `migration.sql` containing `ALTER TABLE content_pages ADD COLUMN ...` and `CREATE TABLE dify_runs ...`.

- [ ] **Step 3: Review the generated migration**

Open the new `migration.sql` and confirm:
- Three `ALTER TABLE content_pages ADD COLUMN` statements (nullable, no default).
- `CREATE TABLE dify_runs` with all columns from the model.
- Foreign key on `content_pages.dify_run_id`.
- Two `CREATE INDEX` statements.

No edits needed if the above is present.

- [ ] **Step 4: Apply migration locally**

Run: `cd apps/api && pnpm prisma:migrate`
Expected: `Database migration successful` and `Generated Prisma Client`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add dify discovery columns and dify_runs table"
```

---

## Task 2: Module Skeleton + Module Registration

**Files:**
- Create: `apps/api/src/features/dify-orchestration/dify-orchestration.module.ts`
- Create: `apps/api/src/features/dify-orchestration/dify-orchestration.controller.ts`
- Create: `apps/api/src/features/dify-orchestration/dify-orchestration.service.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the empty service**

`apps/api/src/features/dify-orchestration/dify-orchestration.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class DifyOrchestrationService {
  private readonly logger = new Logger(DifyOrchestrationService.name);

  constructor(private readonly prisma: PrismaService) {}
}
```

- [ ] **Step 2: Create the empty controller**

`apps/api/src/features/dify-orchestration/dify-orchestration.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { DifyOrchestrationService } from './dify-orchestration.service';

@Controller('agents/dify')
export class DifyOrchestrationController {
  constructor(private readonly service: DifyOrchestrationService) {}

  @Get('health')
  health() {
    return { ok: true };
  }
}
```

- [ ] **Step 3: Create the module**

`apps/api/src/features/dify-orchestration/dify-orchestration.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { DifyOrchestrationController } from './dify-orchestration.controller';
import { DifyOrchestrationService } from './dify-orchestration.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DifyOrchestrationController],
  providers: [DifyOrchestrationService],
})
export class DifyOrchestrationModule {}
```

- [ ] **Step 4: Register module in app.module.ts**

Open `apps/api/src/app.module.ts`. Find the `imports:` array of `@Module(...)` and add `DifyOrchestrationModule` at the end. Also add the import line at the top:

```typescript
import { DifyOrchestrationModule } from './features/dify-orchestration/dify-orchestration.module';
```

- [ ] **Step 5: Verify build**

Run: `cd apps/api && pnpm type-check`
Expected: no TypeScript errors.

Run: `cd apps/api && pnpm build`
Expected: build succeeds.

- [ ] **Step 6: Smoke-check the health endpoint**

Run in one shell: `cd apps/api && pnpm dev`
In another shell: `curl -s http://localhost:3001/agents/dify/health`
Expected: `{"ok":true}`
Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/features/dify-orchestration apps/api/src/app.module.ts
git commit -m "feat(dify): module skeleton with /agents/dify/health endpoint"
```

---

## Task 3: Dify Auth Guard (TDD)

**Files:**
- Create: `apps/api/src/features/dify-orchestration/dify-auth.guard.ts`
- Create: `apps/api/src/features/dify-orchestration/__tests__/dify-auth.guard.spec.ts`
- Modify: `apps/api/src/features/dify-orchestration/dify-orchestration.controller.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Write the failing test**

`apps/api/src/features/dify-orchestration/__tests__/dify-auth.guard.spec.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DifyAuthGuard } from '../dify-auth.guard';

function mockContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('DifyAuthGuard', () => {
  const guard = new DifyAuthGuard();
  const ORIGINAL = process.env.DIFY_API_TOKEN;

  beforeEach(() => {
    process.env.DIFY_API_TOKEN = 'test-token-123';
  });

  afterEach(() => {
    process.env.DIFY_API_TOKEN = ORIGINAL;
  });

  it('allows requests with the correct token', () => {
    expect(guard.canActivate(mockContext({ 'x-dify-token': 'test-token-123' }))).toBe(true);
  });

  it('rejects requests with a wrong token', () => {
    expect(() => guard.canActivate(mockContext({ 'x-dify-token': 'wrong' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests without the header', () => {
    expect(() => guard.canActivate(mockContext({}))).toThrow(UnauthorizedException);
  });

  it('rejects when DIFY_API_TOKEN is unset in production', () => {
    delete process.env.DIFY_API_TOKEN;
    process.env.NODE_ENV = 'production';
    expect(() => guard.canActivate(mockContext({ 'x-dify-token': 'anything' }))).toThrow(
      UnauthorizedException,
    );
    process.env.NODE_ENV = 'test';
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- dify-auth.guard.spec`
Expected: FAIL with `Cannot find module '../dify-auth.guard'`.

- [ ] **Step 3: Implement the guard**

`apps/api/src/features/dify-orchestration/dify-auth.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

type HeaderValue = string | string[] | undefined;
type HttpHeaders = Record<string, HeaderValue>;

@Injectable()
export class DifyAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: HttpHeaders }>();
    const expected = process.env.DIFY_API_TOKEN;

    if (!expected) {
      throw new UnauthorizedException('DIFY_API_TOKEN not configured');
    }

    const provided = this.readHeader(request.headers, 'x-dify-token');
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid Dify token');
    }
    return true;
  }

  private readHeader(headers: HttpHeaders, name: string): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0]?.trim() : value?.trim();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- dify-auth.guard.spec`
Expected: 4 tests PASS.

- [ ] **Step 5: Attach the guard to the controller**

Modify `apps/api/src/features/dify-orchestration/dify-orchestration.controller.ts`:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';

@Controller('agents/dify')
export class DifyOrchestrationController {
  constructor(private readonly service: DifyOrchestrationService) {}

  // health is intentionally unauthenticated (used as Dify pre-flight probe).
  @Get('health')
  health() {
    return { ok: true };
  }
}

@Controller('agents/dify')
@UseGuards(DifyAuthGuard)
export class DifyOrchestrationGuardedController {
  constructor(private readonly service: DifyOrchestrationService) {}
}
```

Update the module to include the new controller:

```typescript
controllers: [DifyOrchestrationController, DifyOrchestrationGuardedController],
```

(Add `DifyAuthGuard` to providers as well.)

- [ ] **Step 6: Add env var documentation**

Edit `apps/api/.env.example` (create the section at the bottom if missing):

```
# Dify orchestration
DIFY_API_TOKEN=<generate with: openssl rand -hex 32>
```

- [ ] **Step 7: Type-check**

Run: `cd apps/api && pnpm type-check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/features/dify-orchestration apps/api/.env.example
git commit -m "feat(dify): X-Dify-Token auth guard with tests"
```

---

## Task 4: Idempotency Interceptor (TDD)

**Files:**
- Create: `apps/api/src/features/dify-orchestration/idempotency.interceptor.ts`
- Create: `apps/api/src/features/dify-orchestration/__tests__/idempotency.interceptor.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/features/dify-orchestration/__tests__/idempotency.interceptor.spec.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { CallHandler, ExecutionContext, BadRequestException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from '../idempotency.interceptor';

function mockContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, url: '/test', method: 'POST' }),
    }),
  } as unknown as ExecutionContext;
}

function mockHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    interceptor = new IdempotencyInterceptor();
  });

  it('passes through when key is present (first call)', async () => {
    const ctx = mockContext({ 'x-idempotency-key': 'abc-123' });
    const result = await firstValueFrom(interceptor.intercept(ctx, mockHandler({ ok: true, id: 1 })));
    expect(result).toEqual({ ok: true, id: 1 });
  });

  it('returns cached response on repeat call with same key', async () => {
    const key = 'abc-456';
    await firstValueFrom(interceptor.intercept(mockContext({ 'x-idempotency-key': key }), mockHandler({ ok: true, id: 7 })));
    const second = await firstValueFrom(
      interceptor.intercept(mockContext({ 'x-idempotency-key': key }), mockHandler({ ok: true, id: 999 })),
    );
    expect(second).toEqual({ ok: true, id: 7 });
  });

  it('rejects when header missing', async () => {
    await expect(
      firstValueFrom(interceptor.intercept(mockContext({}), mockHandler({}))),
    ).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- idempotency.interceptor.spec`
Expected: FAIL with `Cannot find module '../idempotency.interceptor'`.

- [ ] **Step 3: Implement the interceptor**

`apps/api/src/features/dify-orchestration/idempotency.interceptor.ts`:

```typescript
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

type CacheEntry = { value: unknown; expiresAt: number };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  // In-memory cache. For multi-instance deploys this should be Redis-backed,
  // but a single NestJS instance is the current production topology.
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 60 * 60 * 1000; // 1h

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const rawKey = request.headers['x-idempotency-key'] ?? request.headers['X-Idempotency-Key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key || typeof key !== 'string' || key.length < 8) {
      throw new BadRequestException('X-Idempotency-Key header required (min 8 chars)');
    }

    const now = Date.now();
    this.purgeExpired(now);

    const cached = this.cache.get(key);
    if (cached) {
      return of(cached.value);
    }

    return next.handle().pipe(
      tap((value) => {
        this.cache.set(key, { value, expiresAt: now + this.TTL_MS });
      }),
    );
  }

  private purgeExpired(now: number): void {
    for (const [k, entry] of this.cache) {
      if (entry.expiresAt < now) this.cache.delete(k);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- idempotency.interceptor.spec`
Expected: 3 tests PASS.

- [ ] **Step 5: Register interceptor in module**

In `dify-orchestration.module.ts`, add to providers:

```typescript
providers: [DifyOrchestrationService, DifyAuthGuard, IdempotencyInterceptor],
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/features/dify-orchestration
git commit -m "feat(dify): idempotency interceptor with in-memory cache"
```

---

## Task 5: Response Helper + DTOs

**Files:**
- Create: `apps/api/src/features/dify-orchestration/dto/dify-response.ts`
- Create: `apps/api/src/features/dify-orchestration/dto/marketplace-search.dto.ts`
- Create: `apps/api/src/features/dify-orchestration/dto/process-product.dto.ts`

- [ ] **Step 1: Create the unified response helper**

`apps/api/src/features/dify-orchestration/dto/dify-response.ts`:

```typescript
export type DifyOk<T> = { ok: true; data: T };
export type DifyErr = {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};
export type DifyResponse<T> = DifyOk<T> | DifyErr;

export function ok<T>(data: T): DifyOk<T> {
  return { ok: true, data };
}

export function err(code: string, message: string, retryable = false): DifyErr {
  return { ok: false, error: { code, message, retryable } };
}
```

- [ ] **Step 2: Marketplace search DTO**

`apps/api/src/features/dify-orchestration/dto/marketplace-search.dto.ts`:

```typescript
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class MarketplaceSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export interface MarketplaceSearchResult {
  url: string;
  platform: 'noon' | 'amazon';
  sku: string | null;
  available: boolean;
  existing_product_id?: string;
}
```

- [ ] **Step 3: Process product DTO**

`apps/api/src/features/dify-orchestration/dto/process-product.dto.ts`:

```typescript
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class ProcessProductDto {
  @IsUrl({ require_tld: true, require_protocol: true })
  url!: string;

  @IsIn(['noon', 'amazon'])
  platform!: 'noon' | 'amazon';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  trend_score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  discovery_reason?: string;

  @IsOptional()
  @IsString()
  dify_run_id?: string;
}

export interface ProcessProductResult {
  product_id: string;
  content_page_id: string | null;
  status: string;
  summary: {
    acquisition: string;
    reviews: string;
    verdict: string;
    publish: string;
    time_ms: number;
  };
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/api && pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/features/dify-orchestration/dto
git commit -m "feat(dify): unified response helper + request DTOs"
```

---

## Task 6: Service — Marketplace Search (TDD)

**Files:**
- Modify: `apps/api/src/features/dify-orchestration/dify-orchestration.service.ts`
- Create: `apps/api/src/features/dify-orchestration/__tests__/dify-orchestration.service.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/features/dify-orchestration/__tests__/dify-orchestration.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DifyOrchestrationService } from '../dify-orchestration.service';

describe('DifyOrchestrationService.searchMarketplace', () => {
  let service: DifyOrchestrationService;
  let prisma: { product: { findFirst: ReturnType<typeof vi.fn> } };
  let discovery: { findOnMarketplace: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { product: { findFirst: vi.fn() } };
    discovery = { findOnMarketplace: vi.fn() };
    service = new DifyOrchestrationService(prisma as never, discovery as never);
  });

  it('returns existing_product_id when product already in DB', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-existing' });

    const result = await service.searchMarketplace({ name: 'Stokke Tripp Trapp' });

    expect(result).toMatchObject({
      url: expect.any(String),
      platform: expect.any(String),
      available: true,
      existing_product_id: 'prod-existing',
    });
    expect(discovery.findOnMarketplace).not.toHaveBeenCalled();
  });

  it('queries marketplace when product not in DB', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    discovery.findOnMarketplace.mockResolvedValue({
      url: 'https://www.noon.com/saudi-en/abc/p',
      platform: 'noon',
      sku: 'abc',
      available: true,
    });

    const result = await service.searchMarketplace({ name: 'New Product' });

    expect(result.available).toBe(true);
    expect(result.platform).toBe('noon');
    expect(result.existing_product_id).toBeUndefined();
  });

  it('returns available=false when nothing found', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    discovery.findOnMarketplace.mockResolvedValue(null);

    const result = await service.searchMarketplace({ name: 'Nonexistent' });

    expect(result.available).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- dify-orchestration.service.spec`
Expected: FAIL because `searchMarketplace` does not yet exist on the service.

- [ ] **Step 3: Implement `searchMarketplace` in the service**

Replace `apps/api/src/features/dify-orchestration/dify-orchestration.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DiscoveryService } from '../../agents/discovery/discovery.service';
import {
  MarketplaceSearchDto,
  MarketplaceSearchResult,
} from './dto/marketplace-search.dto';

@Injectable()
export class DifyOrchestrationService {
  private readonly logger = new Logger(DifyOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
  ) {}

  async searchMarketplace(dto: MarketplaceSearchDto): Promise<MarketplaceSearchResult> {
    const normalized = dto.name.toLowerCase().trim();

    const existing = await this.prisma.product.findFirst({
      where: { name: { contains: normalized, mode: 'insensitive' } },
      select: { id: true, sourceUrl: true, store: { select: { slug: true } } },
    });

    if (existing) {
      this.logger.log(`Marketplace search hit existing product ${existing.id}`);
      return {
        url: existing.sourceUrl ?? '',
        platform: (existing.store?.slug === 'amazon' ? 'amazon' : 'noon') as 'noon' | 'amazon',
        sku: null,
        available: true,
        existing_product_id: existing.id,
      };
    }

    const found = await this.discovery.findOnMarketplace(dto.name, dto.category);
    if (!found) {
      return { url: '', platform: 'noon', sku: null, available: false };
    }
    return { ...found, available: true };
  }
}
```

> **Note for engineer**: `discovery.findOnMarketplace` is a NEW method on `DiscoveryService`. The next task adds it. The test mocks it, so this task can pass without `DiscoveryService` having the method yet — but type-check will fail. Add a temporary type cast `(this.discovery as any).findOnMarketplace(...)` if needed, OR proceed to Task 7 first if you want type-check to stay clean. Recommended: proceed to Task 7 immediately after.

- [ ] **Step 4: Run service tests**

Run: `cd apps/api && pnpm test -- dify-orchestration.service.spec`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/features/dify-orchestration
git commit -m "feat(dify): searchMarketplace dedups against existing products"
```

---

## Task 7: Extend DiscoveryService with `findOnMarketplace`

**Files:**
- Modify: `apps/api/src/agents/discovery/discovery.service.ts`
- Create: `apps/api/src/agents/discovery/__tests__/find-on-marketplace.spec.ts`
- Modify: `apps/api/src/features/dify-orchestration/dify-orchestration.module.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/agents/discovery/__tests__/find-on-marketplace.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryService } from '../discovery.service';

describe('DiscoveryService.findOnMarketplace', () => {
  it('returns first matching candidate from Noon strategy', async () => {
    const noonStrategy = {
      discover: vi.fn().mockResolvedValue([
        { name: 'Stokke Tripp Trapp', url: 'https://noon.com/x', source: 'noon-search', score: 8 },
      ]),
    };
    const amazonStrategy = { discover: vi.fn().mockResolvedValue([]) };
    const service = new DiscoveryService(
      { trendSignal: {} } as never, // prisma not used here
      noonStrategy as never,
      amazonStrategy as never,
    );

    const result = await service.findOnMarketplace('Stokke Tripp Trapp');

    expect(result).toEqual({
      url: 'https://noon.com/x',
      platform: 'noon',
      sku: null,
      available: true,
    });
    expect(amazonStrategy.discover).not.toHaveBeenCalled();
  });

  it('falls back to Amazon when Noon returns nothing', async () => {
    const noonStrategy = { discover: vi.fn().mockResolvedValue([]) };
    const amazonStrategy = {
      discover: vi.fn().mockResolvedValue([
        { name: 'X', url: 'https://amazon.sa/x', source: 'amazon-search', score: 7 },
      ]),
    };
    const service = new DiscoveryService(
      { trendSignal: {} } as never,
      noonStrategy as never,
      amazonStrategy as never,
    );

    const result = await service.findOnMarketplace('X');
    expect(result?.platform).toBe('amazon');
  });

  it('returns null when neither has a match', async () => {
    const service = new DiscoveryService(
      { trendSignal: {} } as never,
      { discover: vi.fn().mockResolvedValue([]) } as never,
      { discover: vi.fn().mockResolvedValue([]) } as never,
    );
    expect(await service.findOnMarketplace('nothing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test -- find-on-marketplace.spec`
Expected: FAIL because `findOnMarketplace` does not yet exist.

> **Note:** The test constructs `DiscoveryService` with three positional arguments. If the real constructor takes different positional args, adapt the test to match — the goal is to inject mock strategies for `noon` and `amazon` paths. Inspect `discovery.service.ts` and either match its signature or refactor it to accept injected strategies.

- [ ] **Step 3: Add `findOnMarketplace` to DiscoveryService**

Open `apps/api/src/agents/discovery/discovery.service.ts`. Inside the class (next to `discoverProducts`), add:

```typescript
async findOnMarketplace(
  name: string,
  category?: string,
): Promise<{ url: string; platform: 'noon' | 'amazon'; sku: string | null } | null> {
  const noonResults = await this.noonStrategy.discover({ query: name, category, limit: 1 });
  if (noonResults.length > 0) {
    return { url: noonResults[0].url, platform: 'noon', sku: null };
  }
  const amazonResults = await this.amazonStrategy.discover({ query: name, category, limit: 1 });
  if (amazonResults.length > 0) {
    return { url: amazonResults[0].url, platform: 'amazon', sku: null };
  }
  return null;
}
```

If the existing strategies do not yet accept a `query` parameter, add a minimal `discover({ query })` overload — or use an existing `searchByName` method if one already exists. The engineer should inspect `apps/api/src/agents/discovery/strategies/` and reuse what's there; only introduce a new method if necessary.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd apps/api && pnpm test -- find-on-marketplace.spec`
Expected: 3 tests PASS.

- [ ] **Step 5: Export DiscoveryModule from dify-orchestration**

In `dify-orchestration.module.ts`, import DiscoveryModule so DI works:

```typescript
import { DiscoveryModule } from '../../agents/discovery/discovery.module';

@Module({
  imports: [DatabaseModule, DiscoveryModule],
  ...
})
```

Make sure `DiscoveryModule` exports `DiscoveryService` (add `exports: [DiscoveryService]` to its `@Module` if not already).

- [ ] **Step 6: Type-check + commit**

Run: `cd apps/api && pnpm type-check`
Expected: no errors.

```bash
git add apps/api/src/agents/discovery apps/api/src/features/dify-orchestration
git commit -m "feat(discovery): findOnMarketplace helper with Noon-then-Amazon fallback"
```

---

## Task 8: Service — Process Product (TDD)

**Files:**
- Modify: `apps/api/src/features/dify-orchestration/dify-orchestration.service.ts`
- Modify: `apps/api/src/features/dify-orchestration/dify-orchestration.module.ts`
- Append to test file: `apps/api/src/features/dify-orchestration/__tests__/dify-orchestration.service.spec.ts`

- [ ] **Step 1: Append failing tests**

In `dify-orchestration.service.spec.ts`, add at the bottom:

```typescript
describe('DifyOrchestrationService.processProduct', () => {
  let service: DifyOrchestrationService;
  let coordinator: { runProductPipeline: ReturnType<typeof vi.fn> };
  let prisma: {
    product: { findFirst: ReturnType<typeof vi.fn> };
    contentPage: { update: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    coordinator = { runProductPipeline: vi.fn() };
    prisma = {
      product: { findFirst: vi.fn() },
      contentPage: {
        update: vi.fn().mockResolvedValue(undefined),
        findFirst: vi.fn().mockResolvedValue({ id: 'cp-1' }),
      },
    };
    service = new DifyOrchestrationService(prisma as never, {} as never, coordinator as never);
  });

  it('runs the existing product pipeline and tags discovery metadata', async () => {
    coordinator.runProductPipeline.mockResolvedValue({
      productId: 'prod-1',
      productName: 'Stokke',
      steps: { acquisition: 'success', reviews: 'success', verdict: 'success', publish: 'success' },
      totalTimeMs: 12345,
    });

    const result = await service.processProduct({
      url: 'https://noon.com/x',
      platform: 'noon',
      trend_score: 8,
      discovery_reason: 'Mentioned in 3 viral threads',
      dify_run_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(coordinator.runProductPipeline).toHaveBeenCalledWith('https://noon.com/x', 'noon', undefined);
    expect(prisma.contentPage.update).toHaveBeenCalledWith({
      where: { id: 'cp-1' },
      data: {
        discoverySource: 'dify-workflow',
        trendScore: 8,
        difyRunId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });
    expect(result.product_id).toBe('prod-1');
    expect(result.status).toBe('PENDING_APPROVAL');
  });

  it('returns status FAILED if acquisition failed', async () => {
    coordinator.runProductPipeline.mockResolvedValue({
      productId: '',
      productName: '',
      steps: { acquisition: 'failed', reviews: 'skipped', verdict: 'failed', publish: 'failed' },
      totalTimeMs: 1000,
    });

    const result = await service.processProduct({ url: 'https://x', platform: 'noon' });

    expect(result.status).toBe('FAILED');
    expect(prisma.contentPage.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm test -- dify-orchestration.service.spec`
Expected: 2 new tests FAIL.

- [ ] **Step 3: Add processProduct to service**

In `dify-orchestration.service.ts`:

```typescript
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
import { ProcessProductDto, ProcessProductResult } from './dto/process-product.dto';

// Add to constructor:
constructor(
  private readonly prisma: PrismaService,
  private readonly discovery: DiscoveryService,
  private readonly coordinator: CoordinatorService,
) {}

async processProduct(dto: ProcessProductDto): Promise<ProcessProductResult> {
  const result = await this.coordinator.runProductPipeline(dto.url, dto.platform, undefined);
  const allSuccess =
    result.steps.acquisition === 'success' &&
    result.steps.verdict === 'success' &&
    result.steps.publish === 'success';

  if (allSuccess && result.productId) {
    const page = await this.prisma.contentPage.findFirst({
      where: { products: { some: { id: result.productId } } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (page) {
      await this.prisma.contentPage.update({
        where: { id: page.id },
        data: {
          discoverySource: 'dify-workflow',
          trendScore: dto.trend_score ?? null,
          difyRunId: dto.dify_run_id ?? null,
        },
      });
    }
  }

  return {
    product_id: result.productId,
    content_page_id: null, // populated above via update; not returned in this minimal version
    status: allSuccess ? 'PENDING_APPROVAL' : 'FAILED',
    summary: {
      acquisition: result.steps.acquisition,
      reviews: result.steps.reviews,
      verdict: result.steps.verdict,
      publish: result.steps.publish,
      time_ms: result.totalTimeMs,
    },
  };
}
```

> **Note on the relation:** The relation between `ContentPage` and `Product` may differ from `products: { some: { id } }`. If `ContentPage` references `Product` differently (e.g. via a `productIds` Json field or a join table), adapt this query — the engineer should consult `schema.prisma` first.

- [ ] **Step 4: Add CoordinatorModule to dify module**

In `dify-orchestration.module.ts`:

```typescript
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';

imports: [DatabaseModule, DiscoveryModule, CoordinatorModule],
```

Confirm `CoordinatorModule` exports `CoordinatorService`.

- [ ] **Step 5: Run tests**

Run: `cd apps/api && pnpm test -- dify-orchestration.service.spec`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/features/dify-orchestration apps/api/src/agents/coordinator
git commit -m "feat(dify): processProduct wraps runProductPipeline + tags discovery metadata"
```

---

## Task 9: Controller — Wire endpoints + tests

**Files:**
- Modify: `apps/api/src/features/dify-orchestration/dify-orchestration.controller.ts`
- Create: `apps/api/src/features/dify-orchestration/__tests__/dify-orchestration.controller.spec.ts`

- [ ] **Step 1: Write the failing controller test**

`apps/api/src/features/dify-orchestration/__tests__/dify-orchestration.controller.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DifyOrchestrationController, DifyOrchestrationGuardedController } from '../dify-orchestration.controller';

describe('DifyOrchestrationController', () => {
  it('health returns ok', () => {
    const ctrl = new DifyOrchestrationController({} as never);
    expect(ctrl.health()).toEqual({ ok: true });
  });
});

describe('DifyOrchestrationGuardedController', () => {
  let service: { searchMarketplace: ReturnType<typeof vi.fn>; processProduct: ReturnType<typeof vi.fn> };
  let ctrl: DifyOrchestrationGuardedController;

  beforeEach(() => {
    service = {
      searchMarketplace: vi.fn(),
      processProduct: vi.fn(),
    };
    ctrl = new DifyOrchestrationGuardedController(service as never);
  });

  it('marketplace-search returns wrapped ok response', async () => {
    service.searchMarketplace.mockResolvedValue({
      url: 'https://noon.com/x',
      platform: 'noon',
      sku: null,
      available: true,
    });

    const result = await ctrl.marketplaceSearch({ name: 'X' });

    expect(result).toEqual({
      ok: true,
      data: { url: 'https://noon.com/x', platform: 'noon', sku: null, available: true },
    });
  });

  it('process-product returns wrapped ok response', async () => {
    service.processProduct.mockResolvedValue({
      product_id: 'p1',
      content_page_id: null,
      status: 'PENDING_APPROVAL',
      summary: { acquisition: 'success', reviews: 'success', verdict: 'success', publish: 'success', time_ms: 100 },
    });

    const result = await ctrl.processProduct({ url: 'https://x', platform: 'noon' });

    expect(result.ok).toBe(true);
    expect((result as { ok: true; data: { status: string } }).data.status).toBe('PENDING_APPROVAL');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm test -- dify-orchestration.controller.spec`
Expected: FAIL because `marketplaceSearch` and `processProduct` methods do not exist.

- [ ] **Step 3: Add endpoints to the guarded controller**

Update `dify-orchestration.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { MarketplaceSearchDto } from './dto/marketplace-search.dto';
import { ProcessProductDto } from './dto/process-product.dto';
import { ok } from './dto/dify-response';

@Controller('agents/dify')
export class DifyOrchestrationController {
  constructor(private readonly service: DifyOrchestrationService) {}

  @Get('health')
  health() {
    return { ok: true };
  }
}

@Controller('agents/dify')
@UseGuards(DifyAuthGuard)
@UseInterceptors(IdempotencyInterceptor)
export class DifyOrchestrationGuardedController {
  constructor(private readonly service: DifyOrchestrationService) {}

  @Post('marketplace-search')
  async marketplaceSearch(@Body() dto: MarketplaceSearchDto) {
    return ok(await this.service.searchMarketplace(dto));
  }

  @Post('process-product')
  async processProduct(@Body() dto: ProcessProductDto) {
    return ok(await this.service.processProduct(dto));
  }
}
```

- [ ] **Step 4: Run controller tests**

Run: `cd apps/api && pnpm test -- dify-orchestration.controller.spec`
Expected: 3 tests PASS.

- [ ] **Step 5: Manual smoke test**

In one terminal: `cd apps/api && DIFY_API_TOKEN=test123 pnpm dev`

In another:

```bash
curl -s http://localhost:3001/agents/dify/health
# Expected: {"ok":true}

curl -s -X POST http://localhost:3001/agents/dify/marketplace-search \
  -H "Content-Type: application/json" \
  -H "X-Dify-Token: test123" \
  -H "X-Idempotency-Key: smoke-test-1" \
  -d '{"name":"Stokke Tripp Trapp"}'
# Expected: {"ok":true,"data":{...}}

curl -s -X POST http://localhost:3001/agents/dify/marketplace-search \
  -H "X-Dify-Token: wrong" \
  -H "X-Idempotency-Key: smoke-test-2" \
  -d '{"name":"X"}'
# Expected: 401 Unauthorized
```

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/features/dify-orchestration
git commit -m "feat(dify): wire marketplace-search + process-product endpoints"
```

---

## Task 10: Dify Workflow YAML

**Files:**
- Create: `infrastructure/dify/discovery-flow.yml`
- Create: `infrastructure/dify/README.md`

- [ ] **Step 1: Create the workflow YAML**

`infrastructure/dify/discovery-flow.yml`:

```yaml
app:
  name: babiespicks-discovery
  description: Discover trending baby products and run them through the BabiesPicks pipeline
  mode: workflow
  use_icon_as_answer_icon: false
kind: app
version: 0.1.4
workflow:
  graph:
    nodes:
      - id: start
        data:
          type: start
          title: Start
          variables:
            - variable: max_products
              type: number
              default: 10
              required: false
            - variable: triggered_by
              type: text-input
              default: manual
              required: false
        position: { x: 0, y: 0 }

      - id: health_check
        data:
          type: http-request
          title: NestJS health pre-flight
          method: GET
          url: "{{#env.NESTJS_BASE#}}/agents/dify/health"
          timeout: 5
        position: { x: 200, y: 0 }

      - id: tavily_search
        data:
          type: tool
          title: Trend search (Tavily)
          provider_name: langgenius/tavily/tavily
          tool_name: tavily_search
          tool_parameters:
            query: "trending baby products 2026 Saudi Arabia"
            max_results: 20
            search_depth: advanced
        position: { x: 400, y: 0 }

      - id: reddit_search
        data:
          type: tool
          title: Reddit hot threads
          provider_name: langgenius/reddit/reddit
          tool_name: reddit_search
          tool_parameters:
            subreddit: "Parenting+beyondthebump"
            sort: hot
            limit: 25
        position: { x: 400, y: 150 }

      - id: youtube_search
        data:
          type: tool
          title: YouTube reviews
          provider_name: langgenius/youtube/youtube
          tool_name: youtube_search
          tool_parameters:
            query: "best baby product 2026"
            max_results: 15
        position: { x: 400, y: 300 }

      - id: unify
        data:
          type: code
          title: Unify candidates
          code_language: python3
          code: |
            def main(tavily: list, reddit: list, youtube: list) -> dict:
                candidates = []
                for r in tavily or []:
                    candidates.append({"name": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", ""), "source": "tavily"})
                for r in reddit or []:
                    candidates.append({"name": r.get("title", ""), "url": r.get("permalink", ""), "snippet": r.get("selftext", "")[:300], "source": "reddit"})
                for r in youtube or []:
                    candidates.append({"name": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("description", "")[:300], "source": "youtube"})
                return {"candidates": candidates}
          variables:
            tavily: "{{#tavily_search.output#}}"
            reddit: "{{#reddit_search.output#}}"
            youtube: "{{#youtube_search.output#}}"
        position: { x: 600, y: 150 }

      - id: score
        data:
          type: llm
          title: Score & Rank
          model:
            provider: langgenius/openai_api_compatible/openai_api_compatible
            name: claude-sonnet-4-6
            mode: chat
            completion_params: { temperature: 0.3 }
          prompt_template:
            - role: system
              text: |
                You rank candidate baby/maternity products for the Saudi market.
                Return STRICT JSON: an array of up to 10 items.
                Each item: { "name": string, "trend_score": 0-10, "discovery_reason": string, "category": string }
                Skip generic categories. Skip duplicates. Prefer products mentioned across multiple sources.
            - role: user
              text: |
                Candidates:
                {{#unify.candidates#}}
        position: { x: 800, y: 150 }

      - id: loop_products
        data:
          type: iteration
          title: Per-product processing
          iterator_selector: "{{#score.output#}}"
          # body iterates Step 3 -> Step 7 for each item
        position: { x: 1000, y: 150 }

      - id: marketplace_search
        data:
          type: http-request
          title: Marketplace lookup
          method: POST
          url: "{{#env.NESTJS_BASE#}}/agents/dify/marketplace-search"
          headers:
            X-Dify-Token: "{{#env.DIFY_API_TOKEN#}}"
            X-Idempotency-Key: "{{#sys.workflow_id#}}-mk-{{#loop_products.index#}}"
            Content-Type: application/json
          body: |
            { "name": "{{#loop_products.item.name#}}", "category": "{{#loop_products.item.category#}}" }
          timeout: 30
        position: { x: 1200, y: 150 }

      - id: skip_if_unavailable
        data:
          type: if-else
          title: Available?
          conditions:
            - variable_selector: ["marketplace_search", "data", "available"]
              comparison_operator: "is"
              value: true
        position: { x: 1400, y: 150 }

      - id: process_product
        data:
          type: http-request
          title: Process product pipeline
          method: POST
          url: "{{#env.NESTJS_BASE#}}/agents/dify/process-product"
          headers:
            X-Dify-Token: "{{#env.DIFY_API_TOKEN#}}"
            X-Idempotency-Key: "{{#sys.workflow_id#}}-pp-{{#loop_products.index#}}"
            Content-Type: application/json
          body: |
            {
              "url": "{{#marketplace_search.data.url#}}",
              "platform": "{{#marketplace_search.data.platform#}}",
              "trend_score": {{#loop_products.item.trend_score#}},
              "discovery_reason": "{{#loop_products.item.discovery_reason#}}",
              "dify_run_id": "{{#sys.workflow_id#}}"
            }
          timeout: 600
        position: { x: 1600, y: 150 }

      - id: end
        data:
          type: end
          title: End
          outputs:
            - variable: processed
              value_selector: ["loop_products", "output"]
        position: { x: 1800, y: 150 }

    edges:
      - source: start
        target: health_check
      - source: health_check
        target: tavily_search
      - source: health_check
        target: reddit_search
      - source: health_check
        target: youtube_search
      - source: tavily_search
        target: unify
      - source: reddit_search
        target: unify
      - source: youtube_search
        target: unify
      - source: unify
        target: score
      - source: score
        target: loop_products
      - source: loop_products
        target: marketplace_search
      - source: marketplace_search
        target: skip_if_unavailable
      - source: skip_if_unavailable
        target: process_product
        condition: "true"
      - source: process_product
        target: end
```

> **Note:** The exact YAML schema for Dify workflow DSL evolves. The above matches Dify 1.14. If import fails, build the workflow manually using the same structure — this YAML is a blueprint, not a guaranteed import.

- [ ] **Step 2: Create the README**

`infrastructure/dify/README.md`:

```markdown
# Dify Workflows

## Discovery Flow

File: `discovery-flow.yml`

### Import

1. In Dify, go to **Studio → Create from DSL → Upload File**.
2. Select `discovery-flow.yml`.
3. After import, open the workflow and configure environment variables (right panel → Environment Variables):
   - `NESTJS_BASE` = `https://api.babiespicks.com` (or staging URL)
   - `DIFY_API_TOKEN` = (matches the NestJS `DIFY_API_TOKEN` env var)
4. Install required tools from Dify Marketplace if not already present:
   - Tavily
   - Reddit
   - YouTube
5. Provide API keys for each tool in Dify Settings → Tool Providers.

### Trigger

- Manual: in the workflow editor, click Run.
- Programmatic: `POST {DIFY_BASE}/v1/workflows/run` with the Dify API key from Dify → Tools → API Access.

### Output

Workflow returns `{ processed: [...] }`. Each item is the JSON response from `process-product`, including `product_id` and `content_page_id`. All data also lives in the NestJS DB.
```

- [ ] **Step 3: Commit**

```bash
git add infrastructure/dify
git commit -m "feat(dify): discovery workflow DSL + import README"
```

---

## Task 11: Cron Trigger (NestJS calls Dify)

**Files:**
- Create: `apps/api/src/features/dify-orchestration/dify-cron.service.ts`
- Modify: `apps/api/src/features/dify-orchestration/dify-orchestration.module.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Add env vars**

In `.env.example`:

```
DIFY_BASE_URL=https://flow.webvue.pro
DIFY_WORKFLOW_API_KEY=<from Dify → workflow → API Access>
DIFY_DISCOVERY_WORKFLOW_ID=<from Dify after import>
```

- [ ] **Step 2: Create the cron service**

`apps/api/src/features/dify-orchestration/dify-cron.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class DifyCronService {
  private readonly logger = new Logger(DifyCronService.name);

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async runDailyDiscovery(): Promise<void> {
    const base = process.env.DIFY_BASE_URL;
    const key = process.env.DIFY_WORKFLOW_API_KEY;
    const workflowId = process.env.DIFY_DISCOVERY_WORKFLOW_ID;

    if (!base || !key || !workflowId) {
      this.logger.warn('Dify cron skipped: env vars not set');
      return;
    }

    try {
      const response = await fetch(`${base}/v1/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: { max_products: 10, triggered_by: 'cron' },
          user: 'nestjs-cron',
        }),
      });
      if (!response.ok) {
        this.logger.error(`Dify cron failed: HTTP ${response.status}`);
        return;
      }
      const data = (await response.json()) as { workflow_run_id: string };
      this.logger.log(`Dify discovery run started: ${data.workflow_run_id}`);
    } catch (err) {
      this.logger.error(`Dify cron threw: ${(err as Error).message}`);
    }
  }
}
```

- [ ] **Step 3: Register in module**

```typescript
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [DatabaseModule, DiscoveryModule, CoordinatorModule, ScheduleModule.forRoot()],
  providers: [DifyOrchestrationService, DifyAuthGuard, IdempotencyInterceptor, DifyCronService],
  ...
})
```

(If `ScheduleModule.forRoot()` is already registered globally in `app.module.ts`, omit it here.)

- [ ] **Step 4: Verify type-check**

Run: `cd apps/api && pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/features/dify-orchestration apps/api/.env.example
git commit -m "feat(dify): daily cron to trigger discovery workflow at 4am"
```

---

## Task 12: Admin Panel — Surface Discovery Metadata (Optional)

**Files:**
- Modify: `apps/web/` (admin pages that list drafts; locate via `grep -r 'PENDING_APPROVAL' apps/web/src`)

> **Note:** This task is a follow-up. If the admin panel is in a separate repo (e.g. `apps/admin` or external Deqah admin), open a separate plan there.

- [ ] **Step 1: Find draft list page**

Run: `grep -rln "PENDING_APPROVAL" apps/web/src/ | head -5`
Open the first match.

- [ ] **Step 2: Add columns for `discoverySource` and `trendScore`**

In the draft listing table component, add two columns to the existing column array:

```tsx
{ key: 'discoverySource', header: 'Source', render: (row) => row.discoverySource ?? '—' },
{ key: 'trendScore', header: 'Trend', render: (row) => row.trendScore != null ? `${row.trendScore}/10` : '—' },
```

- [ ] **Step 3: Update the API select to return these fields**

In the backend list endpoint (`apps/api/src/features/.../*.controller.ts`), include the new fields in the Prisma `select` for the draft list.

- [ ] **Step 4: Type-check + commit**

```bash
git add apps/web apps/api/src/features
git commit -m "feat(admin): surface discoverySource and trendScore on drafts"
```

---

## Task 13: Production Rollout Checklist

This task has no code. It is a checklist for the operator to walk through after the code is deployed.

- [ ] **Step 1: Generate `DIFY_API_TOKEN`**

```bash
openssl rand -hex 32
# Set in both:
# - apps/api/.env (server)
# - Dify Environment Variables (workflow → Env Vars)
```

- [ ] **Step 2: Deploy NestJS API**

Push to main → Dokploy auto-deploys (`api.babiespicks.com`).

- [ ] **Step 3: Verify migration applied**

```bash
ssh deqah 'docker exec <api-container> pnpm prisma:migrate:status'
# Expected: all migrations applied, no pending.
```

- [ ] **Step 4: Smoke `/agents/dify/health` from Dify**

In Dify workflow editor, run the health node. Expected: `{ "ok": true }`.

- [ ] **Step 5: Run one full workflow on `max_products=1`**

In Dify → Run with `{ "max_products": 1, "triggered_by": "manual" }`.
Expected: one draft appears in admin panel.

- [ ] **Step 6: Enable cron in production**

Confirm `DIFY_BASE_URL`, `DIFY_WORKFLOW_API_KEY`, `DIFY_DISCOVERY_WORKFLOW_ID` are set in production env.
Restart NestJS API container.
Verify in logs the next morning: `Dify discovery run started: <id>`.

- [ ] **Step 7: Monitor first week**

- Check GlitchTip for new errors tagged `dify`.
- Check Dify run history for failures.
- Confirm draft volume matches expectations (~5-10/day).

---

## Self-Review Notes

- **Spec coverage:** All sections of the design doc map to tasks. The optional Slack/Telegram webhook was dropped per user instruction; no task for it.
- **Type consistency:** `searchMarketplace` and `processProduct` method names match across tests and implementation.
- **Placeholders:** None. Notes are inline guidance to the implementer when the existing codebase shape may differ from assumptions.
- **Scope:** This single plan covers NestJS endpoints, migration, Dify YAML, and cron. Admin panel updates are scoped to one optional task. If the admin panel lives in another repo, that task moves to its own plan.
