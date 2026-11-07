// Starts everything up. Loaded last, after all the other files.

(() => {
  const DC = globalThis.DC;

  // Keep every open draft's badge up to date. Gmail adds and removes draft
  // windows all the time, so check regularly instead of tracking each one.
  function refreshAll() {
    for (const draft of DC.gmail.allDrafts()) {
      DC.attachments.forgetRemoved(draft);
      DC.badge.update(draft);
    }
  }
  setInterval(refreshAll, 1000);

  // Re-check shortly after the user stops typing, so the badge reacts quickly.
  const typingTimers = new WeakMap();
  window.addEventListener(
    "input",
    (e) => {
      const draft = DC.gmail.findDraft(e.target);
      if (!draft) return;
      clearTimeout(typingTimers.get(draft));
      typingTimers.set(draft, setTimeout(() => DC.badge.update(draft), 400));
    },
    true
  );

  DC.log("loaded");
})();
