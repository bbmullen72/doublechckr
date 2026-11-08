// Everything that depends on how Gmail's page is built lives here, so if
// Gmail changes its layout, this is the one file to fix.
// These selectors assume Gmail is in English.

(() => {
  const DC = globalThis.DC;

  const SEND_BUTTON = 'div[role="button"][data-tooltip^="Send"]';
  // Gmail marks the real message body with g_editable. Other text boxes in
  // the draft (like Gmail's "Describe your message" AI box) don't have it.
  const MESSAGE_BODY = 'div[contenteditable="true"][g_editable="true"], div[contenteditable="true"][aria-label="Message Body"]';
  const SUBJECT = 'input[name="subjectbox"]';

  // Find the draft window an element belongs to: the closest parent that
  // holds both a message body and a Send button.
  function findDraft(el) {
    let node = el instanceof Element ? el : null;
    while (node && node !== document.body) {
      if (node.querySelector(SEND_BUTTON) && node.querySelector(MESSAGE_BODY)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function allDrafts() {
    const drafts = new Set();
    for (const button of document.querySelectorAll(SEND_BUTTON)) {
      const draft = findDraft(button);
      if (draft) drafts.add(draft);
    }
    return [...drafts];
  }

  // Read what the user has written. Quoted text from earlier emails in a
  // reply is left out, so old messages don't trigger checks.
  function readDraft(draft) {
    const subject = draft.querySelector(SUBJECT)?.value || "";
    const bodyEl = draft.querySelector(MESSAGE_BODY);
    let body = "";
    if (bodyEl) {
      const copy = bodyEl.cloneNode(true);
      copy.querySelectorAll(".gmail_quote").forEach((q) => q.remove());
      body = copy.innerText || copy.textContent || "";
    }
    const recipients = [...draft.querySelectorAll("[email]")].map((r) => r.getAttribute("email"));
    return { subject, body, recipients };
  }

  DC.gmail = {
    SEND_BUTTON,
    MESSAGE_BODY,
    findDraft,
    allDrafts,
    readDraft,
    sendButton: (draft) => draft.querySelector(SEND_BUTTON),
    messageBody: (draft) => draft.querySelector(MESSAGE_BODY),
  };
})();
