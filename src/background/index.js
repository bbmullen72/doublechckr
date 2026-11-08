// The extension's background script. Gmail-side code sends it messages, and
// it does the things a web page isn't allowed to (calling Gemini with your key,
// opening the settings page).

import { compare, screen } from "./gemini.js";
import { embedPages, embedQueries } from "./embeddings.js";

// Run `work`, then answer the message with { ok, ... } or { ok: false, code, error }.
function answer(work, sendResponse) {
  work.then(
    (result) => sendResponse({ ok: true, ...result }),
    (err) => sendResponse({ ok: false, code: err.code || "error", error: err.message || String(err) })
  );
  return true; // tells Chrome we'll answer later
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "gemini-compare":
      return answer(compare(message.payload).then((result) => ({ result })), sendResponse);
    case "screen-images":
      return answer(screen(message.images).then((result) => ({ result })), sendResponse);
    case "embed-pages":
      return answer(embedPages(message.images).then((vectors) => ({ vectors })), sendResponse);
    case "embed-queries":
      return answer(embedQueries(message.texts).then((vectors) => ({ vectors })), sendResponse);
    case "open-settings":
      chrome.runtime.openOptionsPage();
  }
});

// Clicking the doublechckr icon in Chrome's toolbar opens settings.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
