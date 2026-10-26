// Reports the classes and IDs on the page so the background can inject only
// the generic hiding rules that can actually match. All CSS is injected by
// the background; this script never touches the page's styles itself.

import type { Message } from '../shared/messages.ts';

const BATCH_DELAY_MS = 150;
/** Stop watching pages that churn through more tokens than any real layout. */
const MAX_TOKENS = 20_000;

const seen = new Set<string>();
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let observer: MutationObserver | undefined;

void send({ type: 'cosmetic:page' }).then((reply) => {
  if (!reply?.active) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
});

function start(): void {
  collect(document.documentElement);
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') collectElement(mutation.target as Element);
      else for (const node of mutation.addedNodes) if (node instanceof Element) collect(node);
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'id'],
  });
}

function collect(root: Element): void {
  collectElement(root);
  for (const element of root.querySelectorAll('[id],[class]')) collectElement(element);
}

function collectElement(element: Element): void {
  if (element.id) add(`#${element.id}`);
  for (const name of element.classList) add(`.${name}`);
}

function add(token: string): void {
  if (seen.has(token)) return;
  seen.add(token);
  pending.push(token);
  timer ??= setTimeout(flush, BATCH_DELAY_MS);
}

function flush(): void {
  timer = undefined;
  const tokens = pending;
  pending = [];
  if (seen.size > MAX_TOKENS) observer?.disconnect();
  void send({ type: 'cosmetic:tokens', tokens }).then((reply) => {
    if (reply && !reply.active) observer?.disconnect();
  });
}

async function send(message: Message): Promise<{ active: boolean } | undefined> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    // The extension was reloaded or updated; this copy of the script is orphaned.
    observer?.disconnect();
    return undefined;
  }
}
