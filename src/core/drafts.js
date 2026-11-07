// Keeps separate state for each open draft, so two drafts never get mixed up.

(() => {
  const DC = globalThis.DC;
  const states = new WeakMap();

  DC.drafts = {
    // The draft the user was last working in. Gmail's file picker isn't
    // inside the draft, so this tells us where a new file belongs.
    lastActive: null,

    get(draft) {
      if (!states.has(draft)) {
        states.set(draft, {
          files: [], // attachments we grabbed
          pending: 0, // how many files are still being read
          bypassUntil: 0, // set by "Send anyway"
        });
      }
      return states.get(draft);
    },
  };

  for (const type of ["focusin", "mousedown"]) {
    window.addEventListener(
      type,
      (e) => {
        const draft = DC.gmail.findDraft(e.target);
        if (draft) DC.drafts.lastActive = draft;
      },
      true
    );
  }
})();
