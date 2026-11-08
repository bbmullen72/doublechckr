// Stops Gmail from sending when there's a problem, and shows the warning instead.

(() => {
  const DC = globalThis.DC;

  const STILL_CHECKING = {
    title: "Still checking your attachment",
    detail: "doublechckr hasn't finished reading your attachment yet. Wait a second, or send anyway.",
  };

  function trySend(e, draft) {
    const state = DC.drafts.get(draft);
    if (Date.now() < state.bypassUntil) return; // user chose "Send anyway"

    const status = DC.draftStatus(draft);
    if (status.kind !== "issues" && status.kind !== "checking") {
      // All good, let Gmail send. Log what we saw, to help debug missed problems.
      if (e.type === "click" || e.type === "keydown") {
        DC.log("send allowed", {
          status: status.kind,
          ...DC.gmail.readDraft(draft),
          attachments: DC.drafts.get(draft).files.map((f) => f.name),
        });
      }
      return;
    }

    // Stop Gmail from seeing this click or keypress.
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "click" || e.type === "keydown") {
      DC.warning.show(draft, status.kind === "checking" ? [STILL_CHECKING] : status.issues);
    }
  }

  // Gmail may send on mousedown, mouseup or click, so block all three.
  for (const type of ["mousedown", "mouseup", "click"]) {
    window.addEventListener(
      type,
      (e) => {
        const button = e.target instanceof Element && e.target.closest(DC.gmail.SEND_BUTTON);
        if (!button) return;
        const draft = DC.gmail.findDraft(button);
        if (draft) trySend(e, draft);
      },
      true
    );
  }

  // Keyboard shortcut: Cmd+Enter / Ctrl+Enter.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      const draft = DC.gmail.findDraft(e.target);
      if (draft) trySend(e, draft);
    },
    true
  );

  // Let Send through for one second, then press Gmail's Send button for the user.
  function sendAnyway(draft) {
    DC.drafts.get(draft).bypassUntil = Date.now() + 1000;
    const button = DC.gmail.sendButton(draft);
    if (!button) return;
    for (const type of ["mousedown", "mouseup", "click"]) {
      button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  DC.sendGuard = { sendAnyway };
})();
