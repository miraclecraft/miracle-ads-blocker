import type { Message, PopupState } from '../shared/messages.ts';
import { getLocal } from '../shared/storage-keys.ts';
import { getControls, isPaused, setEnabled, setPaused, syncControlRules } from './controls.ts';
import { getCosmeticEngine, injectHidingCss } from './cosmetic.ts';
import { enableExtraRulesetIfRoom, finishRefresh, resetRuntimeLayer, startRefresh } from './refresh.ts';

const STARTUP_REFRESH_ALARM = 'refresh-startup';
const PERIODIC_REFRESH_ALARM = 'refresh-periodic';
// Wait for the browser to settle before touching the network after a start.
const STARTUP_DELAY_MINUTES = 0.5;
const PERIODIC_MINUTES = 6 * 60;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install' || reason === 'update') await resetRuntimeLayer();
  await setUp();
});

chrome.runtime.onStartup.addListener(setUp);

async function setUp(): Promise<void> {
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  await syncControlRules();
  await enableExtraRulesetIfRoom();
  await chrome.alarms.create(STARTUP_REFRESH_ALARM, { delayInMinutes: STARTUP_DELAY_MINUTES });
  if (!(await chrome.alarms.get(PERIODIC_REFRESH_ALARM))) {
    await chrome.alarms.create(PERIODIC_REFRESH_ALARM, { periodInMinutes: PERIODIC_MINUTES });
  }
}

chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === STARTUP_REFRESH_ALARM) void startRefresh(true);
  else if (name === PERIODIC_REFRESH_ALARM) void startRefresh(false);
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const reply = handle(message, sender);
  if (!reply) return false;
  reply.then(sendResponse, (error) => {
    console.error(`[miracle] ${message.type} failed`, error);
    sendResponse(undefined);
  });
  return true;
});

function handle(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> | undefined {
  switch (message.type) {
    case 'cosmetic:page':
      return hideOnPage(sender, (engine, host) => engine.forPage(host));
    case 'cosmetic:tokens':
      return hideOnPage(sender, (engine, host) => engine.forTokens(host, message.tokens));
    case 'popup:state':
      return popupState(message.url);
    case 'popup:set-enabled':
      return setEnabled(message.enabled);
    case 'popup:set-paused':
      return setPaused(message.host, message.paused);
    case 'refresh:now':
      return startRefresh(true);
    case 'refresh:result':
      return finishRefresh(message.result);
    default:
      return undefined;
  }
}

type Engine = Awaited<ReturnType<typeof getCosmeticEngine>>;

/** Resolves to whether the content script should keep reporting. */
async function hideOnPage(
  sender: chrome.runtime.MessageSender,
  pick: (engine: Engine, host: string) => string[],
): Promise<{ active: boolean }> {
  const tabId = sender.tab?.id;
  const host = hostOf(sender.url);
  const topHost = hostOf(sender.tab?.url) ?? host;
  if (tabId === undefined || sender.frameId === undefined || !host || !topHost) return { active: false };

  const { enabled, pausedSites } = await getControls();
  if (!enabled || isPaused(topHost, pausedSites)) return { active: false };

  await injectHidingCss(tabId, sender.frameId, pick(await getCosmeticEngine(), host));
  return { active: true };
}

async function popupState(url: string | undefined): Promise<PopupState> {
  const [{ enabled, pausedSites }, { lastRefresh }] = await Promise.all([getControls(), getLocal(['lastRefresh'])]);
  const host = hostOf(url);
  const state: PopupState = { enabled, paused: host ? isPaused(host, pausedSites) : false };
  if (host) state.host = host;
  if (lastRefresh) state.lastRefresh = lastRefresh;
  return state;
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? hostname : undefined;
  } catch {
    return undefined;
  }
}
