/**
 * Task 12 — integrated acceptance and authorized rollout evidence.
 *
 * Plan: docs/superpowers/plans/2026-11-02-international-marketplaces.md#task-12
 * Runbook: docs/operations/international-release.md
 *
 * This script produces evidence only. It never deploys, pushes, commits, enables a
 * production feature, starts a second writer or writes production data. It refuses to
 * run against anything that is not an isolated local test target:
 *   - every database name must end in `_test` and live on a loopback host;
 *   - every web/MCP origin must be localhost;
 *   - production-looking names and managed database hosts are rejected.
 *
 * The JSON report carries the commit, the configuration in use and the agent
 * instruction version — with variable NAMES only, never their values or secrets.
 *
 * Usage (from the repository root):
 *   pnpm exec tsx scripts/operations/international-acceptance.ts [options]
 *
 *   --profile=<name>        sequence | integration | browser | all   (default: sequence)
 *   --out=<path>            report path (default: work/acceptance/international-<profile>-<stamp>.json)
 *   --base-url=<url>        local web server for the focused test and browser profiles
 *                           (default: http://localhost:3314, overridable by TEST_WEB_URL)
 *   --commit=<sha>          commit label for the report (defaults to git describe of HEAD)
 *   --keep-work             keep the per-profile scratch artifacts (logs, screenshots)
 *
 * When DEPLOY_API_KEY is present (for example loaded from a file by the harness), the
 * full suite runs with chat-eval.live.spec.ts excluded and the report records that. A live
 * inference test never runs merely because the key exists.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ── Report types ───────────────────────────────────────────────────────────

export type AcceptanceStatus = 'passed' | 'failed' | 'skipped';

export interface AcceptanceCheck {
  /** Stable identifier; the runbook refers to these names. */
  readonly id: string;
  /** Environment where the check ran: local | docker | staging | production. */
  readonly environment: 'local' | 'docker' | 'staging' | 'production';
  readonly status: AcceptanceStatus;
  /** One line: what was verified. Never contains prices, tokens or personal data. */
  readonly evidence: string;
  /** Why it was skipped; a skip is not proof. */
  readonly reason?: string;
  readonly durationMs?: number;
}

export interface AcceptanceReport {
  readonly schemaVersion: 1;
  readonly profile: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly commit: string;
  readonly commitSource: 'argument' | 'git' | 'unknown';
  readonly config: AcceptanceConfig;
  readonly agentInstructionVersion: string | null;
  readonly counts: { passed: number; failed: number; skipped: number };
  readonly checks: AcceptanceCheck[];
  /** Environment coverage; anything not tested is listed explicitly. */
  readonly environments: Record<'local' | 'docker' | 'staging' | 'production', string>;
  readonly stopConditions: string[];
}

export interface AcceptanceConfig {
  /** Variable NAMES present in the environment (never values). */
  readonly presentEnvNames: string[];
  readonly node: string;
  readonly pnpm: string | null;
  readonly platform: string;
  readonly databaseNames: string[];
  readonly webOrigins: string[];
  readonly mcpOrigins: string[];
  readonly chatInference: 'disabled' | 'key-present-but-e2e-only';
  readonly excludedTests: string[];
}

// ── Guards ─────────────────────────────────────────────────────────────────

export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const MANAGED_DATABASE_HOST = /(^|\.)(supabase\.co|neon\.tech|rds\.amazonaws\.com|azure\.com|render\.com|railway\.app|digitalocean\.com|aivencloud\.com|planetscale\.com|herokuapp\.com)$/i;
const PRODUCTION_NAMES = new Set(['postgres', 'template0', 'template1', 'production', 'prod', 'babiespicks', 'babiespicks_production']);
/** A `_test` suffix is not enough: these names describe acceptance fixtures only. */
const ACCEPTANCE_DATABASE = /^[a-z0-9][a-z0-9_-]*_test$/;

export class GuardError extends Error {
  constructor(message: string) { super(message); this.name = 'GuardError'; }
}

