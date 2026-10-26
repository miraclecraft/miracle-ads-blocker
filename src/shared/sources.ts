// The open-source filter lists we merge. Order matters: earlier sources are
// trusted more when two rules tie on how many lists agree on them.

export type ListFormat = 'abp' | 'hosts';

export interface FilterSource {
  id: string;
  name: string;
  /** Tried in order; the first is the official host, the rest are mirrors. */
  urls: string[];
  format: ListFormat;
  homepage: string;
  license: string;
  /**
   * Whether CI packages this list into the extension. Only lists whose
   * licence lets us redistribute them may be bundled; the rest are fetched
   * by the extension at runtime and never shipped.
   */
  bundle: boolean;
  /** A download with fewer supported filters than this is treated as broken. */
  minFilters: number;
  /**
   * Whether this list may run snippets (`#$#` rules) in pages. As in Adblock
   * Plus, only lists maintained by the snippet authors' ecosystem are trusted
   * to run code-configuring rules.
   */
  snippets?: boolean;
  /** Shipped inside the extension (urls[0] is a path in it), never downloaded. */
  local?: boolean;
}

export const SOURCES: FilterSource[] = [
  {
    id: 'miracle-fixes',
    name: 'Miracle fixes',
    urls: ['filters/miracle-fixes.txt'],
    format: 'abp',
    homepage: 'https://github.com/miraclecraft/miracle-ads-blocker',
    license: 'GPL-3.0-only',
    bundle: true,
    minFilters: 1,
    snippets: true,
    local: true,
  },
  {
    id: 'easylist',
    name: 'EasyList',
    urls: [
      'https://easylist.to/easylist/easylist.txt',
      'https://easylist-downloads.adblockplus.org/easylist.txt',
    ],
    format: 'abp',
    homepage: 'https://easylist.to/',
    license: 'GPL-3.0-or-later OR CC-BY-SA-3.0',
    bundle: true,
    minFilters: 20_000,
    snippets: true,
  },
  {
    id: 'abp-anti-cv',
    name: 'ABP anti-circumvention',
    urls: ['https://easylist-downloads.adblockplus.org/abp-filters-anti-cv.txt'],
    format: 'abp',
    homepage: 'https://gitlab.com/eyeo/anti-cv/abp-filters-anti-cv',
    license: 'GPL-3.0',
    bundle: true,
    minFilters: 500,
    snippets: true,
  },
  {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    urls: [
      'https://easylist.to/easylist/easyprivacy.txt',
      'https://easylist-downloads.adblockplus.org/easyprivacy.txt',
    ],
    format: 'abp',
    homepage: 'https://easylist.to/',
    license: 'GPL-3.0-or-later OR CC-BY-SA-3.0',
    bundle: true,
    minFilters: 10_000,
  },
  {
    id: 'adguard-base',
    name: 'AdGuard Base',
    urls: [
      'https://filters.adtidy.org/extension/chromium/filters/2.txt',
      'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_2_Base/filter.txt',
    ],
    format: 'abp',
    homepage: 'https://github.com/AdguardTeam/AdGuardFilters',
    license: 'GPL-3.0',
    bundle: true,
    minFilters: 20_000,
  },
  {
    id: 'ublock-filters',
    name: 'uBlock filters',
    urls: [
      'https://ublockorigin.github.io/uAssets/filters/filters.txt',
      'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
      'https://cdn.jsdelivr.net/gh/uBlockOrigin/uAssets@master/filters/filters.txt',
    ],
    format: 'abp',
    homepage: 'https://github.com/uBlockOrigin/uAssets',
    license: 'GPL-3.0',
    bundle: true,
    minFilters: 1_000,
  },
  {
    id: 'fanboy-annoyance',
    name: "Fanboy's Annoyance List",
    urls: ['https://easylist.to/easylist/fanboy-annoyance.txt'],
    format: 'abp',
    homepage: 'https://easylist.to/',
    license: 'GPL-3.0-or-later OR CC-BY-SA-3.0',
    bundle: true,
    minFilters: 5_000,
  },
  {
    id: 'peter-lowe',
    name: "Peter Lowe's list",
    urls: ['https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext'],
    format: 'abp',
    homepage: 'https://pgl.yoyo.org/adservers/',
    // No licence is published, so we only fetch it at runtime and never ship it.
    license: 'No licence published',
    bundle: false,
    minFilters: 1_000,
  },
];
