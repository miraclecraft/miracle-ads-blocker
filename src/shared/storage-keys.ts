import type { CosmeticEntry, SnippetEntry } from './filters/types.ts';
import type { LastRefresh } from './messages.ts';

/** Cache Storage bucket holding the latest downloaded copy of each list. */
export const LIST_CACHE = 'filter-lists-v1';

/** Element-hiding and snippet changes on top of the bundled files. */
export interface PageDelta {
  cosmetic: CosmeticEntry[];
  snippets: SnippetEntry[];
  /** Fingerprints of bundled entries removed upstream. */
  removed: string[];
}

/** Everything kept in chrome.storage.local. */
export interface LocalState {
  enabled: boolean;
  pausedSites: string[];
  lastSignature: string;
  lastRefresh: LastRefresh;
  pageDelta: PageDelta;
}

/** Everything kept in chrome.storage.session. */
export interface SessionState {
  refreshStartedAt: number;
}

export function getLocal<K extends keyof LocalState>(keys: K[]): Promise<Partial<Pick<LocalState, K>>> {
  return chrome.storage.local.get(keys) as Promise<Partial<Pick<LocalState, K>>>;
}

export function getSession<K extends keyof SessionState>(keys: K[]): Promise<Partial<Pick<SessionState, K>>> {
  return chrome.storage.session.get(keys) as Promise<Partial<Pick<SessionState, K>>>;
}