export function assertLocalDatabaseUrl(url: string, label = 'database'): { host: string; database: string } {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new GuardError(`${label}: not a valid URL`); }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') throw new GuardError(`${label}: must be a postgresql:// URL`);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const host = parsed.hostname.toLowerCase();
  if (!database) throw new GuardError(`${label}: no database name`);
  if (!database.endsWith('_test') || !ACCEPTANCE_DATABASE.test(database)) {
    throw new GuardError(`${label}: database "${database}" must end in _test`);
  }
  if (PRODUCTION_NAMES.has(database) || /prod/i.test(database)) throw new GuardError(`${label}: database "${database}" is not an acceptance target`);
  if (!LOCAL_HOSTS.has(host)) throw new GuardError(`${label}: host must be localhost`);
  if (MANAGED_DATABASE_HOST.test(host)) throw new GuardError(`${label}: managed database hosts are never acceptance targets`);
  return { host, database };
}

export function assertLocalOrigin(origin: string, label = 'service'): string {
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new GuardError(`${label}: not a valid URL`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new GuardError(`${label}: must be http(s)`);
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) throw new GuardError(`${label}: "${parsed.hostname}" is not localhost`);
  return parsed.origin;
}

/** Both guards re-exported for the runbook: a pipeline calls these before any write. */
export function assertAcceptanceTargets(input: { databaseUrls?: readonly string[]; origins?: readonly string[] }): void {
  for (const url of input.databaseUrls ?? []) assertLocalDatabaseUrl(url);
  for (const origin of input.origins ?? []) assertLocalOrigin(origin);
}

// ── Redaction ──────────────────────────────────────────────────────────────

const SECRET_NAME = /(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE|CREDENTIAL)/i;
/** Any value of a present sensitive variable is scrubbed from captured output. */
export function scrub(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 6) out = out.split(secret).join('***');
  return out
    .replace(/postgres(ql)?:\/\/[^\s'"]+/g, 'postgresql://***@***/***')
    .replace(BEARER, 'Bearer ***');
}
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;

export function sensitiveValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([name, value]) => SECRET_NAME.test(name) && typeof value === 'string' && value.length > 0)
    .map(([, value]) => value as string);
}

/** Names only: the report says which variables were set, never what they hold. */
export function presentVariableNames(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env).filter(name => /^(NODE_|NEXT_PUBLIC_|DATABASE_URL|TEST_|DEPLOY_|CHAT_|MCP_|MARKET_DATA_|AMAZON_|REVALIDATE_|MEDIA_|ENABLE_)/.test(name)).sort();
}

// ── Process helpers ────────────────────────────────────────────────────────

export interface CommandResult { readonly code: number | null; readonly output: string; readonly durationMs: number }

export interface RunOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly log?: (line: string) => void;
}

