# Third-party notices

Miracle - Ads Blocker is licensed under the GNU General Public License v3.0
only (see `LICENSE`), because it includes eyeo's snippets library, which is
GPL-3.0-only. The packaged rule files in `rules/` are generated from the filter
lists below and remain under their authors' licences.

## Included code

| Package | Authors | Licence |
|---|---|---|
| @eyeo/snippets | eyeo GmbH (https://gitlab.com/eyeo/snippets) | GPL-3.0-only |

The snippets library runs the `#$#` snippet rules from EasyList and the ABP
anti-circumvention list. It is bundled into `background.js` and
`sites/snippets-main.js`.

## Packaged filter lists

| List | Authors | Licence |
|---|---|---|
| EasyList | The EasyList authors (https://easylist.to/) | GPL-3.0-or-later or CC BY-SA 3.0 |
| EasyPrivacy | The EasyList authors (https://easylist.to/) | GPL-3.0-or-later or CC BY-SA 3.0 |
| Fanboy's Annoyance List | The EasyList authors (https://easylist.to/) | GPL-3.0-or-later or CC BY-SA 3.0 |
| ABP anti-circumvention filter list | eyeo GmbH (https://gitlab.com/eyeo/anti-cv/abp-filters-anti-cv) | GPL-3.0 |
| AdGuard Base filter | AdGuard (https://github.com/AdguardTeam/AdGuardFilters) | GPL-3.0 |
| uBlock filters | uBlock Origin contributors (https://github.com/uBlockOrigin/uAssets) | GPL-3.0 |

The rule files are converted from these lists: filters are normalized,
deduplicated across lists, translated to the browser's declarativeNetRequest
format, and filters the extension can't enforce are left out.
`filters/miracle-fixes.txt` (this project's own) corrects individual upstream
rules on top.

## Lists fetched at runtime only

| List | Authors | Why it isn't packaged |
|---|---|---|
| Peter Lowe's list | Peter Lowe (https://pgl.yoyo.org/adservers/) | No licence is published, so it is downloaded by the extension from its official host and never redistributed. |
