import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = join(process.cwd(), 'prisma/schema.prisma');
const migrationPath = join(
  process.cwd(),
  'prisma/migrations/0004_affiliate_ai_os_foundation/migration.sql',
);
const securityMigrationPath = join(
  process.cwd(),
  'prisma/migrations/0005_security_audit_retention_controls/migration.sql',
);

const schema = readFileSync(schemaPath, 'utf8');
const migration = readFileSync(migrationPath, 'utf8');
const securityMigration = readFileSync(securityMigrationPath, 'utf8');

function modelBlock(modelName: string) {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));
  expect(match, `Expected model ${modelName} to exist`).toBeTruthy();
  return match?.[0] ?? '';
}

function enumBlock(enumName: string) {
  const match = schema.match(new RegExp(`enum ${enumName} \\{[\\s\\S]*?\\n\\}`));
  expect(match, `Expected enum ${enumName} to exist`).toBeTruthy();
  return match?.[0] ?? '';
}

describe('Affiliate AI OS schema foundation contract', () => {
  it('declares the additive models and lifecycle enums required by phases 2-7', () => {
    for (const modelName of [
      'ProductScore',
      'ArticleDraft',
      'AnalyticsEvent',
      'ScheduledJob',
      'ScheduledJobRun',
      'OptimizationRecommendation',
      'ApprovalAuditEvent',
    ]) {
      expect(modelBlock(modelName)).toContain('@@map(');
    }

    expect(enumBlock('ProductScoreStatus')).toContain('NEEDS_REVIEW');
    expect(enumBlock('ArticleDraftStatus')).toContain('SCHEDULED');
    expect(enumBlock('ScheduledJobStatus')).toContain('ACTIVE');
    expect(enumBlock('ScheduledJobRunStatus')).toContain('SUCCEEDED');
    expect(enumBlock('OptimizationRecommendationStatus')).toContain('APPLIED');
    expect(enumBlock('RetentionClass')).toContain('SHORT_LIVED');
    expect(enumBlock('ApprovalAuditAction')).toContain('REVISION_REQUESTED');
  });

  it('keeps ProductScore linked optionally to draft/product/AI run with idempotency and queue indexes', () => {
    const block = modelBlock('ProductScore');

    expect(block).toMatch(/productDraftId\s+String\?/);
    expect(block).toMatch(/productId\s+String\?/);
    expect(block).toMatch(/aiRunId\s+String\?/);
    expect(block).toMatch(/idempotencyKey\s+String\?\s+@unique/);
    expect(block).toContain('scores         Json');
    expect(block).toContain('riskFlags      Json?');
    expect(block).toContain('@@index([status, updatedAt])');
    expect(block).toContain('@@index([productDraftId, status])');
    expect(block).toContain('@@index([productId, status])');
  });

  it('keeps ArticleDraft localized, slug-safe, approval-ready, and linked to content/AI run', () => {
    const block = modelBlock('ArticleDraft');

    expect(block).toMatch(/contentPageId\s+String\?/);
    expect(block).toMatch(/aiRunId\s+String\?/);
    expect(block).toMatch(/locale\s+String/);
    expect(block).toMatch(/type\s+ContentType/);
    expect(block).toMatch(/productIds\s+String\[\]/);
    expect(block).toMatch(/seo\s+Json\?/);
    expect(block).toMatch(/approvedBy\s+String\?/);
    expect(block).toMatch(/rejectedAt\s+DateTime\?/);
    expect(block).toContain('@@unique([locale, slug])');
    expect(block).toContain('@@index([locale, type, status])');
  });

  it('keeps AnalyticsEvent PII-minimized and queryable by time windows', () => {
    const block = modelBlock('AnalyticsEvent');

    expect(block).toContain('sessionHash');
    for (const piiColumn of [
      'email',
      'phone',
      'ip',
      'ipAddress',
      'userId',
      'sessionId',
      'userAgent',
      'referrer',
    ]) {
      expect(block).not.toMatch(new RegExp(`\\b${piiColumn}\\s+`));
    }
    expect(block).toContain('eventType');
    expect(block).toContain('source');
    expect(block).toMatch(/metadata\s+Json\s+@default\("\{}"\)/);
    expect(block).toMatch(/metadataSchemaVersion\s+Int\s+@default\(1\)/);
    expect(block).toMatch(/retentionClass\s+RetentionClass\s+@default\(SHORT_LIVED\)/);
    expect(block).toMatch(/expiresAt\s+DateTime\?/);
    expect(block).toContain('occurredAt');
    expect(block).toContain('@@index([eventType, occurredAt])');
    expect(block).toContain('@@index([retentionClass, expiresAt])');
    expect(block).toContain('@@index([sessionHash, occurredAt])');
  });

  it('adds retention controls to generated/recommendation records', () => {
    for (const [modelName, retentionClass] of [
      ['ProductScore', 'GENERATED_CONTENT'],
      ['ArticleDraft', 'GENERATED_CONTENT'],
      ['OptimizationRecommendation', 'STANDARD'],
    ] as const) {
      const block = modelBlock(modelName);

      expect(block).toMatch(
        new RegExp(`retentionClass\\s+RetentionClass\\s+@default\\(${retentionClass}\\)`),
      );
      expect(block).toMatch(/expiresAt\s+DateTime\?/);
      expect(block).toContain('@@index([retentionClass, expiresAt])');
      expect(block).toContain('@@index([expiresAt])');
    }
  });

  it('declares append-only approval audit events for approval decisions', () => {
    const block = modelBlock('ApprovalAuditEvent');

    expect(block).toMatch(/actorType\s+ApprovalAuditActorType/);
    expect(block).toMatch(/actorId\s+String/);
    expect(block).toMatch(/action\s+ApprovalAuditAction/);
    expect(block).toMatch(/entityType\s+ApprovalAuditEntityType/);
    expect(block).toMatch(/entityId\s+String/);
    expect(block).toMatch(/reason\s+String\?\s+@db\.Text/);
    expect(block).toMatch(/metadata\s+Json\s+@default\("\{}"\)/);
    expect(block).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(block).not.toContain('updatedAt');
    expect(block).toContain('@@index([entityType, entityId, createdAt])');
    expect(block).toContain('@@index([actorType, actorId, createdAt])');
  });

  it('captures scheduled job locks and idempotent run constraints', () => {
    const jobBlock = modelBlock('ScheduledJob');
    const runBlock = modelBlock('ScheduledJobRun');

    expect(jobBlock).toMatch(/key\s+String\s+@unique/);
    expect(jobBlock).toMatch(/timezone\s+String\s+@default\("UTC"\)/);
    expect(jobBlock).toMatch(/lockKey\s+String\?\s+@unique/);
    expect(jobBlock).toContain('@@index([status, nextRunAt])');

    expect(runBlock).toMatch(/idempotencyKey\s+String\?\s+@unique/);
    expect(runBlock).toMatch(/scheduledFor\s+DateTime/);
    expect(runBlock).toMatch(/lockExpiresAt\s+DateTime\?/);
    expect(runBlock).toContain('@@unique([scheduledJobId, scheduledFor])');
    expect(runBlock).toContain('@@index([scheduledJobId, status, scheduledFor])');
  });

  it('creates additive SQL migration objects and critical uniqueness/index constraints', () => {
    for (const tableName of [
      'product_scores',
      'article_drafts',
      'analytics_events',
      'scheduled_jobs',
      'scheduled_job_runs',
      'optimization_recommendations',
    ]) {
      expect(migration).toContain(`CREATE TABLE "${tableName}"`);
    }

    expect(migration).toContain('CREATE UNIQUE INDEX "product_scores_idempotencyKey_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "article_drafts_locale_slug_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "scheduled_jobs_key_key"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "scheduled_job_runs_scheduledJobId_scheduledFor_key"',
    );
    expect(migration).toContain('CREATE INDEX "analytics_events_sessionHash_occurredAt_idx"');
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
  });

  it('creates additive SQL migration objects for security audit and retention controls', () => {
    expect(securityMigration).toContain('CREATE TABLE "approval_audit_events"');
    expect(securityMigration).toContain('CREATE TYPE "RetentionClass" AS ENUM');
    expect(securityMigration).toContain('ALTER TABLE "analytics_events" ADD COLUMN "metadataSchemaVersion"');
    expect(securityMigration).toContain('ALTER TABLE "analytics_events" ALTER COLUMN "metadata" SET NOT NULL');
    expect(securityMigration).toContain(
      'CREATE INDEX "approval_audit_events_entityType_entityId_createdAt_idx"',
    );
    expect(securityMigration).toContain(
      'CREATE INDEX "analytics_events_retentionClass_expiresAt_idx"',
    );
  });
});
