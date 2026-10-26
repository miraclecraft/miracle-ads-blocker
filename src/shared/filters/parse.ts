// Parses Adblock Plus syntax (and the common AdGuard/uBO extensions) plus hosts
// files into normalized filters. Anything we can't enforce faithfully with
// declarativeNetRequest or plain CSS is counted as unsupported and dropped:
// skipping a filter is always safer than applying a broader one.

import type { ListFormat } from '../sources.ts';
import type { CosmeticFilter, Filter, NetworkFilter, ResourceType } from './types.ts';

export interface ParseStats {
  lines: number;
  filters: number;
  unsupported: number;
}

const DOMAIN_RE = /^(?:[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?\.)+[a-z0-9-]{2,}$/;
// Includes `*` so entity filters (`google.*##.ad`) are recognized as cosmetic
// and then rejected, instead of being misread as a network pattern.
const DOMAIN_LIST_RE = /^[a-z0-9.,~_*-]*$/i;
const SCHEME_PREFIX_RE = /^\|*(?:https?|wss?)(?::\/*)?/;
const PURE_DOMAIN_RE = /^\|\|([a-z0-9._-]+)\^$/;
const PRINTABLE_ASCII_RE = /^[\x20-\x7e]*$/;

const TYPE_OPTIONS: Record<string, ResourceType> = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  css: 'stylesheet',
  object: 'object',
  xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest',
  subdocument: 'sub_frame',
  frame: 'sub_frame',
  ping: 'ping',
  media: 'media',
  font: 'font',
  websocket: 'websocket',
  other: 'other',
};

// Preprocessor tokens (uBO `!#if`) that are true for a Chromium MV3 extension.
const TRUE_ENV_TOKENS = new Set(['env_chromium', 'env_edge', 'env_mv3']);

// Extended CSS we can't express as a stylesheet rule.
const PROCEDURAL_RE =
  /:(?:-abp-|has-text|contains|matches-css|matches-attr|matches-path|matches-prop|min-text-length|watch-attr|xpath|upward|nth-ancestor|remove|style|others|if|if-not|shadow)\b/;

const HOSTS_SKIP = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
  'ip6-localnet',
  'ip6-mcastprefix',
  'ip6-allnodes',
  'ip6-allrouters',
  'ip6-allhosts',
  '0.0.0.0',
]);

const UNSUPPORTED = 'unsupported';
type LineResult = Filter | null | typeof UNSUPPORTED;

export function parseList(text: string, format: ListFormat, onFilter: (filter: Filter) => void): ParseStats {
  const stats: ParseStats = { lines: 0, filters: 0, unsupported: 0 };
  // Stack of "is this !#if branch active" flags.
  const conditions: boolean[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    stats.lines++;
    const line = rawLine.trim();
    if (!line) continue;

    if (format === 'abp' && line.startsWith('!#')) {
      if (line.startsWith('!#if ')) conditions.push(evaluateCondition(line.slice(5)));
      else if (line.startsWith('!#else')) conditions.push(!(conditions.pop() ?? true));
      else if (line.startsWith('!#endif')) conditions.pop();
      continue;
    }
    if (conditions.includes(false)) continue;

    const result = format === 'hosts' ? parseHostsLine(line) : parseAbpLine(line);
    if (result === UNSUPPORTED) {
      stats.unsupported++;
    } else if (Array.isArray(result)) {
      for (const filter of result) {
        stats.filters++;
        onFilter(filter);
      }
    } else if (result) {
      stats.filters++;
      onFilter(result);
    }
  }
  return stats;
}

function evaluateCondition(expression: string): boolean {
  // Supports `a`, `!a`, `a && b` and `a || b`; unknown tokens are false.
  return expression.split('||').some((alternative) =>
    alternative.split('&&').every((term) => {
      const token = term.trim().replace(/[()]/g, '');
      return token.startsWith('!') ? !TRUE_ENV_TOKENS.has(token.slice(1)) : TRUE_ENV_TOKENS.has(token);
    }),
  );
}

function parseHostsLine(line: string): Filter[] | null {
  const content = line.split('#', 1)[0]!.trim();
  if (!content) return null;
  const tokens = content.split(/\s+/);
  // "0.0.0.0 a.com b.com" or a bare "a.com" per line.
  const names = tokens.length > 1 ? tokens.slice(1) : tokens;
  const filters: Filter[] = [];
  for (const name of names) {
    const domain = name.toLowerCase();
    if (HOSTS_SKIP.has(domain) || !DOMAIN_RE.test(domain)) continue;
    filters.push(domainFilter(domain));
  }
  return filters;
}

export function parseAbpLine(line: string): LineResult {
  if (line.startsWith('!') || line.startsWith('[')) return null;
  if (!PRINTABLE_ASCII_RE.test(line)) return UNSUPPORTED;

  const cosmetic = parseCosmetic(line);
  if (cosmetic !== undefined) return cosmetic;
  return parseNetwork(line);
}

function domainFilter(domain: string): Filter {
  return { kind: 'domain', key: `||${domain}^`, domain };
}

// ---------------------------------------------------------------------------
// Element hiding

/** Returns undefined when the line is not a cosmetic filter at all. */
function parseCosmetic(line: string): LineResult | undefined {
  const hash = line.indexOf('#');
  if (hash === -1) {
    // AdGuard HTML filtering: `example.com$$script[...]`.
    const html = line.search(/\$@?\$/);
    if (html !== -1 && DOMAIN_LIST_RE.test(line.slice(0, html))) return UNSUPPORTED;
    return undefined;
  }

  const prefix = line.slice(0, hash);
  if (!DOMAIN_LIST_RE.test(prefix)) return undefined;

  const rest = line.slice(hash);
  let exception: boolean;
  let selector: string;
  if (rest.startsWith('##')) {
    exception = false;
    selector = rest.slice(2);
  } else if (rest.startsWith('#@#')) {
    exception = true;
    selector = rest.slice(3);
  } else if (/^#@?[?$%]/.test(rest)) {
    // Extended CSS (#?#), CSS injection (#$#) and scriptlets (#%#).
    return UNSUPPORTED;
  } else {
    return undefined;
  }

  selector = selector.trim();
  if (
    !selector ||
    selector.startsWith('+js(') ||
    selector.startsWith('^') ||
    // A brace could break out of the hiding rule and restyle the page.
    /[{}]/.test(selector) ||
    selector.includes('/*') ||
    PROCEDURAL_RE.test(selector)
  ) {
    return UNSUPPORTED;
  }

  const parsed = parseDomainList(prefix, ',');
  if (!parsed) return UNSUPPORTED;
  // A generic exception (`#@#.ad` with no domain) would disable a rule everywhere.
  if (exception && parsed.domains.length === 0) return UNSUPPORTED;

  const filter: CosmeticFilter = {
    kind: 'cosmetic',
    key: cosmeticKey(selector, parsed.domains, parsed.excluded, exception),
    exception,
    selector,
    domains: parsed.domains,
    excludedDomains: parsed.excluded,
  };
  return filter;
}

export function cosmeticKey(selector: string, domains: string[], excluded: string[], exception: boolean): string {
  const scope = [...domains, ...excluded.map((d) => `~${d}`)].sort().join(',');
  return `${scope}${exception ? '#@#' : '##'}${selector}`;
}

function parseDomainList(text: string, separator: string): { domains: string[]; excluded: string[] } | null {
  const domains: string[] = [];
  const excluded: string[] = [];
  if (!text) return { domains, excluded };
  for (const part of text.split(separator)) {
    const negated = part.startsWith('~');
    const domain = (negated ? part.slice(1) : part).trim().toLowerCase();
    // Entity domains like `google.*` and IP addresses aren't supported.
    if (!DOMAIN_RE.test(domain)) return null;
    (negated ? excluded : domains).push(domain);
  }
  return { domains: [...new Set(domains)].sort(), excluded: [...new Set(excluded)].sort() };
}

// ---------------------------------------------------------------------------
// Network

function parseNetwork(line: string): LineResult {
  let text = line;
  const exception = text.startsWith('@@');
  if (exception) text = text.slice(2);

  let pattern = text;
  let optionText = '';
  const dollar = text.lastIndexOf('$');
  if (dollar !== -1) {
    pattern = text.slice(0, dollar);
    optionText = text.slice(dollar + 1);
  }

  // Regex filters need RE2 validation and count against a small quota. Skipped for now.
  if (pattern.length > 1 && pattern.startsWith('/') && pattern.endsWith('/')) return UNSUPPORTED;
  if (pattern.startsWith('||*')) return UNSUPPORTED;

  const filter: NetworkFilter = {
    kind: 'network',
    key: '',
    exception,
    pattern,
    matchCase: false,
    important: false,
    document: false,
  };
  const types = new Set<ResourceType>();
  const excludedTypes = new Set<ResourceType>();

  if (optionText) {
    for (const rawOption of optionText.split(',')) {
      const option = rawOption.trim().toLowerCase();
      const negated = option.startsWith('~');
      const name = negated ? option.slice(1) : option;

      if (name in TYPE_OPTIONS) {
        (negated ? excludedTypes : types).add(TYPE_OPTIONS[name]!);
      } else if (name === 'third-party' || name === '3p') {
        filter.thirdParty = !negated;
      } else if (name === 'first-party' || name === '1p') {
        filter.thirdParty = negated;
      } else if (name === 'match-case' && !negated) {
        filter.matchCase = true;
      } else if (name === 'important' && !negated) {
        filter.important = true;
      } else if ((name === 'document' || name === 'doc') && !negated && exception) {
        filter.document = true;
      } else if (name.startsWith('domain=') || name.startsWith('from=')) {
        const parsed = parseDomainList(name.slice(name.indexOf('=') + 1), '|');
        if (!parsed) return UNSUPPORTED;
        filter.domains = parsed.domains;
        filter.excludedDomains = parsed.excluded;
      } else {
        // redirect, removeparam, csp, popup, elemhide, badfilter, ...
        return UNSUPPORTED;
      }
    }
  }

  if (types.size) filter.types = [...types].filter((t) => !excludedTypes.has(t)).sort();
  else if (excludedTypes.size) filter.excludedTypes = [...excludedTypes].sort();
  if (filter.types?.length === 0) return UNSUPPORTED;
  if (filter.document && (filter.types || filter.excludedTypes)) return UNSUPPORTED;

  if (!filter.matchCase) filter.pattern = filter.pattern.toLowerCase();
  if (filter.pattern === '*') filter.pattern = '';

  // Guard against filters that would block or allow far too much, whether
  // they come from a mistake upstream or a tampered list.
  // A bare scheme (`|http`, `https://`) matches every URL, so it doesn't count.
  const meaningful = filter.pattern.replace(SCHEME_PREFIX_RE, '').replace(/[*^|]/g, '').length;
  const scoped = (filter.domains?.length ?? 0) > 0;
  if (!scoped && meaningful < (exception ? 4 : 3)) return UNSUPPORTED;

  if (!exception && !optionText) {
    const pure = PURE_DOMAIN_RE.exec(filter.pattern);
    if (pure && DOMAIN_RE.test(pure[1]!)) return domainFilter(pure[1]!);
  }

  filter.key = networkKey(filter);
  return filter;
}

function networkKey(f: NetworkFilter): string {
  const options: string[] = [];
  if (f.thirdParty !== undefined) options.push(f.thirdParty ? '3p' : '1p');
  if (f.matchCase) options.push('match-case');
  if (f.important) options.push('important');
  if (f.document) options.push('document');
  for (const t of f.types ?? []) options.push(t);
  for (const t of f.excludedTypes ?? []) options.push(`~${t}`);
  if (f.domains?.length || f.excludedDomains?.length) {
    const domains = [...(f.domains ?? []), ...(f.excludedDomains ?? []).map((d) => `~${d}`)];
    options.push(`domain=${domains.sort().join('|')}`);
  }
  return `${f.exception ? '@@' : ''}${f.pattern}${options.length ? `$${options.join(',')}` : ''}`;
}
