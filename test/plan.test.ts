import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BundleIndex } from '../src/shared/bundle.ts';
import { FilterMerger } from '../src/shared/filters/merge.ts';
import { parseList } from '../src/shared/filters/parse.ts';
import type { DnrRule } from '../src/shared/filters/types.ts';
import { fingerprint } from '../src/shared/hash.ts';
import { computePlan, type PlanInput } from '../src/shared/plan.ts';

// Bundle: source A had a.com, b.com (one chunk) and /ads.js; source B had c.com.
const fp = (key: string) => fingerprint(key);
const index: BundleIndex = {
  version: 1,
  builtAt: '2026-10-01T00:00:00Z',
  sources: [
    { id: 'A', filters: 3, url: '' },
    { id: 'B', filters: 1, url: '' },
  ],
  networkLastId: 1,
  entries: [
    [fp('||a.com^'), 0b01, -1],
    [fp('||b.com^'), 0b01, -1],
    [fp('||c.com^'), 0b10, -2],
    [fp('/ads.js'), 0b01, 1],
    [fp('##.banner'), 0b01, 0],
  ],
  dropped: [],
};
const domainRules: DnrRule[] = [
  { id: 1, priority: 1, action: { type: 'block' }, condition: { requestDomains: ['a.com', 'b.com'] } },
  { id: 2, priority: 1, action: { type: 'block' }, condition: { requestDomains: ['c.com'] } },
];

function plan(freshLists: Record<string, string>): ReturnType<typeof computePlan> {
  const merger = new FilterMerger();
  Object.values(freshLists).forEach((text, bit) => parseList(text, 'abp', (f) => merger.add(f, bit)));
  const input: PlanInput = {
    index,
    domainRules,
    fresh: merger.filters,
    freshSources: new Set(Object.keys(freshLists)),
    maxDynamicRules: 100,
    maxDisabledStaticRules: 100,
  };
  return computePlan(input);
}

test('no changes upstream means no runtime rules', () => {
  const result = plan({ A: '||a.com^\n||b.com^\n/ads.js\n##.banner' });
  assert.deepEqual(result.dynamicRules, []);
  assert.deepEqual(result.disabledStaticRules, { domains: [], network: [], 'network-extra': [] });
  assert.deepEqual(result.cosmeticAdded, []);
  assert.deepEqual(result.cosmeticRemoved, []);
});

test('new filters become dynamic rules; bundled ones are skipped', () => {
  const result = plan({ A: '||a.com^\n||b.com^\n/ads.js\n##.banner\n||new.com^\n/track.gif\n##.sponsor' });
  assert.deepEqual(result.dynamicRules, [
    { priority: 1, action: { type: 'block' }, condition: { requestDomains: ['new.com'] } },
    { priority: 1, action: { type: 'block' }, condition: { urlFilter: '/track.gif' } },
  ]);
  assert.deepEqual(result.cosmeticAdded, [{ s: '.sponsor' }]);
});

test('rules removed upstream are disabled, and shrunk chunks are re-added without them', () => {
  const result = plan({ A: '||a.com^' });
  assert.deepEqual(result.disabledStaticRules, { domains: [1], network: [1], 'network-extra': [] });
  assert.deepEqual(result.dynamicRules, [
    { priority: 1, action: { type: 'block' }, condition: { requestDomains: ['a.com'] } },
  ]);
  assert.deepEqual(result.cosmeticRemoved, [fp('##.banner')]);
});

test('a source we have no fresh copy of still vouches for its bundled rules', () => {
  // Only A was refreshed, and it doesn't mention c.com; B (stale) still does.
  const result = plan({ A: '||a.com^\n||b.com^\n/ads.js\n##.banner' });
  assert.equal(result.disabledStaticRules.domains?.includes(2), false);
});

test('the dynamic budget goes to the rules most lists agree on', () => {
  const merger = new FilterMerger();
  parseList('/only-one.js\n/both.js', 'abp', (f) => merger.add(f, 0));
  parseList('/both.js', 'abp', (f) => merger.add(f, 1));
  const result = computePlan({
    index,
    domainRules,
    fresh: merger.filters,
    freshSources: new Set(),
    maxDynamicRules: 1,
    maxDisabledStaticRules: 100,
  });
  assert.deepEqual(
    result.dynamicRules.map((r) => r.condition.urlFilter),
    ['/both.js'],
  );
  assert.equal(result.stats.skipped, 1);
});