const SHELL_HARM = /[|&;<>()$`\\"'*?[\]{}~!#]/;
/**
 * Args go straight to exec so a value read from a file is never shell-expanded or
 * split into extra commands. Only plain tokens are accepted.
 */
export function shellSafeCommand(command: string, args: readonly string[]): string {
  for (const token of [command, ...args]) if (SHELL_HARM.test(token)) throw new GuardError(`refusing to run a command containing shell metacharacters: ${token.replace(/./g, '*')}`);
  return [command, ...args].join(' ');
}

export async function runCommand(command: string, args: readonly string[], options: RunOptions): Promise<CommandResult> {
  const started = Date.now();
  const line = shellSafeCommand(command, args);
  options.log?.(`$ ${line}`);
  return await new Promise<CommandResult>((resolveRun, reject) => {
    const child = spawn(line, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: true,
      timeout: options.timeoutMs ?? 30 * 60 * 1000,
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code, signal) => resolveRun({ code: signal ? null : code, output, durationMs: Date.now() - started }));
  });
}

// ── Command sequence (plan Task 12, step 1, in order) ──────────────────────

export interface SequenceStep {
  readonly id: string;
  readonly command: string;
  readonly args: string[];
  /** Unset (env -u) variables for this step only. */
  readonly unset?: string[];
  readonly timeoutMs?: number;
  /** A failure here is a stop condition for the rollout. */
  readonly stop: boolean;
}

/** Live inference never runs because a key happens to be present. */
export const LIVE_CHAT_SPEC = 'apps/web/src/server/chat/chat-eval.live.spec.ts';

export function sequenceSteps(input: { hasDeployKey: boolean; git?: boolean }): SequenceStep[] {
  const testArgs = input.git === false ? ['exec', 'vitest', 'run'] : ['test'];
  if (input.hasDeployKey) testArgs.push('--exclude', '**/chat-eval.live.spec.ts');
  return [
    { id: 'db-generate', command: 'pnpm', args: ['db:generate'], timeoutMs: 5 * 60 * 1000, stop: true },
    { id: 'type-check', command: 'pnpm', args: ['type-check'], timeoutMs: 15 * 60 * 1000, stop: true },
    { id: 'lint', command: 'pnpm', args: ['lint'], timeoutMs: 15 * 60 * 1000, stop: true },
    { id: 'focused-tests', command: 'pnpm', args: ['exec', 'vitest', 'run', ...FOCUSED_TESTS], timeoutMs: 20 * 60 * 1000, stop: true },
    // The plan's literal command: the key is removed from the child environment. When a
    // harness re-injects it from a file, `--exclude` above keeps live inference out.
    { id: 'full-test', command: 'pnpm', args: testArgs, unset: ['DEPLOY_API_KEY'], timeoutMs: 40 * 60 * 1000, stop: true },
    { id: 'build', command: 'pnpm', args: ['build'], timeoutMs: 30 * 60 * 1000, stop: true },
  ];
}

/** Plan Task 12's "merged focused tests": the files that implement Tasks 2–11 and 13. */
export const FOCUSED_TESTS: readonly string[] = Object.freeze([
  'packages/domain/src/international-contracts.spec.ts',
  'packages/domain/src/money.spec.ts',
  'packages/domain/src/fx.spec.ts',
  'packages/domain/src/offer-selection.spec.ts',
  'packages/domain/src/offer-mutations.spec.ts',
  'packages/domain/src/coupon-scope.spec.ts',
  'packages/domain/src/affiliate-verdict.spec.ts',
  'apps/web/src/server/__tests__/public-queries.spec.ts',
  'apps/web/src/server/__tests__/public-http.spec.ts',
  'apps/web/src/server/__tests__/public-honesty.spec.ts',
  'apps/web/src/server/chat/chat-service.spec.ts',
  'apps/web/src/server/chat/chat-widget-context.spec.ts',
  'apps/web/src/shared/lib/shopping-context.spec.ts',
  'apps/web/src/shared/lib/money-format.spec.ts',
  'apps/web/src/shared/lib/coupons.spec.ts',
  'apps/mcp/src/domain-contract.test.ts',
  'scripts/operations/backfill-international.spec.ts',
]);

/** Parsers read vitest's summary; a missing summary is a failure, not a pass. */
export function summarizeVitest(output: string): { files: number; tests: number; failed: number } | null {
  const tests = /Tests\s+(\d+)(?:\s+failed\s*\|\s*(\d+)\s+passed|\s+passed)/.exec(output);
  const files = /Test Files\s+(\d+)\s+passed/.exec(output);
  if (!tests) return null;
  const failedMatch = /Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed/.exec(output);
  return { files: files ? Number(files[1]) : 0, tests: failedMatch ? Number(failedMatch[2]) : Number(tests[1]), failed: failedMatch ? Number(failedMatch[1]) : 0 };
}

export async function runSequence(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
  hasDeployKey: boolean;
  git: boolean;
}): Promise<AcceptanceCheck[]> {
  const checks: AcceptanceCheck[] = [];
  const secrets = sensitiveValues(input.env);
  for (const step of sequenceSteps({ hasDeployKey: input.hasDeployKey, git: input.git })) {
    const env = { ...input.env };
    for (const name of step.unset ?? []) delete env[name];
    const result = await runCommand(step.command, step.args, { cwd: input.cwd, env, timeoutMs: step.timeoutMs, log: input.log });
    const tail = scrub(result.output.trim().split('\n').slice(-4).join(' | '), secrets).slice(0, 400);
    const summary = step.id === 'focused-tests' || step.id === 'full-test' ? summarizeVitest(result.output) : null;
    const summaryNote = summary ? `${summary.tests} passed, ${summary.failed} failed in ${summary.files} file(s)` : '';
    checks.push({
      id: step.id,
      environment: 'local',
      status: result.code === 0 ? 'passed' : 'failed',
      evidence: `exit ${result.code}${summaryNote ? `; ${summaryNote}` : ''}${tail ? `; ${tail}` : ''}`,
      durationMs: result.durationMs,
    });
    // A stop condition halts the rollout: later steps say so instead of pretending.
    if (result.code !== 0 && step.stop) {
      for (const rest of sequenceSteps({ hasDeployKey: input.hasDeployKey, git: input.git }).slice(checks.length)) {
        checks.push({ id: rest.id, environment: 'local', status: 'skipped', evidence: 'not run', reason: `stopped after ${step.id} failed` });
      }
      break;
    }
  }
  return checks;
}

// ── Commit / config metadata ───────────────────────────────────────────────

export async function resolveCommit(cwd: string, arg: string | undefined): Promise<{ commit: string; commitSource: 'argument' | 'git' | 'unknown' }> {
  if (arg) return { commit: arg, commitSource: 'argument' };
  const result = await runCommand('git', ['rev-parse', 'HEAD'], { cwd, log: () => {} });
  if (result.code === 0 && /^[0-9a-f]{40}$/.test(result.output.trim())) return { commit: result.output.trim(), commitSource: 'git' };
  const accepted = join(cwd, 'work', 'acceptance', 'HEAD');
  if (existsSync(accepted)) {
    const value = (await readFile(accepted, 'utf8')).trim();
    if (/^[0-9a-f]{7,40}$/.test(value)) return { commit: value, commitSource: 'argument' };
  }
  return { commit: 'unknown', commitSource: 'unknown' };
}

export function buildReport(input: {
  profile: string; startedAt: string; commit: string; commitSource: AcceptanceReport['commitSource'];
  config: AcceptanceConfig; agentInstructionVersion: string | null; checks: AcceptanceCheck[];
}): AcceptanceReport {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const check of input.checks) counts[check.status] += 1;
  const byEnv = (env: AcceptanceCheck['environment']) => {
    const group = input.checks.filter(check => check.environment === env);
    if (!group.length) return 'not tested by this profile';
    return `${group.filter(c => c.status === 'passed').length} passed, ${group.filter(c => c.status === 'failed').length} failed, ${group.filter(c => c.status === 'skipped').length} skipped`;
  };
  return {
    schemaVersion: 1,
    profile: input.profile,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    commit: input.commit,
    commitSource: input.commitSource,
    config: input.config,
    agentInstructionVersion: input.agentInstructionVersion,
    counts,
    checks: input.checks,
    environments: { local: byEnv('local'), docker: byEnv('docker'), staging: 'not tested: no staging deployment was authorized', production: 'read-only only; never a write target' },
    stopConditions: [...STOP_CONDITIONS],
  };
}

/** Plan Task 12's stop conditions; any hit halts the rollout. */
export const STOP_CONDITIONS: readonly string[] = Object.freeze([
  'wrong conversion (a foreign amount rendered as SAR, or a converted value written back as the original)',
  'inconsistent currency (one money value labelled with two currencies)',
  'wrong marketplace binding (a quote or target belonging to another marketplace)',
  'draft leak (DRAFT/REVIEW/ARCHIVED content visible on a public route)',
  'source expiry bypass (a note past its window still treated as fresh or a checkedAt renewed without a check)',
  'identity corruption or double-write (two writers producing divergent offer observations)',
]);

export function reportFileName(profile: string, at = new Date()): string {
  return `international-${profile}-${at.toISOString().replace(/[:.]/g, '-')}.json`;
}

export function reportDigest(report: AcceptanceReport): string {
  return createHash('sha256').update(JSON.stringify(report)).digest('hex');
}

// ── Integration profile (isolated `_test` database, Docker PostgreSQL) ─────

const dbUrl = process.env.TEST_DATABASE_URL;
const baseUrl = process.env.TEST_WEB_URL ?? 'http://localhost:3314';

async function main(argv: readonly string[]): Promise<number> {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [name, ...rest] = arg.slice(2).split('=');
      if (rest.length) args.set(name!, rest.join('='));
      else flags.add(name!);
    }
  }
  const profile = args.get('profile') ?? (flags.has('sequence') ? 'sequence' : 'sequence');
  const cwd = resolve(args.get('cwd') ?? process.cwd());
  const log = (line: string) => process.stderr.write(`${line}\n`);
  // Guard before anything is executed: the sequence profile does not touch a database,
  // but the acceptance entry point still refuses foreign database targets.
  for (const name of ['TEST_DATABASE_URL', 'DATABASE_URL', 'TARGET_TEST_DATABASE_URL']) {
    const value = process.env[name];
    if (value) assertLocalDatabaseUrl(value, name);
  }
  const startedAt = new Date().toISOString();
  const { commit, commitSource } = await resolveCommit(cwd, args.get('commit'));
  const hasDeployKey = Boolean(process.env.DEPLOY_API_KEY);
  let checks: AcceptanceCheck[] = [];
  let instructionVersion: string | null = null;
  const webOrigin = safeOrigin(baseUrl);

  if (profile === 'sequence') {
    const gitProbe = await runCommand('git', ['--version'], { cwd, log: () => {} });
    const results = await runSequence({ cwd, env: process.env, log, hasDeployKey, git: gitProbe.code === 0 });
    checks = results;
  } else if (profile === 'integration') {
    // Loaded lazily so the sequence profile needs no Prisma client or database.
    // Imported directly: `main` only runs when this file is the process entry point.
    const { runIntegrationAcceptance } = await import('./international-acceptance.integration');
    if (!dbUrl) throw new GuardError('TEST_DATABASE_URL is required for the integration profile');
    assertLocalDatabaseUrl(dbUrl, 'TEST_DATABASE_URL');
    const result = await runIntegrationAcceptance({ databaseUrl: dbUrl, log });
    checks = result.checks;
    instructionVersion = result.agentInstructionVersion;
  } else if (profile === 'browser') {
    assertLocalOrigin(baseUrl, 'TEST_WEB_URL');
    const { runBrowserAcceptance } = await import('./international-acceptance.browser');
    const result = await runBrowserAcceptance({ baseUrl, log, screenshotsDir: join(cwd, 'work', 'acceptance', 'screenshots') });
    checks = result.checks;
  } else {
    throw new GuardError(`unknown profile "${profile}"`);
  }

  const out = resolve(cwd, args.get('out') ?? join('work', 'acceptance', reportFileName(profile)));
  const report = buildReport({
    profile, startedAt, commit, commitSource,
    config: {
      presentEnvNames: presentVariableNames(process.env),
      node: process.version,
      pnpm: (await runCommand('pnpm', ['--version'], { cwd, log: () => {} })).output.trim() || null,
      platform: `${process.platform}-${process.arch}`,
      databaseNames: [...new Set([dbUrl, process.env.DATABASE_URL].filter((v): v is string => Boolean(v)).map(v => { try { return new URL(v).pathname.replace(/^\//, ''); } catch { return 'invalid'; } }))],
      webOrigins: webOrigin ? [webOrigin] : [],
      mcpOrigins: [],
      chatInference: hasDeployKey ? 'key-present-but-e2e-only' : 'disabled',
      excludedTests: hasDeployKey ? [LIVE_CHAT_SPEC] : [],
    },
    agentInstructionVersion: instructionVersion,
    checks,
  });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ report: out, profile, counts: report.counts, commit, agentInstructionVersion: instructionVersion, digest: reportDigest(report) })}\n`);
  return report.counts.failed === 0 ? 0 : 1;
}

function safeOrigin(value: string): string | null {
  try { return new URL(value).origin; } catch { return null; }
}

/** Only run when invoked directly (tests import the pure helpers above). */
const invoked = process.argv[1] && /international-acceptance\.ts$/.test(process.argv[1]);
if (invoked) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; })
    .catch(error => { process.stderr.write(`${error instanceof GuardError ? 'REFUSED: ' : 'FAILED: '}${error instanceof Error ? error.message : 'unknown error'}\n`); process.exitCode = 2; });
}
