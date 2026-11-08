// The Gmail side of the Gemini check: gathers the email, the attachment's text
// and page images, sends them to the background script, and stores the
// checked result.

(() => {
  const DC = globalThis.DC;

  // Short documents are sent whole. For longer ones, retrieval decides what
  // Gemini works with: page 1 plus the best page for each claim in the email
  // (pictures and text), up to MAX_PAGES. Fewer, relevant pages also keep the
  // check fast.
  const SHORT_DOC = 3; // pages
  const MIN_PAGES = 3; // top up with the next-best pages if the claims share pages
  const MAX_PAGES = 6;
  const LITTLE_TEXT = 200; // characters; below this a page is "mostly picture"

  // What each kind of sensitive document is called in the warning.
  const SENSITIVE = {
    passport: { name: "a passport", what: "identity documents" },
    drivers_license: { name: "a driver's license", what: "identity documents" },
    national_id: { name: "an ID card", what: "identity documents" },
    social_security_card: { name: "a Social Security card", what: "Social Security numbers" },
    credit_card: { name: "a credit card", what: "card details" },
    debit_card: { name: "a debit card", what: "card details" },
  };

  function readEmail(draft) {
    const email = DC.gmail.readDraft(draft);
    return { ...email, text: `${email.subject}\n${email.body}`.trim() };
  }

  // Which pages Gemini gets, and why.
  //   pages:    page numbers, sent as pictures (and, for long documents, the only text sent)
  //   allText:  true when every page's text is sent (short documents, or no retrieval)
  //   matches:  each claim and the page retrieved for it, or null
  async function choosePages(entry, emailText) {
    const all = entry.pages.map((p) => p.number);
    if (all.length <= SHORT_DOC) return { pages: all, allText: true, matches: null };

    const matches = await DC.rag.matchClaims(entry, emailText);
    if (!matches) {
      // No retrieval (no claims yet, or embeddings unavailable): play it safe
      // with all the text plus pictures of page 1 and mostly-picture pages.
      const pictures = entry.pages.filter((p) => p.text.length < LITTLE_TEXT).map((p) => p.number);
      return { pages: [...new Set([1, ...pictures])].slice(0, SHORT_DOC), allText: true, matches: null };
    }

    const chosen = new Set([1, ...matches.claims.map((c) => c.page)]);
    for (const { page } of matches.pages) {
      if (chosen.size >= MIN_PAGES) break;
      chosen.add(page);
    }
    const pages = [...chosen].slice(0, MAX_PAGES).sort((a, b) => a - b);
    return { pages, allText: false, matches };
  }

  // "This looks like a photo of a passport", shown before the other problems.
  function sensitiveIssue(result, entry) {
    const kind = SENSITIVE[result.sensitive_document];
    if (!kind) return null;
    const page = entry.pages.find((p) => p.number === result.sensitive_page) || entry.pages[0];
    return {
      type: "sensitive",
      source: "gemini",
      title: "Sensitive document",
      detail:
        `This looks like ${kind.name}. Email isn't a secure way to send ${kind.what}: ` +
        "copies stay in both inboxes and can be forwarded, or exposed if either account is hacked.",
      evidence: { file: entry, page, word: null, visualOnly: true },
    };
  }

  // Ask Gemini about one attachment. Saves and returns entry.ai:
  //   { status: "done", issues, summary, seconds } | { status: "off" } (no key) | { status: "error" }
  async function analyze(draft, entry) {
    const email = readEmail(draft);
    const state = DC.drafts.get(draft);
    const otherAttachments = otherFiles(state, entry);
    const requestId = (entry.aiRequestId || 0) + 1;
    entry.aiRequestId = requestId;
    entry.aiAskedFor = askedFor(email.text, otherAttachments);
    state.pending++;
    DC.badge.update(draft);

    const started = performance.now();
    let result;
    try {
      // Privacy screen first: if a photo or scanned page is an ID or card
      // (judged from a blurred thumbnail), stop here. No readable picture of
      // it is ever sent.
      const screening = await DC.rag.screen(entry);
      if (screening.sensitive) {
        result = {
          status: "done",
          issues: [sensitiveIssue(screening.sensitive, entry)].filter(Boolean),
          seconds: (performance.now() - started) / 1000,
          summary: "Stopped at the privacy screen",
          emailText: email.text,
        };
        return result;
      }

      // Card numbers, SSNs and keys are hidden from everything sent to Gemini
      // (text here; page pictures are blacked out in DC.rag.pageImage).
      const hide = DC.secrets.mask;
      const chosen = await choosePages(entry, hide(email.text));
      const images = await Promise.all(
        chosen.pages.map(async (page) => ({ page, data: await DC.rag.pageImage(entry, page) }))
      );
      const picturesReady = performance.now();
      if (chosen.matches) {
        DC.log(
          `vision RAG for ${entry.name}: Gemini gets pages ${chosen.pages.join(", ")} of ${entry.pages.length}`,
          chosen.matches.claims.map((c) => `"${c.text}" → p${c.page} (${c.score.toFixed(3)})`)
        );
      }
      const textPages = chosen.allText ? entry.pages : entry.pages.filter((p) => chosen.pages.includes(p.number));
      const response = await DC.send({
        type: "gemini-compare",
        payload: {
          email: { subject: hide(email.subject), body: hide(email.body), recipients: email.recipients },
          file: {
            name: entry.name,
            kind: entry.kind,
            otherAttachments,
            totalPages: entry.pages.length,
            pages: textPages.map((p) => ({ number: p.number, text: hide(p.text) })),
            images,
            retrieved: chosen.matches?.claims.map((c) => ({ claim: c.text, page: c.page })) || null,
          },
        },
      });
      const seconds = (performance.now() - started) / 1000;
      DC.log(
        `timing for ${entry.name}: picking + drawing pages ${((picturesReady - started) / 1000).toFixed(2)}s ` +
          `(${DC.plural(images.length, "page")}), Gemini ${((performance.now() - picturesReady) / 1000).toFixed(2)}s`
      );

      if (!response) {
        // This Gmail tab is running an old copy of the extension (see DC.send).
        result = { status: "error", error: "Extension was reloaded", emailText: email.text };
      } else if (!response.ok) {
        result = { status: response.code === "no-key" ? "off" : "error", error: response.error, emailText: email.text };
        if (result.status === "off") nudgeSetup();
        else console.warn("[doublechckr] Gemini:", response.error);
      } else {
        const issues = DC.verify.toIssues(response.result.findings, entry, email.text, chosen.pages);
        const sensitive = sensitiveIssue(response.result, entry);
        if (sensitive) issues.unshift(sensitive);
        result = {
          status: "done",
          issues,
          seconds,
          summary: response.result.summary,
          model: response.result.model,
          emailText: email.text,
        };
        DC.log(`Gemini (${result.model}, ${seconds.toFixed(1)}s) on ${entry.name}: "${result.summary}"`, {
          sensitive: response.result.sensitive_document,
          raw: response.result.findings,
          kept: issues,
        });
      }
    } catch (err) {
      result = { status: "error", error: String(err), emailText: email.text };
      if (!DC.isStale()) console.warn("[doublechckr] Gemini:", err);
    } finally {
      state.pending--;
      // If a newer check started while this one was running, keep the newer one.
      if (requestId === entry.aiRequestId) entry.ai = result;
      DC.badge.update(draft);
    }
    return entry.ai;
  }

  // The names of the draft's other attachments. Each file is checked on its
  // own, so Gemini needs to know the email may be describing these instead.
  function otherFiles(state, entry) {
    return state.files.filter((f) => f !== entry).map((f) => f.name);
  }

  // What a check was based on: the email text plus the other attachments.
  const askedFor = (text, others) => `${text}\n--files--\n${[...others].sort().join("\n")}`;

  // Re-ask Gemini when the email or the set of attachments has changed since
  // the last check.
  function recheck(draft) {
    const state = DC.drafts.get(draft);
    const text = readEmail(draft).text;
    for (const entry of state.files) {
      if (!entry.pages || entry.aiAskedFor === askedFor(text, otherFiles(state, entry))) continue;
      analyze(draft, entry);
    }
  }

  let nudged = false;
  function nudgeSetup() {
    if (nudged) return;
    nudged = true;
    DC.toast("doublechckr's AI check isn't set up yet. Click the doublechckr icon in Chrome's toolbar to add your key.");
  }

  DC.ai = { analyze, recheck, readEmail };
})();
