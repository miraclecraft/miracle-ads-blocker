# Development

Requires Node.js 24 or later. Scripts are TypeScript run directly by Node; the
extension is bundled with esbuild.

```sh
npm install
npm run lists     # download and merge the filter lists into rules/
npm run build     # bundle the extension into dist/
npm test
npm run typecheck
npm run test:e2e  # load dist/ into Edge and Brave and check it really blocks
```

`test:e2e` uses whichever of Edge and Brave are installed, each with a
throwaway profile, so your own browser profile is never touched. It serves a
local test page and checks network blocking, element hiding, a live list update,
pausing a site and turning blocking off. Run it before tagging a release. Point
it at other browsers with `BROWSERS="name=path;name=path"` (Chrome's branded
builds can't be used: they ignore `--load-extension`).

Load `dist/` from `edge://extensions` with **Developer mode** on. `npm run watch`
rebuilds on every change; reload the extension afterwards.

`npm run icons` re-renders `icons/*.png` from `docs/assets/logo.svg`.

## Layout

```
scripts/build-lists.ts   CI: fetch, merge, rank, validate, write rules/
scripts/build.ts         bundle src/ into dist/
src/shared/              code shared by CI and the extension
  sources.ts             the filter lists and their mirrors
  filters/parse.ts       ABP / AdGuard / uBO syntax and hosts files -> filters
  filters/convert.ts     filters -> declarativeNetRequest rules
  filters/merge.ts       dedupe across lists and rank by agreement
  plan.ts                runtime diff against the packaged rules
src/background/          service worker: scheduling, applying updates, element hiding
src/offscreen/           worker that downloads and merges lists off the main thread
src/content/             reports page classes/IDs for element hiding
src/popup/               toolbar popup
```

## The packaged rules

`npm run lists` writes:

| File | Contents |
|---|---|
| `rules/domains.json` | Static ruleset: every plain `\|\|domain^` block, 1,000 domains per rule |
| `rules/network.json` | Static ruleset: other network rules, most-agreed first, filling the 30,000 rules Chromium guarantees |
| `rules/network-extra.json` | Overflow ruleset, enabled at runtime only if the browser's shared rule pool has room |
| `rules/cosmetic.json` | Element-hiding rules |
| `rules/index.json` | Fingerprint, source mask and location of every packaged filter, used by the runtime diff |
| `rules/meta.json` | Build time and counts, for the popup |

The build fails rather than shipping a partial bundle if a list can't be
downloaded or has fewer filters than its `minFilters`.

## Runtime updates

On browser start (30 seconds in) and every 6 hours, the service worker opens an
offscreen document whose worker:

1. Sends a conditional request for each list (on start: all of them; otherwise
   only lists past their `! Expires:` time), trying mirrors when the official
   host fails.
2. Rejects a download with less than half the filters of the packaged copy.
3. If anything changed, parses every list it holds a fresh copy of, and diffs
   the result against `rules/index.json` (`src/shared/plan.ts`).

The service worker then applies the plan in one `updateDynamicRules` call and
disables static rules that were removed upstream. Installing a new version
clears everything learned at runtime, since it described the old bundle.

## Adding a list

Add it to `src/shared/sources.ts`. Set `bundle: false` unless its licence
allows redistribution; unbundled lists are only fetched at runtime. Update
`THIRD_PARTY_NOTICES.md`.

## Not supported yet

Filters with these features are skipped and counted as unsupported by
`npm run lists`:

- Regex network filters (they need RE2 validation and have a 1,000-rule quota)
- Entity domains like `google.*`
- Scriptlets (`##+js(...)`), procedural and extended CSS, HTML filtering
- `$redirect`, `$removeparam`, `$csp`, `$popup`, `$badfilter`, `$generichide` and similar options
