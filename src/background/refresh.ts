// Keeps the bundled rules up to date with the latest lists. The offscreen
// worker does the downloading and merging; this file only applies the result.

import { RULES_DIR } from '../shared/bundle.ts';
import type { LastRefresh, Message, RefreshResult } from '../shared/messages.ts';
import type { Plan } from '../shared/plan.ts';
import { getLocal, getSession, LIST_CACHE } from '../shared/storage-keys.ts';
import { FILTER_RULE_ID_BASE } from './controls.ts';

const OFFSCREEN_URL = 'offscreen/offscreen.html';
/** A refresh that hasn't reported back after this long is assumed dead. */
const REFRESH_TIMEOUT_MS = 5 * 60_000;
/** Chromium's limit on disabled static rules per ruleset. */
const MAX_DISABLED_STATIC_RULES = 5_000;

export async function startRefresh(checkAll: boolean): Promise<void> {
  const { refreshStartedAt } = await getSession(['refreshStartedAt']);
  if (refreshStartedAt && Date.now() - refreshStartedAt < REFRESH_TIMEOUT_MS) return;
  await chrome.storage.session.set({ refreshStartedAt: Date.now() });

  try {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: 'Download and merge filter lists in a background worker',
      });
    }
    const { lastSignature } = await getLocal(['lastSignature']);
    const dnr = chrome.declarativeNetRequest;
    await chrome.runtime.sendMessage({
      type: 'refresh:start',
      target: 'offscreen',
      request: {
        checkAll,
        ...(lastSignature ? { lastSignature } : {}),
        maxDynamicRules: (dnr.MAX_NUMBER_OF_DYNAMIC_RULES ?? 5_000) - FILTER_RULE_ID_BASE,
        maxDisabledStaticRules: MAX_DISABLED_STATIC_RULES,
      },
    } satisfies Message);
  } catch (error) {
    await chrome.storage.session.remove('refreshStartedAt');
    throw error;
  }
}

export async function finishRefresh(result: RefreshResult): Promise<void> {
  try {
    const lastRefresh: LastRefresh = { at: Date.now(), ok: true, sources: [], added: 0, removed: 0 };
    if (result.status === 'error') {
      lastRefresh.ok = false;
      lastRefresh.error = result.error;
    } else {
      lastRefresh.sources = result.sources;
      if (result.status === 'planned') {
        await applyPlan(result.plan);
        lastRefresh.added = result.plan.stats.added;
        lastRefresh.removed = result.plan.stats.removed;
      } else {
        const { lastRefresh: previous } = await getLocal(['lastRefresh']);
        lastRefresh.added = previous?.added ?? 0;
        lastRefresh.removed = previous?.removed ?? 0;
      }
      await chrome.storage.local.set({ lastSignature: result.signature });
    }
    await chrome.storage.local.set({ lastRefresh });
  } finally {
    await chrome.storage.session.remove('refreshStartedAt');
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

async function applyPlan(plan: Plan): Promise<void> {
  // One atomic swap of the dynamic rules: there's never a moment with the old
  // rules gone and the new ones not yet in place. New rules go in before any
  // bundled rule is disabled, for the same reason.
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.filter((r) => r.id >= FILTER_RULE_ID_BASE).map((r) => r.id),
    addRules: plan.dynamicRules.map((rule, i) => ({ ...rule, id: FILTER_RULE_ID_BASE + i })) as chrome.declarativeNetRequest.Rule[],
  });

  for (const [rulesetId, ids] of Object.entries(plan.disabledStaticRules)) {
    const current = await chrome.declarativeNetRequest.getDisabledRuleIds({ rulesetId });
    const wanted = new Set(ids);
    const disableRuleIds = ids.filter((id) => !current.includes(id));
    const enableRuleIds = current.filter((id) => !wanted.has(id));
    if (disableRuleIds.length || enableRuleIds.length) {
      await chrome.declarativeNetRequest.updateStaticRules({ rulesetId, disableRuleIds, enableRuleIds });
    }
  }

  // The element-hiding and snippet engines reload when this changes.
  await chrome.storage.local.set({
    pageDelta: { cosmetic: plan.cosmeticAdded, snippets: plan.snippetsAdded, removed: plan.removedEntries },
  });
}

/**
 * After installing a new version, everything learned at runtime describes the
 * old bundle. Drop it all, including cached lists older than the new bundle,
 * so the next refresh starts from a clean comparison.
 */
export async function resetRuntimeLayer(): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.filter((r) => r.id >= FILTER_RULE_ID_BASE).map((r) => r.id),
  });
  const manifest = chrome.runtime.getManifest();
  for (const { id } of manifest.declarative_net_request?.rule_resources ?? []) {
    const disabled = await chrome.declarativeNetRequest.getDisabledRuleIds({ rulesetId: id });
    if (disabled.length) await chrome.declarativeNetRequest.updateStaticRules({ rulesetId: id, enableRuleIds: disabled });
  }
  await caches.delete(LIST_CACHE);
  await chrome.storage.local.remove(['pageDelta', 'lastSignature', 'lastRefresh']);
}

/** Turns on the overflow ruleset when the browser's shared rule pool has room. */
export async function enableExtraRulesetIfRoom(): Promise<void> {
  const id = 'network-extra';
  const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
  if (enabled.includes(id)) return;
  const rules = (await fetch(chrome.runtime.getURL(`${RULES_DIR}/${id}.json`)).then((r) => r.json())) as unknown[];
  const available = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
  if (rules.length && available >= rules.length) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [id] });
  }
}
