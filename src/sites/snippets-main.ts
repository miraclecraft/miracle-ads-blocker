// The packaged page-world snippets, registered to run at document_start on
// the sites that have them. A registered script is guaranteed to run before
// any of the page's own scripts, which data-rewriting snippets (Facebook's
// sponsored feed items, for example) depend on. Rules added later by list
// updates are injected by the background instead (see background/snippets.ts).

import main from '@eyeo/snippets/main';
import type { SnippetEntry } from '../shared/filters/types.ts';

/** rules/snippets-main.json, compiled in by scripts/build.ts. */
declare const PACKAGED_SNIPPETS: SnippetEntry[];
/**
 * Set by `build.ts --debug-snippets` only: rules can then be skipped per page
 * through localStorage['miracle-skip-snippets'] (a JSON array of rule indexes),
 * and the indexes that ran are recorded on window.__miracleSnippets.
 */
declare const DEBUG_SNIPPETS: boolean;

const parts = location.hostname.split('.');
const hosts = parts.map((_, i) => parts.slice(i).join('.'));
const calls: string[][] = [];
let skip = new Set<number>();
if (DEBUG_SNIPPETS) {
  try {
    skip = new Set(JSON.parse(localStorage.getItem('miracle-skip-snippets') ?? '[]') as number[]);
  } catch {}
}
PACKAGED_SNIPPETS.forEach((rule, index) => {
  if (!rule.d.some((d) => hosts.includes(d)) || rule.x?.some((x) => hosts.includes(x))) return;
  if (DEBUG_SNIPPETS) {
    const ran = ((window as unknown as { __miracleSnippets?: unknown[] }).__miracleSnippets ??= []);
    ran.push({ index, skipped: skip.has(index), calls: rule.c });
    if (skip.has(index)) return;
  }
  calls.push(...rule.c);
});
if (calls.length) main({ world: 'MAIN' }, ...calls);
