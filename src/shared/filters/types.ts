export type ResourceType =
  | 'main_frame'
  | 'sub_frame'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'object'
  | 'xmlhttprequest'
  | 'ping'
  | 'media'
  | 'websocket'
  | 'other';

/** `||example.com^` with no options. Collapsed into a few big DNR rules. */
export interface DomainFilter {
  kind: 'domain';
  key: string;
  domain: string;
}

export interface NetworkFilter {
  kind: 'network';
  key: string;
  exception: boolean;
  /** ABP pattern; DNR's urlFilter uses the same syntax. Empty means "any URL". */
  pattern: string;
  matchCase: boolean;
  important: boolean;
  /** `@@...$document`: allow everything on matching pages. */
  document: boolean;
  /** true: third-party only, false: first-party only, undefined: both. */
  thirdParty?: boolean;
  types?: ResourceType[];
  excludedTypes?: ResourceType[];
  domains?: string[];
  excludedDomains?: string[];
}

export interface CosmeticFilter {
  kind: 'cosmetic';
  key: string;
  exception: boolean;
  selector: string;
  domains: string[];
  excludedDomains: string[];
}

/** `example.com#$#snippet arg; other-snippet arg`: Adblock Plus snippets. */
export interface SnippetFilter {
  kind: 'snippet';
  key: string;
  /** `#@$#`: switches off snippet rules with exactly these calls on these sites. */
  exception: boolean;
  domains: string[];
  excludedDomains: string[];
  /** Each call is `[name, ...args]`, in the order they appear. */
  calls: string[][];
}

export type Filter = DomainFilter | NetworkFilter | CosmeticFilter | SnippetFilter;

/** Element-hiding entry as stored in rules/cosmetic.json. */
export interface CosmeticEntry {
  s: string;
  d?: string[];
  x?: string[];
  e?: 1;
}

/** Snippet entry as stored in rules/snippets.json. */
export interface SnippetEntry {
  d: string[];
  x?: string[];
  c: string[][];
}

export interface DnrCondition {
  urlFilter?: string;
  isUrlFilterCaseSensitive?: boolean;
  requestDomains?: string[];
  initiatorDomains?: string[];
  excludedInitiatorDomains?: string[];
  resourceTypes?: ResourceType[];
  excludedResourceTypes?: ResourceType[];
  domainType?: 'firstParty' | 'thirdParty';
}

export interface DnrRule {
  id: number;
  priority: number;
  action: { type: 'block' | 'allow' | 'allowAllRequests' };
  condition: DnrCondition;
}

export type DnrRuleDraft = Omit<DnrRule, 'id'>;
