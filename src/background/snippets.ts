// Adblock Plus snippets (`#$#` rules), run with eyeo's own snippet library.
//
// - Packaged page-world snippets (which rewrite the data a page sees, like
//   Facebook's sponsored feed items) run from a script registered at
//   document_start (src/sites/snippets-main.ts), so they beat the page's code.
// - Everything else is injected when a frame commits a navigation: ISOLATED
//   snippets (which hide elements, like a post labelled "Sponsored"), and
//   page-world snippets added by list updates since the package was built.
// - A site whose packaged page-world rules were removed upstream is left out
//   of the registered script, and all its current rules are injected instead.

import isolated from '@eyeo/snippets/isolated/lite';
import main from '@eyeo/snippets/main';
import { RULES_DIR } from '../shared/bundle.ts';
import { snippetKey } from '../shared/filters/parse.ts';
import type { SnippetEntry } from '../shared/filters/types.ts';
import { fingerprint } from '../shared/hash.ts';
import { getLocal } from '../shared/storage-keys.ts';
import { getControls, isPaused } from './controls.ts';
import { hostAndParents } from './cosmetic.ts';

interface Rule {
  entry: SnippetEntry;
  /** Packaged rules' page-world calls already run from the registered script. */
  packaged: boolean;
}

class SnippetEngine {
  private readonly byDomain = new Map<string, Rule[]>();
  /** Sites left out of the registered script because their packaged rules changed. */
  readonly unregisteredSites = new Set<string>();

  add(entry: SnippetEntry, packaged: boolean): void {
    for (const domain of entry.d) {
      const rules = this.byDomain.get(domain);
      if (rules) rules.push({ entry, packaged });
      else this.byDomain.set(domain, [{ entry, packaged }]);
    }
  }

  /** The calls to inject into a frame on `host`, per world, each rule's calls kept in order. */
  injectionsFor(host: string): { main: string[][]; isolated: string[][] } {
    const hosts = hostAndParents(host);
    const registered = !hosts.some((h) => this.unregisteredSites.has(h));
    const used = new Set<SnippetEntry>();
    const result = { main: [] as string[][], isolated: [] as string[][] };
    for (const h of hosts) {
      for (const { entry, packaged } of this.byDomain.get(h) ?? []) {
        if (used.has(entry) || entry.x?.some((x) => hosts.includes(x))) continue;
        used.add(entry);
        for (const call of entry.c) {
          const [name] = call;
          if (!name) continue;
          if (isolated.has(name)) result.isolated.push(call);
          else if (main.has(name) && !(packaged && registered)) result.main.push(call);
        }
      }
    }
    return result;
  }
}

let engine: Promise<SnippetEngine> | undefined;

export function getSnippetEngine(): Promise<SnippetEngine> {
  engine ??= loadEngine().catch((error) => {
    engine = undefined;
    throw error;
  });
  return engine;
}

/** Call after the stored page delta changes. */
export function resetSnippetEngine(): void {
  engine = undefined;
}

async function loadEngine(): Promise<SnippetEngine> {
  const [bundled, { pageDelta }] = await Promise.all([
    fetch(chrome.runtime.getURL(`${RULES_DIR}/snippets.json`)).then((r) => r.json() as Promise<SnippetEntry[]>),
    getLocal(['pageDelta']),
  ]);
  const removed = new Set(pageDelta?.removed ?? []);
  const result = new SnippetEngine();
  for (const entry of bundled) {
    if (removed.size && removed.has(fingerprint(snippetKey(entry.d, entry.x ?? [], entry.c)))) {
      // The registered script would still run this rule's page-world calls.
      if (entry.c.some(([name]) => !!name && main.has(name))) for (const d of entry.d) result.unregisteredSites.add(d);
      continue;
    }
    result.add(entry, true);
  }
  for (const entry of pageDelta?.snippets ?? []) result.add(entry, false);
  return result;
}

// Remembers each tab's top-level site, so a frame's snippets can respect a
// site the user paused without an extra lookup on every navigation.
const topHosts = new Map<number, string>();

export async function runSnippets(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails): Promise<void> {
  const host = httpHost(details.url);
  if (details.frameId === 0) {
    if (host) topHosts.set(details.tabId, host);
    else topHosts.delete(details.tabId);
  }
  if (!host) return;

  const [snippets, { enabled, pausedSites }] = await Promise.all([getSnippetEngine(), getControls()]);
  if (!enabled) return;
  const topHost = details.frameId === 0 ? host : (topHosts.get(details.tabId) ?? (await tabHost(details.tabId)));
  if (topHost && isPaused(topHost, pausedSites)) return;

  const { main: mainCalls, isolated: isolatedCalls } = snippets.injectionsFor(host);
  if (!mainCalls.length && !isolatedCalls.length) return;
  const target = { tabId: details.tabId, documentIds: [details.documentId] };

  await Promise.all([
    mainCalls.length &&
      chrome.scripting.executeScript({
        target,
        world: 'MAIN',
        injectImmediately: true,
        func: main,
        args: [{ world: 'MAIN' }, ...mainCalls],
      }),
    isolatedCalls.length &&
      chrome.scripting.executeScript({
        target,
        world: 'ISOLATED',
        injectImmediately: true,
        func: isolated,
        args: [{ world: 'ISOLATED' }, ...isolatedCalls],
      }),
  ]).catch(() => {
    // The frame navigated away or was closed before the injection landed.
  });
}

export function forgetTab(tabId: number): void {
  topHosts.delete(tabId);
}

async function tabHost(tabId: number): Promise<string | undefined> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  const host = httpHost(tab?.url);
  if (host) topHosts.set(tabId, host);
  return host;
}

function httpHost(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? hostname : undefined;
  } catch {
    return undefined;
  }
}
