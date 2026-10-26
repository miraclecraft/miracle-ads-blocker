// Element hiding. Site-specific selectors are injected when a page starts
// loading. Generic selectors are keyed by the first class or ID they need, and
// only injected once the content script reports that class or ID on the page,
// so a page never has to parse tens of thousands of irrelevant selectors.

import { RULES_DIR } from '../shared/bundle.ts';
import { cosmeticKey } from '../shared/filters/parse.ts';
import type { CosmeticEntry } from '../shared/filters/types.ts';
import { fingerprint } from '../shared/hash.ts';
import { getLocal } from '../shared/storage-keys.ts';

interface Scoped {
  selector: string;
  excluded?: string[];
}

class CosmeticEngine {
  private readonly specific = new Map<string, Scoped[]>();
  private readonly exceptions = new Map<string, Set<string>>();
  private readonly keyed = new Map<string, Scoped[]>();
  private readonly keyless: Scoped[] = [];

  add(entry: CosmeticEntry): void {
    const scoped: Scoped = entry.x ? { selector: entry.s, excluded: entry.x } : { selector: entry.s };
    if (entry.e) {
      for (const domain of entry.d ?? []) getOrCreate(this.exceptions, domain, () => new Set()).add(entry.s);
    } else if (entry.d) {
      for (const domain of entry.d) getOrCreate(this.specific, domain, () => []).push(scoped);
    } else {
      const token = selectorToken(entry.s);
      if (token) getOrCreate(this.keyed, token, () => []).push(scoped);
      else this.keyless.push(scoped);
    }
  }

  /** Selectors to inject as soon as a page on `host` starts loading. */
  forPage(host: string): string[] {
    const scope = this.scope(host);
    const selectors: string[] = [];
    for (const h of scope.hosts) for (const s of this.specific.get(h) ?? []) if (scope.applies(s)) selectors.push(s.selector);
    for (const s of this.keyless) if (scope.applies(s)) selectors.push(s.selector);
    return selectors;
  }

  /** Generic selectors that can match now that `tokens` (`.class`, `#id`) are on the page. */
  forTokens(host: string, tokens: string[]): string[] {
    const scope = this.scope(host);
    const selectors: string[] = [];
    for (const token of tokens) for (const s of this.keyed.get(token) ?? []) if (scope.applies(s)) selectors.push(s.selector);
    return selectors;
  }

  private scope(host: string) {
    const hosts = hostAndParents(host);
    const excepted = new Set<string>();
    for (const h of hosts) for (const selector of this.exceptions.get(h) ?? []) excepted.add(selector);
    return {
      hosts,
      applies: (s: Scoped) => !excepted.has(s.selector) && !s.excluded?.some((x) => hosts.includes(x)),
    };
  }
}

let engine: Promise<CosmeticEngine> | undefined;

export function getCosmeticEngine(): Promise<CosmeticEngine> {
  engine ??= loadEngine().catch((error) => {
    engine = undefined;
    throw error;
  });
  return engine;
}

/** Call after the stored delta changes. */
export function resetCosmeticEngine(): void {
  engine = undefined;
}

async function loadEngine(): Promise<CosmeticEngine> {
  const [bundled, stored] = await Promise.all([
    fetch(chrome.runtime.getURL(`${RULES_DIR}/cosmetic.json`)).then((r) => r.json() as Promise<CosmeticEntry[]>),
    getLocal(['cosmeticDelta']),
  ]);
  const delta = stored.cosmeticDelta;
  const removed = new Set(delta?.removed ?? []);

  const result = new CosmeticEngine();
  for (const entry of bundled) {
    if (removed.size && removed.has(fingerprint(cosmeticKey(entry.s, entry.d ?? [], entry.x ?? [], !!entry.e)))) continue;
    result.add(entry);
  }
  for (const entry of delta?.added ?? []) result.add(entry);
  return result;
}

export async function injectHidingCss(tabId: number, frameId: number, selectors: string[]): Promise<void> {
  if (!selectors.length) return;
  // One rule per selector: an invalid selector then only loses its own rule.
  const css = selectors.map((s) => `${s}{display:none!important}`).join('\n');
  await chrome.scripting.insertCSS({ target: { tabId, frameIds: [frameId] }, css, origin: 'USER' });
}

/**
 * The first class or ID an element must carry for `selector` to match it.
 * Undefined when there isn't a reliable one (selector lists, escapes, ...).
 */
export function selectorToken(selector: string): string | undefined {
  if (selector.includes('\\')) return undefined;
  let stripped = selector.replace(/\[[^\]]*\]/g, '');
  // Drop :not(...), :has(...) and friends, innermost first.
  for (let previous = ''; previous !== stripped; ) {
    previous = stripped;
    stripped = stripped.replace(/\([^()]*\)/g, '');
  }
  if (stripped.includes(',')) return undefined;
  return /[#.][A-Za-z_-][\w-]*/.exec(stripped)?.[0];
}

export function hostAndParents(host: string): string[] {
  const parts = host.split('.');
  return parts.map((_, i) => parts.slice(i).join('.'));
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) map.set(key, (value = create()));
  return value;
}
