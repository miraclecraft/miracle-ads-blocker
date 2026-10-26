import { RULES_DIR, type BundleMeta } from '../shared/bundle.ts';
import type { LastRefresh, Message, PopupState } from '../shared/messages.ts';
import { SOURCES } from '../shared/sources.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const hostEl = $('host');
const blockedEl = $('blocked');
const siteRow = $('site-row');
const siteToggle = $<HTMLInputElement>('site-toggle');
const globalToggle = $<HTMLInputElement>('global-toggle');
const refreshButton = $<HTMLButtonElement>('refresh');
const summaryEl = $('lists-summary');
const sourcesEl = $('sources');

const send = <T>(message: Message) => chrome.runtime.sendMessage(message) as Promise<T>;

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const meta = (await fetch(`../${RULES_DIR}/meta.json`).then((r) => r.json())) as BundleMeta;

async function render(): Promise<void> {
  const state = await send<PopupState>({ type: 'popup:state', url: tab?.url });

  hostEl.textContent = state.host ?? 'This page';
  siteRow.hidden = !state.host;
  siteToggle.checked = !state.paused;
  siteToggle.disabled = !state.enabled;
  globalToggle.checked = state.enabled;

  renderLists(state.lastRefresh);
  await renderBlockedCount();
}

async function renderBlockedCount(): Promise<void> {
  if (tab?.id === undefined) return;
  try {
    // Allowed for the active tab because opening the popup grants activeTab.
    const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId: tab.id });
    blockedEl.textContent = String(rulesMatchedInfo.length);
  } catch {
    blockedEl.textContent = '–';
  }
}

function renderLists(last: LastRefresh | undefined): void {
  const packaged = `Packaged ${formatDate(Date.parse(meta.builtAt))}`;
  if (!last) summaryEl.textContent = `${packaged}. Not checked for updates yet.`;
  else if (!last.ok) summaryEl.textContent = `${packaged}. Last check failed: ${last.error}`;
  else summaryEl.textContent = `${packaged}. Checked ${formatDate(last.at)}: +${last.added} / −${last.removed} rules.`;

  sourcesEl.replaceChildren(
    ...SOURCES.filter((source) => !source.local).map((source) => {
      const status = last?.sources.find((s) => s.id === source.id);
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = source.name;
      const tag = document.createElement('span');
      tag.className = 'tag';
      if (status?.state === 'fresh') {
        tag.classList.add('ok');
        tag.textContent = 'UP TO DATE';
      } else if (status?.state === 'failed') {
        tag.classList.add('warn');
        tag.textContent = 'FAILED';
        tag.title = status.error ?? '';
      } else {
        tag.textContent = source.bundle ? 'PACKAGED' : 'PENDING';
      }
      li.append(name, tag);
      return li;
    }),
  );
}

function formatDate(time: number): string {
  return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

siteToggle.addEventListener('change', async () => {
  const state = await send<PopupState>({ type: 'popup:state', url: tab?.url });
  if (state.host) await send({ type: 'popup:set-paused', host: state.host, paused: !siteToggle.checked });
  if (tab?.id !== undefined) await chrome.tabs.reload(tab.id);
  await render();
});

globalToggle.addEventListener('change', async () => {
  await send({ type: 'popup:set-enabled', enabled: globalToggle.checked });
  await render();
});

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Checking…';
  await send({ type: 'refresh:now' });
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.lastRefresh) return;
  refreshButton.disabled = false;
  refreshButton.textContent = 'Check for updates';
  void render();
});

await render();
