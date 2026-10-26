import { fingerprint } from '../hash.ts';
import type { Filter, SnippetFilter } from './types.ts';

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
  private readonly snippetExceptions: SnippetFilter[] = [];

  add(filter: Filter, sourceBit: number): void {
    if (filter.kind === 'snippet') {
      if (filter.exception) return this.addSnippetException(filter);
      if (this.snippetExceptions.some((e) => cancels(e, filter))) return;
    }
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

  /** Applies to snippet rules from every list, whichever order they are added in. */
  private addSnippetException(exception: SnippetFilter): void {
    this.snippetExceptions.push(exception);
    for (const [fp, merged] of this.filters) {
      if (merged.filter.kind === 'snippet' && cancels(exception, merged.filter)) this.filters.delete(fp);
    }
  }
}

/** An exception cancels a rule with the same calls on any of the same sites. */
function cancels(exception: SnippetFilter, rule: SnippetFilter): boolean {
  return (
    rule.domains.some((d) => exception.domains.includes(d)) &&
    JSON.stringify(rule.calls) === JSON.stringify(exception.calls)
  );
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
