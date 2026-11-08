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

  // After the user stops typing: re-run the quick built-in checks right away,
  // and ask Gemini again a little later if the email changed.
  const typingTimers = new WeakMap();
  const geminiTimers = new WeakMap();
  window.addEventListener(
    "input",
    (e) => {
      const draft = DC.gmail.findDraft(e.target);
      if (!draft) return;
      clearTimeout(typingTimers.get(draft));
      clearTimeout(geminiTimers.get(draft));
      typingTimers.set(draft, setTimeout(() => DC.badge.update(draft), 400));
      // An old copy left running after the extension was reloaded can't reach Gemini.
      if (!DC.isStale()) geminiTimers.set(draft, setTimeout(() => DC.ai.recheck(draft), 1500));
    },
    true
  );

  DC.log("loaded");
})();
