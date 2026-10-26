// End-to-end check of dist/ in Microsoft Edge with a throwaway profile.
//
//   npm run build && npm run test:e2e
//
// To test other Chromium browsers, set BROWSERS:
// BROWSERS="edge=C:\path\msedge.exe;brave=C:\pathrave.exe".
// Chrome's branded builds can't be used: they ignore --load-extension.

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright-core';

const DIST = resolve('dist');

const KNOWN_BROWSERS: Record<string, string[]> = {
  edge: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
  ],
};

// A local site. Records which paths actually reached the server, so we can
// tell a blocked request from one that went through.
const PAGE = `<!doctype html><title>Miracle test page</title>
<div class="ad400" id="generic">generic ad box</div>
<amp-ad id="keyless">keyless ad element</amp-ad>
<div id="control" class="article">normal content</div>
<img id="pathad" src="/img/x-ad-sidebar.png">
<img id="ok" src="/img/photo.png">
<script>setTimeout(() => {
  const d = document.createElement('div');
  d.id = 'late'; d.className = 'ezoic-floating-bottom'; d.textContent = 'late ad';
  document.body.append(d);
}, 800);</script>`;
const AD_PATH = '/img/x-ad-sidebar.png';

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(DIST, 'manifest.json'))) {
  console.error('dist/ is missing. Run `npm run lists && npm run build` first.');
  process.exit(1);
}

const browsers = pickBrowsers();
if (!browsers.length) {
  console.error('Microsoft Edge not found. Set BROWSERS="edge=C:\path\msedge.exe".');
  process.exit(1);
}

const hits = new Set<string>();
const server = createServer((req, res) => {
  hits.add(req.url ?? '');
  if (req.url === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  else res.writeHead(200, { 'content-type': 'image/png' }).end();
});
await new Promise<void>((r) => server.listen(0, 'localhost', r));
const origin = `http://localhost:${(server.address() as AddressInfo).port}`;

let failures = 0;
for (const [label, exe] of browsers) {
  console.log(`\n== ${label} (${exe})`);
  failures += await runBrowser(exe);
}
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;

function pickBrowsers(): [string, string][] {
  if (process.env.BROWSERS) {
    return process.env.BROWSERS.split(';').map((entry) => entry.split('=') as [string, string]);
  }
  const found: [string, string][] = [];
  for (const [label, paths] of Object.entries(KNOWN_BROWSERS)) {
    const path = paths.find((p) => existsSync(p));
    if (path) found.push([label, path]);
  }
  return found;
}

async function runBrowser(exe: string): Promise<number> {
  const results: Result[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  };

  const profile = mkdtempSync(join(tmpdir(), 'miracle-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: exe,
    headless: false,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-first-run', '--no-default-browser-check'],
  });

  try {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => undefined));
    check('extension loads and its service worker starts', !!sw);
    if (!sw) return 1;
    const swErrors: string[] = [];
    sw.on('console', (m) => m.type() === 'error' && swErrors.push(m.text()));

    await waitForSetup(sw);
    await checkRulesets(sw, check);
    const page = await context.newPage();
    await checkPage(page, check);
    const popup = await openPopup(context, sw);
    await checkRefresh(sw, popup, check);
    await checkControls(page, popup, check);
    check('no errors logged by the service worker', swErrors.length === 0, swErrors.slice(0, 3).join(' | '));
  } catch (error) {
    check('run completed', false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
  return results.filter((r) => !r.ok).length;
}

type Check = (name: string, ok: boolean, detail?: string) => void;

/** onInstalled creates the refresh alarms last, so their presence means setup finished. */
async function waitForSetup(sw: Worker): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await sw.evaluate(async () => (await chrome.alarms.getAll()).length)) >= 2) return;
    await sleep(250);
  }
}

