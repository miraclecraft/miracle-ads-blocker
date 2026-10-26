// YouTube serves video ads from its own servers inside the player data, so no
// network rule can block them without blocking the video too. This script runs
// in the page's own JavaScript world before YouTube's code, and removes the ad
// entries from the player data before the player reads it.
//
// Hooks are Proxies around the native functions, so they still look native
// (e.g. `fetch.toString()`) to the page.

const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];
const AD_KEY_RE = new RegExp(`"(${AD_KEYS.join('|')})"`, 'g');
/** Player API endpoints that carry ad data. */
const PLAYER_API_RE = /\/youtubei\/v1\/(?:player|get_watch|next|reel\/reel_watch_sequence)\b/;

type Json = Record<string, unknown>;

function prune<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const object = value as Json;
  for (const key of AD_KEYS) delete object[key];
  if (object.playerResponse) prune(object.playerResponse);
  // get_watch and some /next responses wrap player data in an array.
  if (Array.isArray(value)) for (const item of value) prune(item);
  return value;
}

/** Renames ad keys in raw JSON so the player never sees them. */
function cleanText(text: string): string {
  return text.replace(AD_KEY_RE, '"no_$1"');
}

// Initial page load: `var ytInitialPlayerResponse = {...}` in an inline script.
// An accessor defined first turns that assignment into a call to our setter.
let initialPlayerResponse: unknown;
Object.defineProperty(window, 'ytInitialPlayerResponse', {
  configurable: true,
  get: () => initialPlayerResponse,
  set: (value) => {
    initialPlayerResponse = prune(value);
  },
});

JSON.parse = new Proxy(JSON.parse, {
  apply(target, thisArg, args) {
    return prune(Reflect.apply(target, thisArg, args));
  },
});

window.fetch = new Proxy(window.fetch, {
  async apply(target, thisArg, args: Parameters<typeof fetch>) {
    const response: Response = await Reflect.apply(target, thisArg, args);
    const [input] = args;
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (!PLAYER_API_RE.test(url)) return response;

    const text = await response.clone().text();
    if (!text.match(AD_KEY_RE)) return response;
    const cleaned = new Response(cleanText(text), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    Object.defineProperty(cleaned, 'url', { value: response.url });
    return cleaned;
  },
});

// Older player paths still use XHR.
const xhrUrls = new WeakMap<XMLHttpRequest, string>();
const xhrCleaned = new WeakMap<XMLHttpRequest, string>();
const xhrProto = XMLHttpRequest.prototype;
xhrProto.open = new Proxy(xhrProto.open, {
  apply(target, xhr: XMLHttpRequest, args) {
    xhrUrls.set(xhr, String(args[1]));
    xhrCleaned.delete(xhr);
    return Reflect.apply(target, xhr, args);
  },
});
for (const property of ['responseText', 'response'] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(xhrProto, property);
  if (!descriptor?.get) continue;
  Object.defineProperty(xhrProto, property, {
    ...descriptor,
    get: new Proxy(descriptor.get, {
      apply(target, xhr: XMLHttpRequest, args) {
        const value = Reflect.apply(target, xhr, args);
        if (xhr.readyState !== 4 || !PLAYER_API_RE.test(xhrUrls.get(xhr) ?? '')) return value;
        if (typeof value === 'string') {
          let cleaned = xhrCleaned.get(xhr);
          if (cleaned === undefined) xhrCleaned.set(xhr, (cleaned = cleanText(value)));
          return cleaned;
        }
        return prune(value);
      },
    }),
  });
}

// Backup: if an ad slips through anyway, mute it, jump to its end and press skip.
const SKIP_BUTTONS = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern';
setInterval(() => {
  const player = document.querySelector('#movie_player.ad-showing');
  if (!player) return;
  const video = player.querySelector('video');
  if (video && Number.isFinite(video.duration)) {
    video.muted = true;
    video.currentTime = video.duration;
  }
  player.querySelector<HTMLElement>(SKIP_BUTTONS)?.click();
}, 300);
