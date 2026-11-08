// Runs every check on a draft and decides its overall status.

(() => {
  const DC = globalThis.DC;
  const RULES = [DC.rules.sensitiveInfo, DC.rules.missingAttachment, DC.rules.draftMarkedFinal, DC.rules.amountMismatch];

  function checkDraft(draft) {
    const state = DC.drafts.get(draft);
    const { subject, body } = DC.gmail.readDraft(draft);
    const text = `${subject}\n${body}`;
    const ctx = {
      text,
      hasAttachment: state.files.length > 0 || !!draft.querySelector('input[name="attach"]'),
      pdfs: state.files.filter((f) => f.pages),
    };

    const local = RULES.flatMap((rule) => rule(ctx));
    const localTypes = new Set(local.map((p) => p.type));
    const all = [...local, ...geminiIssues(state, text).filter((p) => !localTypes.has(p.type))];
    return sortByImportance(withoutNoise(all));
  }

  // If a file is the wrong document altogether, its amounts, dates and names
  // not matching the email is expected, not news. Drop those for that file.
  const DETAILS = new Set(["amount", "date", "name", "version", "missing_content"]);
  function withoutNoise(problems) {
    const wrongFiles = new Set(problems.filter((p) => p.type === "wrong_document").map((p) => p.evidence?.file));
    return problems.filter((p) => !(DETAILS.has(p.type) && wrongFiles.has(p.evidence?.file)));
  }

  // Most serious first: it's the one shown open in the warning.
  const ORDER = ["secret", "sensitive", "missing", "wrong_document", "recipient"];
  function sortByImportance(problems) {
    const rank = (p) => (ORDER.includes(p.type) ? ORDER.indexOf(p.type) : ORDER.length);
    return [...problems].sort((a, b) => rank(a) - rank(b));
  }

  // Gemini's problems, minus any whose email words the user has since edited away.
  // With several attachments, each was checked on its own, so "missing" and
  // "wrong document" can't be judged from one file: the email may be talking
  // about another attachment. Those are dropped.
  const NEEDS_ALL_FILES = new Set(["missing_content", "wrong_document"]);
  function geminiIssues(state, text) {
    const several = state.files.length > 1;
    return state.files
      .flatMap((f) => (f.ai?.status === "done" ? f.ai.issues : []))
      .filter((p) => !(several && NEEDS_ALL_FILES.has(p.type)))
      .filter((p) => !p.evidence.emailMatch || DC.verify.inText(text, p.evidence.emailMatch));
  }

  // One of:
  //   watching  nothing to check yet
  //   checking  reading an attachment or waiting on Gemini
  //   issues    at least one problem (listed in `issues`)
  //   verified  Gemini checked every PDF and found nothing
  //   clear     the built-in checks found nothing, but Gemini hasn't checked
  function draftStatus(draft) {
    const state = DC.drafts.get(draft);
    if (state.pending > 0) return { kind: "checking", issues: [] };

    const issues = checkDraft(draft);
    if (issues.length) return { kind: "issues", issues };

    const pdfs = state.files.filter((f) => f.pages);
    if (!pdfs.length) return { kind: "watching", issues };
    return { kind: pdfs.every((f) => f.ai?.status === "done") ? "verified" : "clear", issues };
  }

  DC.checkDraft = checkDraft;
  DC.draftStatus = draftStatus;
})();
