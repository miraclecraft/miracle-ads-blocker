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
}

export const SOURCES: FilterSource[] = [
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
