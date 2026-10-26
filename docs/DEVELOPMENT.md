# Development

Requires Node.js 24 or later. Scripts are TypeScript run directly by Node; the
extension is bundled with esbuild.

```sh
npm install
npm run lists     # download and merge the filter lists into rules/
npm run build     # bundle the extension into dist/
npm test
npm run typecheck
npm run test:e2e  # load dist/ into Edge and check it really blocks
```

`test:e2e` runs in Microsoft Edge with a throwaway profile, so your own
browser profile is never touched. It serves a
local test page and checks network blocking, element hiding, a live list update,
pausing a site and turning blocking off. Run it before tagging a release. Point
it at other Chromium browsers with `BROWSERS="name=path;name=path"` (Chrome's
branded builds can't be used: they ignore `--load-extension`).

Load `dist/` from `edge://extensions` with **Developer mode** on. `npm run watch`
rebuilds on every change; reload the extension afterwards.

`npm run icons` re-renders `icons/*.png` from `docs/assets/logo.svg`.

## Layout

```
scripts/build-lists.ts   CI: fetch, merge, rank, validate, write rules/
scripts/build.ts         bundle src/ into dist/
filters/miracle-fixes.txt  corrections to upstream rules
src/shared/              code shared by CI and the extension
  sources.ts             the filter lists and their mirrors
  filters/parse.ts       ABP / AdGuard / uBO syntax and hosts files -> filters
  filters/convert.ts     filters -> declarativeNetRequest rules
  filters/merge.ts       dedupe across lists and rank by agreement
  plan.ts                runtime diff against the packaged rules
src/background/          service worker: scheduling, applying updates, element hiding
src/offscreen/           worker that downloads and merges lists off the main thread
src/content/             reports page classes/IDs for element hiding
src/sites/               page-world scripts: YouTube, packaged snippets
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

## Snippets

`#$#` rules are Adblock Plus snippets, run with eyeo's own library
(`@eyeo/snippets`). Only lists with `snippets: true` in `sources.ts` may supply
them (EasyList, the ABP anti-circumvention list and Miracle fixes), as in
Adblock Plus. AdGuard's and uBO's script rules use other syntaxes and stay
unsupported.

- Packaged rules for the page's own world (rewriting data such as Facebook's
  sponsored feed items) are compiled into `sites/snippets-main.js`, which is
  registered at document_start on the sites they target, so they always run
  before the page's scripts.
- Isolated-world rules (hiding elements), and page-world rules added by list
  updates since the build, are injected by the background when a frame commits
  a navigation (`src/background/snippets.ts`). Rules added this way can arrive
  after the page's first scripts have run; the next release packages them.
- A site whose packaged page-world rules were removed upstream is left out of
  the registered script, and its current rules are injected instead.

`node scripts/build.ts --debug-snippets` builds a `dist/` where a page can skip
packaged rules: set `localStorage['miracle-skip-snippets']` to a JSON array of
rule indexes and reload; `window.__miracleSnippets` lists the rules that ran.
Never release a debug build.

## Fixing an upstream rule

`filters/miracle-fixes.txt` is packaged with the extension and applied on top of
every list, at build time and on every runtime update. To switch off a faulty
snippet rule, add a `#@$#` exception with its exact upstream text, then add a
corrected `#$#` rule if one is needed. If upstream later changes the rule's
text, the exception stops matching, so check whether the new version still
needs fixing.

## Adding a list

Add it to `src/shared/sources.ts`. Set `bundle: false` unless its licence
allows redistribution; unbundled lists are only fetched at runtime. Set
`snippets: true` only for lists from the snippet authors' ecosystem. Update
`THIRD_PARTY_NOTICES.md`.

## Not supported yet

Filters with these features are skipped and counted as unsupported by
`npm run lists`:

- Regex network filters (they need RE2 validation and have a 1,000-rule quota)
- Entity domains like `google.*`
- uBO scriptlets (`##+js(...)`), AdGuard scripts (`#%#`), procedural and extended CSS, HTML filtering
- `$redirect`, `$removeparam`, `$csp`, `$popup`, `$badfilter`, `$generichide` and similar options
