// Hosts the list worker. Offscreen documents only get chrome.runtime, so the
// background service worker applies the result.

import type { Message, RefreshResult } from '../shared/messages.ts';

let worker: Worker | undefined;

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type !== 'refresh:start') return;
  worker ??= new Worker('worker.js');
  worker.onmessage = (event: MessageEvent<RefreshResult>) => {
    // Sent as a new message rather than a reply, so it reaches the service
    // worker even if Edge restarted it while the lists were downloading.
    void chrome.runtime.sendMessage({ type: 'refresh:result', result: event.data } satisfies Message);
  };
  worker.postMessage(message.request);
});
