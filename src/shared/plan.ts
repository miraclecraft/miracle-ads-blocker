// Works out what has to change on top of the bundled rules so the extension
// matches the latest lists:
// - filters that are new upstream become dynamic rules (most agreed-on first)
// - bundled rules every source has since deleted get disabled
// - a domain chunk that lost domains is disabled and re-added, minus those
//   domains, as a dynamic rule
// Pure and synchronous so it can be unit tested and run inside a worker.

import { RULESET, type BundleIndex } from './bundle.ts';
import { chunk, cosmeticEntry, DOMAIN_CHUNK_SIZE, domainChunkRule, networkRule } from './filters/convert.ts';
import { byRank, type MergedFilter } from './filters/merge.ts';
import type { CosmeticEntry, DnrRule, DnrRuleDraft } from './filters/types.ts';
import { fingerprint } from './hash.ts';

export interface PlanInput {
  index: BundleIndex;
  /** The domains ruleset, to rebuild chunks that lost domains. */
  domainRules: DnrRule[];
  /** Filters from every source we hold a fresh copy of, merged. */
  fresh: Map<string, MergedFilter>;
  /** IDs of bundled sources we hold a fresh copy of. */
  freshSources: Set<string>;
  maxDynamicRules: number;
  maxDisabledStaticRules: number;
}

export interface Plan {
  dynamicRules: DnrRuleDraft[];
  disabledStaticRules: Record<string, number[]>;
  cosmeticAdded: CosmeticEntry[];
  /** Fingerprints of bundled element-hiding entries that were removed upstream. */
  cosmeticRemoved: string[];
  stats: {
    added: number;
    removed: number;
    /** New filters that didn't fit the dynamic rule budget. */
    skipped: number;
  };
}

export function computePlan(input: PlanInput): Plan {
  const { index, fresh } = input;

  // Bundled sources we have no fresh copy of still vouch for their filters.
  let staleMask = 0;
  index.sources.forEach((source, bit) => {
    if (!input.freshSources.has(source.id)) staleMask |= 1 << bit;
  });

  const known = new Set<string>(index.dropped);
  const disabledNetwork: number[] = [];
  const disabledExtra: number[] = [];
  const shrunkChunks = new Set<number>();
  const cosmeticRemoved: string[] = [];
  const domainMasks = new Map<string, number>();

  for (const [fp, mask, loc] of index.entries) {
    known.add(fp);
    if (loc < 0) domainMasks.set(fp, mask);
    if (fresh.has(fp) || mask & staleMask) continue;
    if (loc > 0) (loc > index.networkLastId ? disabledExtra : disabledNetwork).push(loc);
    else if (loc < 0) shrunkChunks.add(-loc);
    else cosmeticRemoved.push(fp);
  }

  const dynamicRules: DnrRuleDraft[] = [];
  const disabledDomains: number[] = [];
  let removed = disabledNetwork.length + disabledExtra.length + cosmeticRemoved.length;

  // Shrunk chunks first: until a replacement is added, its domains go unblocked.
  for (const rule of input.domainRules) {
    if (!shrunkChunks.has(rule.id)) continue;
    const all = rule.condition.requestDomains ?? [];
    const kept = all.filter((domain) => {
      const fp = fingerprint(`||${domain}^`);
      return fresh.has(fp) || ((domainMasks.get(fp) ?? 0) & staleMask) !== 0;
    });
    removed += all.length - kept.length;
    if (kept.length && dynamicRules.length >= input.maxDynamicRules) continue;
    if (kept.length) dynamicRules.push(domainChunkRule(kept));
    disabledDomains.push(rule.id);
  }

  const additions = [...fresh.values()].filter((m) => !known.has(m.fp)).sort(byRank);
  const newDomains: string[] = [];
  const newNetwork: MergedFilter[] = [];
  const cosmeticAdded: CosmeticEntry[] = [];
  for (const m of additions) {
    if (m.filter.kind === 'domain') newDomains.push(m.filter.domain);
    else if (m.filter.kind === 'network') newNetwork.push(m);
    else cosmeticAdded.push(cosmeticEntry(m.filter));
  }

  let skipped = 0;
  for (const domains of chunk(newDomains, DOMAIN_CHUNK_SIZE)) {
    if (dynamicRules.length < input.maxDynamicRules) dynamicRules.push(domainChunkRule(domains));
    else skipped += domains.length;
  }
  for (const m of newNetwork) {
    if (m.filter.kind !== 'network') continue;
    if (dynamicRules.length < input.maxDynamicRules) dynamicRules.push(networkRule(m.filter));
    else skipped++;
  }

  return {
    dynamicRules,
    disabledStaticRules: {
      [RULESET.domains]: disabledDomains,
      [RULESET.network]: disabledNetwork.slice(0, input.maxDisabledStaticRules),
      [RULESET.networkExtra]: disabledExtra.slice(0, input.maxDisabledStaticRules),
    },
    cosmeticAdded,
    cosmeticRemoved,
    stats: { added: additions.length - skipped, removed, skipped },
  };
}
