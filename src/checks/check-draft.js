// Runs every check on a draft and decides its overall status.

(() => {
  const DC = globalThis.DC;
  const RULES = [DC.rules.missingAttachment, DC.rules.draftMarkedFinal, DC.rules.amountMismatch];

  function checkDraft(draft) {
    const state = DC.drafts.get(draft);
    const { subject, body } = DC.gmail.readDraft(draft);
    const ctx = {
      text: `${subject}\n${body}`,
      hasAttachment: state.files.length > 0 || !!draft.querySelector('input[name="attach"]'),
      pdfs: state.files.filter((f) => f.pages),
    };
    return RULES.flatMap((rule) => rule(ctx));
  }

  // One of:
  //   watching  nothing to check yet
  //   checking  still reading an attachment
  //   verified  attachment read, no problems
  //   issues    at least one problem (listed in `issues`)
  function draftStatus(draft) {
    const state = DC.drafts.get(draft);
    if (state.pending > 0) return { kind: "checking", issues: [] };
    const issues = checkDraft(draft);
    if (issues.length) return { kind: "issues", issues };
    if (state.files.some((f) => f.pages)) return { kind: "verified", issues };
    return { kind: "watching", issues };
  }

  DC.checkDraft = checkDraft;
  DC.draftStatus = draftStatus;
})();
