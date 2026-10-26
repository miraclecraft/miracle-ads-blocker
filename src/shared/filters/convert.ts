import type { CosmeticEntry, CosmeticFilter, DnrRuleDraft, NetworkFilter } from './types.ts';

export const PRIORITY = {
  block: 1,
  allow: 2,
  important: 3,
  pausedSite: 1_000,
  disabled: 10_000,
} as const;

export const DOMAIN_CHUNK_SIZE = 1_000;

export function networkRule(f: NetworkFilter): DnrRuleDraft {
  const rule: DnrRuleDraft = {
    priority: f.exception ? PRIORITY.allow : f.important ? PRIORITY.important : PRIORITY.block,
    action: { type: f.exception ? (f.document ? 'allowAllRequests' : 'allow') : 'block' },
    condition: {},
  };
  const c = rule.condition;
  if (f.pattern) c.urlFilter = f.pattern;
  if (f.matchCase) c.isUrlFilterCaseSensitive = true;
  if (f.thirdParty !== undefined) c.domainType = f.thirdParty ? 'thirdParty' : 'firstParty';
  if (f.domains?.length) c.initiatorDomains = f.domains;
  if (f.excludedDomains?.length) c.excludedInitiatorDomains = f.excludedDomains;
  if (f.document) c.resourceTypes = ['main_frame', 'sub_frame'];
  else if (f.types) c.resourceTypes = f.types;
  else if (f.excludedTypes) c.excludedResourceTypes = f.excludedTypes;
  return rule;
}

export function domainChunkRule(domains: string[]): DnrRuleDraft {
  return { priority: PRIORITY.block, action: { type: 'block' }, condition: { requestDomains: domains } };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function cosmeticEntry(f: CosmeticFilter): CosmeticEntry {
  const entry: CosmeticEntry = { s: f.selector };
  if (f.domains.length) entry.d = f.domains;
  if (f.excludedDomains.length) entry.x = f.excludedDomains;
  if (f.exception) entry.e = 1;
  return entry;
}
