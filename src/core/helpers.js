// Small helpers shared by every file.
//
// How the files talk to each other: Chrome loads each file listed in
// manifest.json in order, and they all share one object, DC. Each file adds
// its piece to DC (DC.pdf, DC.badge, ...) so later files can use it.

(() => {
  const DC = (globalThis.DC = globalThis.DC || {});

  // Create an element with an optional class and text.
  DC.el = function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  DC.plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

  DC.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  DC.log = (...args) => console.log("[doublechckr]", ...args);

  // When the extension is reloaded or updated, the copy already running in an
  // open Gmail tab loses its connection to the extension ("Extension context
  // invalidated"). Notice that, tell the user once, and quietly stop.
  DC.isStale = () => !globalThis.chrome?.runtime?.id;

  let staleNoticeShown = false;
  DC.staleNotice = () => {
    if (staleNoticeShown) return;
    staleNoticeShown = true;
    DC.toast?.("doublechckr was updated. Reload Gmail to keep checking.");
  };

  // Send a message to the extension's background script. Resolves to null if
  // this Gmail tab is running an old copy of the extension.
  DC.send = async (message) => {
    if (DC.isStale()) {
      DC.staleNotice();
      return null;
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (err) {
      if (DC.isStale() || /context invalidated/i.test(String(err))) {
        DC.staleNotice();
        return null;
      }
      throw err;
    }
  };
})();
