import { fingerprint } from '../hash.ts';
import type { Filter } from './types.ts';

export interface MergedFilter {
  fp: string;
  filter: Filter;
  /** Bit i is set when source i contains this filter. */
  mask: number;
  /** How many sources contain it. */
  votes: number;
}

/** Deduplicates filters across sources and records which sources agree on each. */
export class FilterMerger {
  readonly filters = new Map<string, MergedFilter>();

  add(filter: Filter, sourceBit: number): void {
    const fp = fingerprint(filter.key);
    const bit = 1 << sourceBit;
    const existing = this.filters.get(fp);
    if (!existing) {
      this.filters.set(fp, { fp, filter, mask: bit, votes: 1 });
    } else if (!(existing.mask & bit)) {
      existing.mask |= bit;
      existing.votes++;
    }
  }
}

/** Most agreed-on first, then the most trusted source, then stable by key. */
export function byRank(a: MergedFilter, b: MergedFilter): number {
  return (
    b.votes - a.votes ||
    lowestBit(a.mask) - lowestBit(b.mask) ||
    (a.filter.key < b.filter.key ? -1 : a.filter.key > b.filter.key ? 1 : 0)
  );
}

function lowestBit(mask: number): number {
  return 31 - Math.clz32(mask & -mask);
}
