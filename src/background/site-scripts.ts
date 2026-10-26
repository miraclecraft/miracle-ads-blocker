// Scripts that run in the page's own world at document_start (see src/sites/).
// They are registered at runtime rather than in the manifest so they follow
// the user's switches: off everywhere unregisters them, and paused sites are
// excluded.

import { RULES_DIR } from '../shared/bundle.ts';
import type { SnippetEntry } from '../shared/filters/types.ts';
import { getSnippetEngine } from './snippets.ts';

interface SiteScript {
  id: string;
  js: string;
  matches: string[];
}

const SITE_SCRIPTS: SiteScript[] = [
  {
    id: 'youtube',
    js: 'sites/youtube.js',
    matches: ['https://www.youtube.com/*', 'https://m.youtube.com/*', 'https://www.youtube-nocookie.com/*'],
  },
];

const SNIPPETS_SCRIPT_ID = 'snippets-main';

export async function syncSiteScripts(enabled: boolean, pausedSites: string[]): Promise<void> {
  const ours = new Set([...SITE_SCRIPTS.map((s) => s.id), SNIPPETS_SCRIPT_ID]);
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const ids = registered.map((s) => s.id).filter((id) => ours.has(id));
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  if (!enabled) return;

  const scripts: SiteScript[] = [...SITE_SCRIPTS];
  const snippetSites = await packagedSnippetSites();
  if (snippetSites.length) {
    scripts.push({ id: SNIPPETS_SCRIPT_ID, js: 'sites/snippets-main.js', matches: sitePatterns(snippetSites) });
  }
  const { unregisteredSites } = await getSnippetEngine();
  const excludeMatches = sitePatterns(pausedSites);
  await chrome.scripting.registerContentScripts(
    scripts.map((script) => {
      const exclude =
        script.id === SNIPPETS_SCRIPT_ID ? [...excludeMatches, ...sitePatterns([...unregisteredSites])] : excludeMatches;
      return {
        id: script.id,
        js: [script.js],
        matches: script.matches,
        ...(exclude.length ? { excludeMatches: exclude } : {}),
        runAt: 'document_start' as const,
        world: 'MAIN' as const,
        allFrames: true,
      };
    }),
  );
}

async function packagedSnippetSites(): Promise<string[]> {
  const url = chrome.runtime.getURL(`${RULES_DIR}/snippets-main.json`);
  const rules = (await fetch(url).then((r) => r.json())) as SnippetEntry[];
  return [...new Set(rules.flatMap((rule) => rule.d))];
}

function sitePatterns(hosts: string[]): string[] {
  return hosts.flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`]);
}