async function checkRulesets(sw: Worker, check: Check): Promise<void> {
  const info = await sw.evaluate(async () => {
    const dnr = chrome.declarativeNetRequest;
    const probe = async (url: string) => {
      const outcome = await dnr.testMatchOutcome({ url, type: 'script', initiator: 'https://news.example' });
      return outcome.matchedRules.map((m) => m.rulesetId);
    };
    return {
      enabled: await dnr.getEnabledRulesets(),
      available: await dnr.getAvailableStaticRuleCount(),
      userAgent: navigator.userAgent,
      ad: await probe('https://securepubads.g.doubleclick.net/tag/js/gpt.js'),
      tracker: await probe('https://www.google-analytics.com/analytics.js'),
      normal: await probe('https://example.org/app.js'),
    };
  });
  console.log(`      ${info.userAgent}`);
  check('packaged rulesets enabled', ['domains', 'network', 'network-extra'].every((id) => info.enabled.includes(id)), `${info.enabled.join(', ')}; ${info.available} rules of room left`);
  check('ad script matches a packaged rule', info.ad.length > 0);
  check('tracker matches a packaged rule', info.tracker.length > 0);
  check('normal script matches nothing', info.normal.length === 0, info.normal.join(', '));
}

async function checkPage(page: Page, check: Check): Promise<void> {
  const blocked: string[] = [];
  page.on('requestfailed', (r) => {
    if (r.failure()?.errorText.includes('BLOCKED_BY_CLIENT')) blocked.push(new URL(r.url()).pathname);
  });
  hits.clear();
  await page.goto(origin);
  await sleep(2_500);
  check('ad request blocked on a real page', blocked.includes(AD_PATH) && !hits.has(AD_PATH));
  check('normal request allowed', hits.has('/img/photo.png'));
  check('generic hiding rule applied (.ad400)', !(await isVisible(page, '#generic')));
  check('always-on hiding rule applied (amp-ad)', !(await isVisible(page, '#keyless')));
  check('hiding applied to an element added later', !(await isVisible(page, '#late')));
  check('normal content still visible', await isVisible(page, '#control'));
}

async function openPopup(context: BrowserContext, sw: Worker): Promise<Page> {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 340, height: 520 });
  await popup.goto(`chrome-extension://${new URL(sw.url()).host}/popup/popup.html`);
  return popup;
}

async function checkRefresh(sw: Worker, popup: Page, check: Check): Promise<void> {
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'refresh:now' }));
  let last: { ok: boolean; error?: string; added: number; removed: number; sources: { id: string; state: string }[] } | undefined;
  for (let i = 0; i < 120 && !last; i++) {
    await sleep(1_000);
    last = await sw.evaluate(async () => (await chrome.storage.local.get('lastRefresh')).lastRefresh as never);
  }
  check('live list update completes', !!last?.ok, last ? (last.error ?? `+${last.added} / -${last.removed} rules`) : 'timed out');
  const failed = last?.sources.filter((s) => s.state === 'failed').map((s) => s.id) ?? [];
  check('every list was reached', failed.length === 0, failed.join(', '));
  check('offscreen document closed afterwards', !(await sw.evaluate(() => chrome.offscreen.hasDocument())));
}

async function checkControls(page: Page, popup: Page, check: Check): Promise<void> {
  const send = (message: object) => popup.evaluate((m) => chrome.runtime.sendMessage(m), message);
  const reloadAndCheckAd = async () => {
    hits.clear();
    await page.reload();
    await sleep(2_000);
    return hits.has(AD_PATH);
  };

  await send({ type: 'popup:set-paused', host: 'localhost', paused: true });
  check('pausing a site lets its requests through', await reloadAndCheckAd());
  check('pausing a site stops element hiding', await isVisible(page, '#generic'));
  await send({ type: 'popup:set-paused', host: 'localhost', paused: false });

  await send({ type: 'popup:set-enabled', enabled: false });
  check('turning blocking off everywhere lets requests through', await reloadAndCheckAd());
  await send({ type: 'popup:set-enabled', enabled: true });
  check('turning it back on blocks again', !(await reloadAndCheckAd()));
}

function isVisible(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((s) => getComputedStyle(document.querySelector(s)!).display !== 'none', selector);
}
