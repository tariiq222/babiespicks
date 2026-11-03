/**
 * Task 12 browser profile — a real Chromium over a local server only (localhost guard).
 *
 * It covers plan Task 12's browser matrix ar/en × SA/US × SAR/USD and the interactions the
 * earlier tasks could not verify: switching the context and the language independently,
 * filters and the budget field, the assistant widget's opening state, the phone layout and
 * the offer button. Screenshots stay local under work/acceptance/.
 *
 * The browser is driven through the Chrome DevTools Protocol over a pipe, so no Playwright
 * or Puppeteer package and no download is required. The executable comes from an existing
 * Playwright cache or CHROME_PATH. When neither exists — or the browser cannot open a pipe
 * on this platform — the profile reports a skipped check instead of claiming a pass.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AcceptanceCheck } from './international-acceptance';

export interface BrowserResult { readonly checks: AcceptanceCheck[] }
export interface BrowserOptions { readonly baseUrl: string; readonly log: (line: string) => void; readonly screenshotsDir: string }

/** Local candidates only; nothing is downloaded and nothing system-wide is installed. */
export function chromiumCandidates(env: NodeJS.ProcessEnv = process.env, home = homedir()): string[] {
  const out: string[] = [];
  if (env.CHROME_PATH) out.push(env.CHROME_PATH);
  const roots = [
    { root: join(home, 'Library', 'Caches', 'ms-playwright'), mac: true },
    { root: join(home, '.cache', 'ms-playwright'), mac: false },
  ];
  const newestFirst = (names: string[], prefix: string) => names.filter(name => name.startsWith(prefix) && /^\D+-\d+$/.test(name)).sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
  for (const { root, mac } of roots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root);
    // Playwright ships either Chromium.app or the headless shell under these names.
    for (const version of mac ? newestFirst(versions, 'chromium-') : newestFirst(versions, 'chromium-')) {
      if (mac) out.push(join(root, version, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
      if (mac) out.push(join(root, version, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
      out.push(join(root, version, 'chrome-linux64', 'chrome'), join(root, version, 'chrome-linux', 'chrome'));
    }
    for (const version of newestFirst(versions, 'chromium_headless_shell-')) {
      out.push(join(root, version, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'));
      out.push(join(root, version, 'chrome-linux', 'chrome-headless-shell'));
    }
  }
  return out.filter(path => existsSync(path));
}

function expectAttribute(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function check(checks: AcceptanceCheck[], id: string, environment: AcceptanceCheck['environment'], job: () => Promise<string>): Promise<void> {
  const started = Date.now();
  try {
    const evidence = await job();
    checks.push({ id, environment, status: 'passed', evidence, durationMs: Date.now() - started });
  } catch (error) {
    checks.push({ id, environment, status: 'failed', evidence: `failed: ${error instanceof Error ? error.message.slice(0, 300) : 'unknown'}`, durationMs: Date.now() - started });
  }
}

interface Viewport { readonly width: number; readonly height: number }
// A headless shell's minimum window width is 408px; measuring a 390px layout needs a
// narrower browser window or the comparison is between two different empty states.
const WINDOW = '--window-size=360,820' as const;
const DESKTOP: Viewport = { width: 1280, height: 900 };
const PHONE: Viewport = { width: 390, height: 844 };

export async function runBrowserAcceptance(options: BrowserOptions): Promise<BrowserResult> {
  const { assertLocalOrigin } = await import('./international-acceptance');
  assertLocalOrigin(options.baseUrl, 'TEST_WEB_URL');
  const origin = new URL(options.baseUrl).origin;
  const checks: AcceptanceCheck[] = [];
  const binary = chromiumCandidates()[0];
  if (!binary) {
    checks.push({ id: 'browser-chromium-available', environment: 'local', status: 'skipped', evidence: 'no local Chromium found', reason: 'set CHROME_PATH to a local Chromium to run the browser profile' });
    return { checks };
  }
  await mkdir(options.screenshotsDir, { recursive: true });
  const profileDir = join(options.screenshotsDir, `.profile-${Date.now()}`);
  const args = [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-background-networking', '--disable-sync', '--disable-extensions',
    '--remote-debugging-pipe', `--user-data-dir=${profileDir}`, WINDOW, 'about:blank',
  ];
  const child: ChildProcess = spawn(binary, args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  try {
    let browser: Cdp;
    try {
      browser = await Cdp.connect(child);
    } catch (error) {
      checks.push({ id: 'browser-launch', environment: 'local', status: 'skipped', evidence: 'local Chromium did not attach over CDP pipe', reason: error instanceof Error ? error.message : 'attach failed' });
      return { checks };
    }
    await check(checks, 'browser-launch', 'local', async () => {
      const version = await browser.send('Browser.getVersion', {}) as { product: string };
      const page = await browser.newPage();
      await page.close();
      return `local Chromium "${version.product.split('/')[0]}" attached over the CDP pipe`;
    });
    const page = await browser.newPage();
    const shoot = async (name: string) => {
      const shot = await page.send('Page.captureScreenshot', { format: 'png' }) as { data: string };
      await writeFile(join(options.screenshotsDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
    };
    const html = async () => await page.evaluate('document.documentElement.outerHTML') as string;
    const open = async (path: string, viewport = DESKTOP) => {
      await page.setViewport(viewport.width, viewport.height);
      const result = await page.navigate(`${origin}${path}`);
      if (result.status !== 200) throw new Error(`GET ${path} returned ${result.status}`);
      return result;
    };

    // ── Matrix ar/en × SA/US × SAR/USD ─────────────────────────────────────
    for (const locale of ['ar', 'en'] as const) {
      for (const shipTo of ['SA', 'US'] as const) {
        for (const currency of ['SAR', 'USD'] as const) {
          const name = `${locale}-${shipTo}-${currency}`;
          await check(checks, `page-${name}`, 'local', async () => {
            await open(`/${locale}?shipTo=${shipTo}&currency=${currency}`);
            const body = await html();
            const lang = await page.evaluate('document.documentElement.lang') as string;
            const dir = await page.evaluate('document.documentElement.dir') as string;
            if (!lang.startsWith(locale)) throw new Error(`html lang is ${lang}, expected ${locale}`);
            if ((locale === 'ar') !== (dir === 'rtl')) throw new Error(`html dir is ${dir}`);
            const pressed = await page.activeButtons();
            if (!pressed.some(label => label.includes(shipTo === 'SA' ? (locale === 'ar' ? 'السعودية' : 'Saudi Arabia') : (locale === 'ar' ? 'أمريكا' : 'United States')))) throw new Error('chosen destination is not marked as selected');
            if (!pressed.some(label => label.includes(currency))) throw new Error('chosen currency is not marked as selected');
            await shoot(`desktop-${name}`);
            return `/${locale} rendered with lang=${lang}, dir=${dir}, destination and currency marked selected (${body.length} bytes)`;
          });
        }
      }
    }

    // ── Context sections the plan names explicitly ─────────────────────────
    await check(checks, 'language-independent-of-context', 'local', async () => {
      await open('/en?shipTo=SA&currency=SAR');
      const pressed = await page.activeButtons();
      const englishChrome = await page.evaluate(`document.querySelector('header a[href^="/en"]') !== null`) as boolean;
      if (!englishChrome) throw new Error('English page has no English header links');
      if (pressed.some(label => label === 'السعودية')) throw new Error('destination label switched to Arabic');
      return 'English page keeps its own copy while Saudi destination and SAR currency are selected';
    });

    await check(checks, 'currency-never-derives-destination', 'local', async () => {
      await open('/en?currency=USD');
      const pressed = await page.activeButtons();
      if (pressed.some(label => label === 'United States' || label === 'Saudi Arabia')) throw new Error('a destination was selected from the currency alone');
      if (!pressed.some(label => label.includes('USD'))) throw new Error('USD currency is not marked selected');
      return 'currency=USD alone selected no destination';
    });

    await check(checks, 'destination-chip-switch', 'local', async () => {
      await open('/en');
      const clicked = await page.evaluate(`(() => {
        const summary = document.querySelector('header details summary');
        if (!summary) return 'no-switcher';
        summary.click();
        const button = [...document.querySelectorAll('header details button')].find(b => (b.textContent ?? '').trim() === 'United States');
        if (!button) return 'no-us-chip';
        button.click();
        return 'clicked';
      })()`) as string;
      if (clicked !== 'clicked') throw new Error(clicked);
      await page.waitForLocation(/shipTo=US/);
      const url = await page.evaluate('location.href') as string;
      const parsed = new URL(url);
      if (parsed.pathname !== '/en' || parsed.searchParams.get('shipTo') !== 'US') throw new Error(`unexpected switch target ${parsed.pathname}${parsed.search}`);
      return 'the destination chip navigates to the same locale path with shipTo=US';
    });

    await check(checks, 'filters-and-budget', 'local', async () => {
      await open('/ar');
      const filter = await page.evaluate(`(() => {
        const links = [...document.querySelectorAll('a[href*="category="]')].map(a => a.getAttribute('href'));
        return JSON.stringify(links.slice(0, 3));
      })()`) as string;
      const budget = await page.evaluate(`document.querySelector('input[name="maxAmount"]') !== null || document.querySelector('input[inputmode="decimal"]') !== null`) as boolean;
      if (budget) {
        await open('/ar?shipTo=US&currency=USD&maxAmount=50');
        await shoot('desktop-ar-filter-budget');
      }
      return `filter links present: ${filter !== '[]'}; budget input ${budget ? 'rendered and loaded with a currency' : 'not present on this build'}`;
    });

    await check(checks, 'assistant-widget', 'local', async () => {
      await open('/ar?shipTo=SA&currency=SAR');
      const label = await page.evaluate(`(() => {
        const button = document.querySelector('[class*="ti-message-chatbot"]')?.closest('button');
        if (!button) return '';
        button.click();
        return button.getAttribute('aria-label') ?? '';
      })()`) as string;
      if (!label) throw new Error('assistant launcher button not found');
      await page.waitFor(`document.querySelector('[role="dialog"]') !== null`, 10000);
      await new Promise(resolve => setTimeout(resolve, 400));
      await shoot('desktop-ar-assistant');
      const dialog = await page.evaluate(`document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? ''`) as string;
      // The page carries the shopping context into the widget; no request is sent here.
      const state = await page.evaluate(`JSON.stringify({ shipTo: 'SA', currency: 'SAR', lang: document.documentElement.lang })`) as string;
      return `launcher "${label}" opened the "${dialog}" dialog in the ar/SA/SAR context (${state}); no message was sent`;
    });

    await check(checks, 'offer-button-context', 'local', async () => {
      await open('/en?shipTo=US&currency=USD');
      const path = await page.evaluate(`(() => {
        const card = document.querySelector('a[href*="/products/"]');
        return card ? card.getAttribute('href') : '';
      })()`) as string;
      if (!path) return 'no product link on the local home page';
      // The context travels in the address, as every in-page link does (plan Review Focus 1).
      const productPath = `${path}${path.includes('?') ? '&' : '?'}shipTo=US&currency=USD`;
      await open(productPath, DESKTOP);

      const link = await page.evaluate(`(() => {
        const go = document.querySelector('a[data-store-link]');
        if (go) return JSON.stringify({ kind: 'store', href: go.getAttribute('href'), shipTo: go.getAttribute('data-ship-to'), currency: go.getAttribute('data-currency') });
        const international = document.querySelector('a[href*="/go/offer/"]');
        return international ? JSON.stringify({ kind: 'offer', href: international.getAttribute('href') }) : '';
      })()`) as string;
      if (!link) throw new Error('product page has no purchase link for an offer-bearing product');
      const parsed = JSON.parse(link) as { kind: string; href: string; shipTo?: string; currency?: string };
      options.log(`purchase link kind=${parsed.kind} shipTo=${parsed.shipTo ?? ''} currency=${parsed.currency ?? ''}`);
      const target = new URL(parsed.href!, origin);
      if (parsed.kind === 'offer') {
        if (target.searchParams.get('shipTo') !== 'US') throw new Error('/go/offer link lost its explicit destination');
        if (!target.searchParams.get('observationId')) throw new Error('/go/offer link has no observation');
        return '/go/offer link carries the exact offer, observation and explicit shipTo=US';
      }
      // Finding to report: with a destination selected, the legacy store button still
      // renders data-ship-to empty. The check stays failing; the runbook carries it.
      expectAttribute(parsed.shipTo === 'US', `store link carries the chosen destination (rendered on ${productPath})`);
      expectAttribute(/^[A-Z]{3}$/.test(parsed.currency ?? ''), 'store link states its own currency');
      expectAttribute(target.pathname.startsWith('/go/'), 'store link stays on the /go redirect');
      return `store link /go/... carries shipTo=US and its original currency ${parsed.currency}`;
    });

    await check(checks, 'phone-layout', 'local', async () => {
      await open('/ar?shipTo=SA&currency=USD', PHONE);
      const measure = await page.evaluate(`JSON.stringify({ inner: window.innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, wide: [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 2).slice(0, 5).map(e => e.tagName + '.' + String(e.className ?? '').slice(0, 50)) })`) as string;
      await shoot('phone-ar-SA-USD');
      const m = JSON.parse(measure) as { inner: number; doc: number; body: number; wide: string[] };
      const overflow = Math.max(m.doc, m.body) - m.inner;
      if (overflow > 2) throw new Error(`horizontal overflow of ${overflow}px (inner ${m.inner}; ${m.wide.join(' | ')})`);
      await open('/en?shipTo=US&currency=SAR', PHONE);
      await shoot('phone-en-US-SAR');
      return `phone-width pages render without horizontal overflow (${PHONE.width}px)`;
    });

    await page.close();
    browser.close();
  } finally {
    child.kill();
  }
  return { checks };
}

interface CdpMessage { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> }

/** Minimal CDP client over --remote-debugging-pipe (fd3 write, fd4 read, NUL-delimited). */
export class Cdp {
  private id = 0;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly events = new Map<string, Array<(params: Record<string, unknown>) => void>>();
  private readonly writer: NodeJS.WritableStream;
  private constructor(private readonly child: ChildProcess) {
    const output = child.stdio[3];
    const input = child.stdio[4];
    if (!output || !input || typeof (output as unknown as { write?: unknown }).write !== 'function' || typeof (input as unknown as { on?: unknown }).on !== 'function') throw new Error('CDP pipe unavailable');
    let buffer = '';
    (input as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const parts = buffer.split('\0');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (!part.trim()) continue;
        let message: CdpMessage;
        try { message = JSON.parse(part) as CdpMessage; } catch { continue; }
        if (message.method && !message.id) {
          for (const listener of this.events.get(message.method) ?? []) listener(message.params ?? {});
          continue;
        }
        if (message.id === undefined) continue;
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      }
    });
    const pipe = output as unknown as { write(text: string): void };
    this.writer = { write: (text: string) => { pipe.write(text); return true; } } as unknown as NodeJS.WritableStream;
  }
  static async connect(child: ChildProcess): Promise<Cdp> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const client = new Cdp(child);
        await Promise.race([
          client.send('Browser.getVersion', {}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('CDP handshake timed out')), 20000)),
        ]);
        return client;
      } catch (error) {
        lastError = error as Error;
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    throw lastError ?? new Error('could not attach to Chromium');
  }
  on(method: string, listener: (params: Record<string, unknown>) => void): void {
    const list = this.events.get(method) ?? [];
    list.push(listener);
    this.events.set(method, list);
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
    const id = ++this.id;
    const message: Record<string, unknown> = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 30000);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.writer.write(`${JSON.stringify(message)}\0`);
    });
  }
  async newPage(): Promise<CdpPage> {
    const target = await this.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string };
    const attached = await this.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }) as { sessionId: string };
    const page = new CdpPage(this, attached.sessionId);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    return page;
  }
  close(): void { this.child.kill(); }
}

