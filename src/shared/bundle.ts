// The files CI writes to rules/ and the extension reads back at runtime.

export const RULESET = {
  domains: 'domains',
  network: 'network',
  networkExtra: 'network-extra',
} as const;

/** Static rules Chromium guarantees every extension. */
export const GUARANTEED_STATIC_RULES = 30_000;
/** Overflow ruleset, enabled only when the browser's shared pool has room. */
export const EXTRA_STATIC_RULES = 60_000;

export const RULES_DIR = 'rules';

export interface BundleSourceInfo {
  id: string;
  /** Supported filters parsed from this source at build time. */
  filters: number;
  url: string;
  etag?: string;
  lastModified?: string;
}

/**
 * Where a bundled filter lives:
 * - positive: a rule ID in the network rulesets (IDs above `networkLastId` are in network-extra)
 * - negative: the negated rule ID of a domain chunk in the domains ruleset
 * - zero: an element-hiding entry in cosmetic.json or a snippet entry in snippets.json
 */
export type BundleLocation = number;

export interface BundleIndex {
  version: 1;
  builtAt: string;
  /** Bit i of an entry's mask refers to sources[i]. */
  sources: BundleSourceInfo[];
  networkLastId: number;
  entries: [fp: string, mask: number, loc: BundleLocation][];
  /** Filters parsed at build time that didn't fit any ruleset. */
  dropped: string[];
}

/** Small summary for the popup, so it never has to load the index. */
export interface BundleMeta {
  builtAt: string;
  sources: { id: string; filters: number }[];
  rules: { domains: number; network: number; networkExtra: number; cosmetic: number; snippets: number };
}
