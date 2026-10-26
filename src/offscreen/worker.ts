// Runs in a dedicated worker inside the offscreen document, so downloading
// and parsing a few hundred thousand filters never blocks the background
// service worker (which has to answer element-hiding requests from pages).

import { RULES_DIR, type BundleIndex } from '../shared/bundle.ts';
import { fetchList, listLifetimeMs, type ListValidators } from '../shared/fetch-list.ts';
import { FilterMerger } from '../shared/filters/merge.ts';
import { parseList } from '../shared/filters/parse.ts';
import type { DnrRule, Filter } from '../shared/filters/types.ts';
import type { RefreshRequest, RefreshResult, SourceStatus } from '../shared/messages.ts';
import { computePlan } from '../shared/plan.ts';
import { LIST_CACHE } from '../shared/storage-keys.ts';
import { SOURCES, type FilterSource } from '../shared/sources.ts';

/** A fresh copy must keep at least this share of the bundled filters. */
const MIN_SHARE_OF_BUNDLED = 0.5;

interface CachedList {
  text: string;
  validators: ListValidators;
  updatedAt: number;
  expiresAt: number;
}

interface Candidate {
  source: FilterSource;
  downloaded?: CachedList;
  cached?: CachedList;
  error?: string;
}

const scope = self as unknown as {
  onmessage: (event: MessageEvent<RefreshRequest>) => void;
  postMessage: (message: RefreshResult) => void;
};

scope.onmessage = (event) => {
  refresh(event.data).then(scope.postMessage, (error) =>
    scope.postMessage({ status: 'error', error: error instanceof Error ? error.message : String(error) }),
  );
};

async function refresh(request: RefreshRequest): Promise<RefreshResult> {
  const cache = await caches.open(LIST_CACHE);
  const index = await getJson<BundleIndex>('index.json');
  const candidates = await Promise.all(SOURCES.map((source) => check(cache, source, request.checkAll)));

  // Nothing new downloaded and the same inputs as last time: skip the merge.
  const quickSignature = signature(index, candidates.map((c) => c.cached));
  if (!candidates.some((c) => c.downloaded) && quickSignature === request.lastSignature) {
    return { status: 'unchanged', signature: quickSignature, sources: statuses(candidates, new Set()) };
  }

  const merger = new FilterMerger();
  const used: (CachedList | undefined)[] = [];
  const failed = new Set<string>();

  for (const [bit, candidate] of candidates.entries()) {
    const bundledCount = index.sources.find((s) => s.id === candidate.source.id)?.filters ?? 0;
    const minimum = Math.max(candidate.source.minFilters, Math.floor(bundledCount * MIN_SHARE_OF_BUNDLED));
    let chosen: CachedList | undefined;
    let filters: Filter[] = [];

    if (candidate.downloaded) {
      filters = parseAll(candidate.downloaded.text, candidate.source);
      if (filters.length >= minimum) {
        chosen = candidate.downloaded;
        await store(cache, candidate.source, chosen);
      } else {
        candidate.error = `rejected: ${filters.length} filters, expected at least ${minimum}`;
        failed.add(candidate.source.id);
      }
    }
    if (!chosen && candidate.cached) {
      chosen = candidate.cached;
      filters = parseAll(chosen.text, candidate.source);
    }
    used.push(chosen);
    if (chosen) for (const filter of filters) merger.add(filter, bit);
  }

  const freshSources = new Set(candidates.filter((_, i) => used[i]).map((c) => c.source.id));
  const plan = computePlan({
    index,
    domainRules: await getJson<DnrRule[]>('domains.json'),
    fresh: merger.filters,
    freshSources,
    maxDynamicRules: request.maxDynamicRules,
    maxDisabledStaticRules: request.maxDisabledStaticRules,
  });

  return {
    status: 'planned',
    signature: signature(index, used),
    sources: statuses(candidates, failed, used),
    plan,
  };
}

async function check(cache: Cache, source: FilterSource, checkAll: boolean): Promise<Candidate> {
  const cached = await load(cache, source);
  const candidate: Candidate = cached ? { source, cached } : { source };
  if (!checkAll && cached && Date.now() < cached.expiresAt) return candidate;

  const result = await fetchList(source, cached?.validators);
  const now = Date.now();
  if (result.status === 'updated') {
    candidate.downloaded = {
      text: result.text,
      validators: result.validators,
      updatedAt: now,
      expiresAt: now + listLifetimeMs(result.text),
    };
  } else if (result.status === 'unchanged' && cached) {
    cached.expiresAt = now + listLifetimeMs(cached.text);
    await store(cache, source, cached);
  } else if (result.status === 'failed') {
    candidate.error = result.errors.join('; ');
  }
  return candidate;
}

function parseAll(text: string, source: FilterSource): Filter[] {
  const filters: Filter[] = [];
  parseList(text, source.format, (filter) => filters.push(filter));
  return filters;
}

function signature(index: BundleIndex, lists: (CachedList | undefined)[]): string {
  return [index.builtAt, ...SOURCES.map((s, i) => `${s.id}:${lists[i]?.updatedAt ?? 'bundled'}`)].join('|');
}

function statuses(candidates: Candidate[], failed: Set<string>, used?: (CachedList | undefined)[]): SourceStatus[] {
  return candidates.map((c, i) => {
    const list = used ? used[i] : c.cached;
    const status: SourceStatus = {
      id: c.source.id,
      name: c.source.name,
      state: failed.has(c.source.id) || (c.error && !list) ? 'failed' : list ? 'fresh' : 'bundled',
    };
    if (list) status.updatedAt = list.updatedAt;
    if (c.error) status.error = c.error;
    return status;
  });
}

// ---------------------------------------------------------------------------
// Cache Storage holds the latest good copy of each list, with its metadata.

function cacheKey(source: FilterSource): string {
  return `https://lists.miracle-ads-blocker.invalid/${source.id}`;
}

async function load(cache: Cache, source: FilterSource): Promise<CachedList | undefined> {
  const response = await cache.match(cacheKey(source));
  if (!response) return undefined;
  const meta = JSON.parse(response.headers.get('x-meta') ?? '{}') as Omit<CachedList, 'text'>;
  return { ...meta, text: await response.text() };
}

async function store(cache: Cache, source: FilterSource, list: CachedList): Promise<void> {
  const { text, ...meta } = list;
  await cache.put(cacheKey(source), new Response(text, { headers: { 'x-meta': JSON.stringify(meta) } }));
}

async function getJson<T>(name: string): Promise<T> {
  const response = await fetch(`/${RULES_DIR}/${name}`);
  if (!response.ok) throw new Error(`missing ${RULES_DIR}/${name}`);
  return response.json() as Promise<T>;
}
