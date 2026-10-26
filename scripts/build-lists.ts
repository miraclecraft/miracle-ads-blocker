// CI step: download every bundled list, merge and rank the filters, and write
// the rulesets the extension ships with. Fails loudly rather than shipping a
// partial or suspicious bundle.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import main from '@eyeo/snippets/main';
import {
  EXTRA_STATIC_RULES,
  GUARANTEED_STATIC_RULES,
  RULES_DIR,
  type BundleIndex,
  type BundleMeta,
  type BundleSourceInfo,
} from '../src/shared/bundle.ts';
import {
  chunk,
  cosmeticEntry,
  DOMAIN_CHUNK_SIZE,
  domainChunkRule,
  networkRule,
  snippetEntry,
} from '../src/shared/filters/convert.ts';
import { byRank, FilterMerger, type MergedFilter } from '../src/shared/filters/merge.ts';
import { parseList } from '../src/shared/filters/parse.ts';
import type { CosmeticEntry, DnrRule, SnippetEntry } from '../src/shared/filters/types.ts';
import { fetchList } from '../src/shared/fetch-list.ts';
import { SOURCES } from '../src/shared/sources.ts';

const bundled = SOURCES.filter((s) => s.bundle);
const merger = new FilterMerger();
const sourceInfo: BundleSourceInfo[] = [];

for (const [bit, source] of bundled.entries()) {
  const result = source.local
    ? { status: 'updated' as const, text: await readFile(source.urls[0]!, 'utf8'), validators: { url: source.urls[0]! } }
    : await fetchList(source);
  if (result.status !== 'updated') {
    throw new Error(`${source.name}: download failed\n  ${result.status === 'failed' ? result.errors.join('\n  ') : ''}`);
  }
  const stats = parseList(result.text, source.format, (filter) => merger.add(filter, bit), {
    snippets: !!source.snippets,
  });
  if (stats.filters < source.minFilters) {
    throw new Error(`${source.name}: only ${stats.filters} filters, expected at least ${source.minFilters}`);
  }
  sourceInfo.push({ id: source.id, filters: stats.filters, ...result.validators });
  console.log(`${source.name.padEnd(26)} ${String(stats.filters).padStart(7)} filters, ${stats.unsupported} unsupported`);
}

const domains: MergedFilter[] = [];
const network: MergedFilter[] = [];
const cosmetic: MergedFilter[] = [];
const snippets: MergedFilter[] = [];
const byKind = { domain: domains, network, cosmetic, snippet: snippets };
for (const m of merger.filters.values()) byKind[m.filter.kind].push(m);

const entries: BundleIndex['entries'] = [];
const dropped: string[] = [];

// Domains: sorted so chunks stay stable between builds.
domains.sort((a, b) => (a.filter.key < b.filter.key ? -1 : 1));
const domainRules: DnrRule[] = chunk(domains, DOMAIN_CHUNK_SIZE).map((group, i) => {
  const id = i + 1;
  for (const m of group) entries.push([m.fp, m.mask, -id]);
  return { id, ...domainChunkRule(group.map((m) => (m.filter.kind === 'domain' ? m.filter.domain : ''))) };
});

// Network: ranked, so the guaranteed budget holds the rules most lists agree on.
network.sort(byRank);
const mainBudget = GUARANTEED_STATIC_RULES - domainRules.length;
const networkRules: DnrRule[] = [];
const extraRules: DnrRule[] = [];
for (const m of network) {
  if (m.filter.kind !== 'network') continue;
  const target = networkRules.length < mainBudget ? networkRules : extraRules.length < EXTRA_STATIC_RULES ? extraRules : null;
  if (!target) {
    dropped.push(m.fp);
    continue;
  }
  const id = networkRules.length + extraRules.length + 1;
  target.push({ id, ...networkRule(m.filter) });
  entries.push([m.fp, m.mask, id]);
}

const cosmeticEntries: CosmeticEntry[] = [];
for (const m of cosmetic.sort(byRank)) {
  if (m.filter.kind !== 'cosmetic') continue;
  cosmeticEntries.push(cosmeticEntry(m.filter));
  entries.push([m.fp, m.mask, 0]);
}

const snippetEntries: SnippetEntry[] = [];
for (const m of snippets.sort(byRank)) {
  if (m.filter.kind !== 'snippet') continue;
  snippetEntries.push(snippetEntry(m.filter));
  entries.push([m.fp, m.mask, 0]);
}

const index: BundleIndex = {
  version: 1,
  builtAt: new Date().toISOString(),
  sources: sourceInfo,
  networkLastId: networkRules.length,
  entries,
  dropped,
};

await mkdir(RULES_DIR, { recursive: true });
const write = (name: string, data: unknown) => writeFile(`${RULES_DIR}/${name}`, JSON.stringify(data));
await Promise.all([
  write('domains.json', domainRules),
  write('network.json', networkRules),
  write('network-extra.json', extraRules),
  write('cosmetic.json', cosmeticEntries),
  write('snippets.json', snippetEntries),
  // Page-world calls only: these are compiled into a script registered to run
  // at document_start, ahead of the page's own scripts.
  write(
    'snippets-main.json',
    snippetEntries
      .map((entry) => ({ ...entry, c: entry.c.filter(([name]) => !!name && main.has(name)) }))
      .filter((entry) => entry.c.length),
  ),
  write('index.json', index),
  write('meta.json', {
    builtAt: index.builtAt,
    sources: sourceInfo.map(({ id, filters }) => ({ id, filters })),
    rules: {
      domains: domains.length,
      network: networkRules.length,
      networkExtra: extraRules.length,
      cosmetic: cosmeticEntries.length,
      snippets: snippetEntries.length,
    },
  } satisfies BundleMeta),
]);

console.log(
  `\n${domains.length} domains in ${domainRules.length} rules, ` +
    `${networkRules.length} + ${extraRules.length} network rules (${dropped.length} dropped), ` +
    `${cosmeticEntries.length} element-hiding rules, ${snippetEntries.length} snippet rules`,
);
