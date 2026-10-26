import assert from 'node:assert/strict';
import { test } from 'node:test';
import { networkRule } from '../src/shared/filters/convert.ts';
import { parseAbpLine, parseList } from '../src/shared/filters/parse.ts';
import type { Filter } from '../src/shared/filters/types.ts';

function parse(text: string, format: 'abp' | 'hosts' = 'abp'): Filter[] {
  const filters: Filter[] = [];
  parseList(text, format, (f) => filters.push(f));
  return filters;
}

test('a hosts entry and an ABP domain filter share a key, so they count as agreement', () => {
  const [fromHosts] = parse('0.0.0.0 Ads.Example.com', 'hosts');
  const [fromAbp] = parse('||ads.example.com^');
  assert.equal(fromHosts?.kind, 'domain');
  assert.equal(fromHosts?.key, fromAbp?.key);
});

test('hosts files skip loopback names', () => {
  assert.deepEqual(parse('127.0.0.1 localhost\n0.0.0.0 0.0.0.0\n::1 ip6-localhost', 'hosts'), []);
});

test('options are normalized so reordered filters dedupe', () => {
  const a = parseAbpLine('||x.com/ad.js$script,third-party,domain=b.com|a.com');
  const b = parseAbpLine('||X.com/ad.js$3p,script,domain=a.com|b.com');
  assert.ok(a && typeof a === 'object' && b && typeof b === 'object');
  assert.equal(a.key, b.key);
});

test('network filters convert to DNR conditions', () => {
  const f = parseAbpLine('@@||cdn.example.com/ads/$image,domain=site.com|~sub.site.com');
  assert.ok(f && typeof f === 'object' && f.kind === 'network');
  assert.deepEqual(networkRule(f), {
    priority: 2,
    action: { type: 'allow' },
    condition: {
      urlFilter: '||cdn.example.com/ads/',
      initiatorDomains: ['site.com'],
      excludedInitiatorDomains: ['sub.site.com'],
      resourceTypes: ['image'],
    },
  });
});

test('$document exceptions allow the whole page', () => {
  const f = parseAbpLine('@@||example.com^$document');
  assert.ok(f && typeof f === 'object' && f.kind === 'network');
  const rule = networkRule(f);
  assert.equal(rule.action.type, 'allowAllRequests');
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame', 'sub_frame']);
});

test('filters we cannot enforce faithfully are dropped, not broadened', () => {
  for (const line of [
    '||example.com^$redirect=noopjs',
    '||example.com^$removeparam=utm_source',
    '/banner\\d+/',
    'example.com##+js(set-constant, x, 1)',
    'example.com#?#div:has-text(Sponsored)',
    'example.com#$#body { overflow: auto }',
    'example.com##div{} body{display:none}',
    'google.*##.ad',
    'example.com$$script[data-ad]',
  ]) {
    assert.equal(parseAbpLine(line), 'unsupported', line);
  }
});

test('filters that would block or allow almost everything are rejected', () => {
  for (const line of ['*', '@@*', '@@||', '@@|http', '^ad^', '@@*$document']) {
    assert.equal(parseAbpLine(line), 'unsupported', line);
  }
});

test('cosmetic filters keep their domain scope', () => {
  const [f] = parse('example.com,~shop.example.com##.ad-banner');
  assert.deepEqual(f, {
    kind: 'cosmetic',
    key: 'example.com,~shop.example.com##.ad-banner',
    exception: false,
    selector: '.ad-banner',
    domains: ['example.com'],
    excludedDomains: ['shop.example.com'],
  });
});

test('uBO !#if blocks honour Chromium MV3 tokens', () => {
  const list = [
    '!#if env_firefox',
    '||firefox-only.com^',
    '!#else',
    '||not-firefox.com^',
    '!#endif',
    '!#if !cap_html_filtering',
    '||no-html-filtering.com^',
    '!#endif',
  ].join('\n');
  assert.deepEqual(
    parse(list).map((f) => f.key),
    ['||not-firefox.com^', '||no-html-filtering.com^'],
  );
});
