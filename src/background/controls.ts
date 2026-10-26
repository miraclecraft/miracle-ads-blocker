// The user's switches: blocking on or off everywhere, and sites they paused.
// Each is a single dynamic rule that outranks every filter rule.

import { PRIORITY } from '../shared/filters/convert.ts';
import type { DnrRule } from '../shared/filters/types.ts';
import { getLocal } from '../shared/storage-keys.ts';

/** Dynamic rule IDs below this are reserved for user controls. */
export const FILTER_RULE_ID_BASE = 1_000;

const PAUSED_RULE_ID = 1;
const DISABLED_RULE_ID = 2;

interface Controls {
  enabled: boolean;
  pausedSites: string[];
}

export async function getControls(): Promise<Controls> {
  const { enabled = true, pausedSites = [] } = await getLocal(['enabled', 'pausedSites']);
  return { enabled, pausedSites };
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ enabled });
  await syncControlRules();
}

export async function setPaused(host: string, paused: boolean): Promise<void> {
  const { pausedSites } = await getControls();
  const next = pausedSites.filter((site) => site !== host);
  if (paused) next.push(host);
  await chrome.storage.local.set({ pausedSites: next });
  await syncControlRules();
}

export function isPaused(host: string, pausedSites: string[]): boolean {
  return pausedSites.some((site) => host === site || host.endsWith(`.${site}`));
}

export async function syncControlRules(): Promise<void> {
  const { enabled, pausedSites } = await getControls();
  const addRules: DnrRule[] = [];
  if (pausedSites.length) {
    addRules.push({
      id: PAUSED_RULE_ID,
      priority: PRIORITY.pausedSite,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: pausedSites, resourceTypes: ['main_frame', 'sub_frame'] },
    });
  }
  if (!enabled) {
    addRules.push({ id: DISABLED_RULE_ID, priority: PRIORITY.disabled, action: { type: 'allow' }, condition: {} });
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [PAUSED_RULE_ID, DISABLED_RULE_ID],
    addRules: addRules as chrome.declarativeNetRequest.Rule[],
  });
}
