import type { FilterSource } from './sources.ts';

export interface ListValidators {
  url: string;
  etag?: string;
  lastModified?: string;
}

export type FetchResult =
  | { status: 'updated'; text: string; validators: ListValidators }
  | { status: 'unchanged' }
  | { status: 'failed'; errors: string[] };

const TIMEOUT_MS = 30_000;
const HOUR_MS = 3_600_000;

/**
 * Downloads a list, trying the official host first and then each mirror.
 * With `previous`, the request is conditional, so an unchanged list costs a
 * 304 instead of a full download.
 */
export async function fetchList(source: FilterSource, previous?: ListValidators): Promise<FetchResult> {
  const errors: string[] = [];
  for (const url of source.urls) {
    try {
      const headers: Record<string, string> = {};
      // Validators only mean something to the host that issued them.
      if (previous?.url === url) {
        if (previous.etag) headers['If-None-Match'] = previous.etag;
        if (previous.lastModified) headers['If-Modified-Since'] = previous.lastModified;
      }
      const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status === 304) return { status: 'unchanged' };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const text = await response.text();
      // Captive portals and error pages come back as HTML with a 200.
      if (/^\s*</.test(text)) throw new Error('received HTML instead of a filter list');

      const validators: ListValidators = { url };
      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');
      if (etag) validators.etag = etag;
      if (lastModified) validators.lastModified = lastModified;
      return { status: 'updated', text, validators };
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { status: 'failed', errors };
}

/** Reads `! Expires: 4 days` from a list header. Clamped to 1 hour to 14 days. */
export function listLifetimeMs(text: string): number {
  const match = /^!\s*Expires:\s*(\d+)\s*(hour|day)/im.exec(text.slice(0, 4_000));
  const hours = match ? Number(match[1]) * (match[2]!.toLowerCase() === 'day' ? 24 : 1) : 24;
  return Math.min(Math.max(hours, 1), 14 * 24) * HOUR_MS;
}
