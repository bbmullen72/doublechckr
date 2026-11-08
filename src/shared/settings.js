// Settings saved in Chrome (only on this computer, never in the code or on GitHub).
// Used by the settings page and the background script.

export const DEFAULT_MODEL = "gemini-2.5-flash";

export async function getSettings() {
  const { geminiKey = "", geminiModel = DEFAULT_MODEL } = await chrome.storage.local.get([
    "geminiKey",
    "geminiModel",
  ]);
  return { geminiKey: geminiKey.trim(), geminiModel };
}

export function saveSettings(changes) {
  return chrome.storage.local.set(changes);
}

export function removeKey() {
  return chrome.storage.local.remove("geminiKey");
}