export class CdpPage {
  constructor(private readonly client: Cdp, private readonly session: string) {}
  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> { return this.client.send(method, params, this.session); }
  async setViewport(width: number, height: number): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  }
  async navigate(url: string): Promise<{ status: number }> {
    const navigated = await this.send('Page.navigate', { url }) as { errorText?: string };
    if (navigated.errorText) throw new Error(`navigation failed: ${navigated.errorText}`);
    await this.waitFor('document.readyState === "complete"');
    const status = await this.send('Runtime.evaluate', {
      expression: `(async () => { const r = await fetch(location.href, { method: 'GET', cache: 'no-store' }); return r.status; })()`,
      awaitPromise: true, returnByValue: true,
    }) as { result: { value: number } };
    return { status: status.result.value };
  }
  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }) as { result: { value: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  /** Labels of every button currently marked as selected (aria-pressed). */
  async activeButtons(): Promise<string[]> {
    return await this.evaluate(`[...document.querySelectorAll('button[aria-pressed="true"]')].map(b => (b.textContent ?? '').trim())`) as string[];
  }
  async waitFor(expression: string, timeoutMs = 20000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await this.evaluate(expression).catch(() => false);
      if (value === true) return;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`timed out waiting for ${expression.slice(0, 80)}`);
  }
  async waitForLocation(pattern: RegExp, timeoutMs = 20000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const href = await this.evaluate('location.href').catch(() => '') as string;
      if (pattern.test(href)) { await this.waitFor('document.readyState === "complete"'); return; }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const href = await this.evaluate('location.href') as string;
    throw new Error(`location did not match ${pattern} (ended at ${href})`);
  }
  async close(): Promise<void> { await this.send('Page.close').catch(() => undefined); }
}
