// Site-specific scripts that run in the page's own world (see src/sites/).
// They are registered at runtime rather than in the manifest so they follow
// the user's switches: off everywhere unregisters them, and paused sites are
// excluded.

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

export async function syncSiteScripts(enabled: boolean, pausedSites: string[]): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const ids = registered.map((s) => s.id).filter((id) => SITE_SCRIPTS.some((s) => s.id === id));
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  if (!enabled) return;

  const excludeMatches = pausedSites.flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`]);
  await chrome.scripting.registerContentScripts(
    SITE_SCRIPTS.map((script) => ({
      id: script.id,
      js: [script.js],
      matches: script.matches,
      ...(excludeMatches.length ? { excludeMatches } : {}),
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
    })),
  );
}
