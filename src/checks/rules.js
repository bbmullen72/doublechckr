// The checks. Each one looks at the email and the attached PDFs and returns
// a list of problems (empty if everything looks fine).
//
// These are simple built-in rules. Gemini will add smarter checks later.
//
// A problem looks like:
//   type     what kind: missing, version, amount, date, name, ...
//   title    short name, e.g. "Amount doesn't match"
//   detail   one sentence explaining it
//   compare  optional { email, doc } values to show side by side
//   evidence optional { file, page, word, emailQuote, emailMatch }:
//            where in the PDF (and the email) the proof is

(() => {
  const DC = globalThis.DC;

  const MENTIONS_ATTACHMENT = /\b(attach(ed|ing|ment|ments)?|enclosed|see the (file|document|pdf))\b/i;
  const SAYS_FINAL = /\bfinal\b/i;
  const MARKED_DRAFT = /\bDRAFT\b|status:\s*draft/i;
  const MONEY = /\$\s?\d[\d,]*(?:\.\d{1,2})?/g;
  const TOTAL_LABEL = /\b(total|budget|amount due|balance due)\b/i;

  function missingAttachment(ctx) {
    if (!MENTIONS_ATTACHMENT.test(ctx.text) || ctx.hasAttachment) return [];
    return [
      {
        type: "missing",
        title: "Missing attachment",
        detail: "Your email mentions an attachment, but nothing is attached.",
      },
    ];
  }

  function draftMarkedFinal(ctx) {
    if (!SAYS_FINAL.test(ctx.text)) return [];
    for (const file of ctx.pdfs) {
      for (const page of file.pages) {
        const word = page.words.find((w) => MARKED_DRAFT.test(w.text));
        if (!word) continue;
        return [
          {
            type: "version",
            title: "Possible outdated document",
            detail: `Your email says "final", but page ${page.number} of ${file.name} is marked "DRAFT".`,
            evidence: { file, page, word, ...quoteFromEmail(ctx.text, SAYS_FINAL) },
          },
        ];
      }
    }
    return [];
  }

  function amountMismatch(ctx) {
    const emailAmounts = [...ctx.text.matchAll(MONEY)].map((m) => m[0].replace(/\s/g, ""));
    if (!emailAmounts.length) return [];

    const docAmounts = findDocAmounts(ctx.pdfs);
    const docValues = new Set(docAmounts.map((a) => toNumber(a.raw)));

    // Only compare against an amount the PDF clearly labels as a total or
    // budget. Invoices have lots of numbers (line items, tax), and we'd
    // rather miss a problem than raise a false alarm.
    const labeled = docAmounts.filter((a) => a.labeled);
    const best = labeled.find((a) => /total/i.test(a.line)) || labeled[0];
    if (!best) return [];

    const problems = [];
    for (const raw of new Set(emailAmounts)) {
      if (docValues.has(toNumber(raw))) continue; // the PDF mentions this amount somewhere
      problems.push({
        type: "amount",
        title: "Amount doesn't match",
        detail: `Your email says ${raw}, but ${best.file.name} says ${best.raw}.`,
        compare: { email: raw, doc: best.raw },
        evidence: {
          file: best.file,
          page: best.page,
          word: best.word,
          ...quoteFromEmail(ctx.text, new RegExp(escapeRegex(raw).replace("\\$", "\\$\\s?"))),
        },
      });
    }
    return problems;
  }

  // Card numbers, SSNs and secret keys typed in the email or inside an
  // attachment's text. One warning for the email, one per attachment.
  function sensitiveInfo(ctx) {
    const problems = [];
    const describe = (finds) => {
      const kinds = [...new Set(finds.map((f) => f.label))];
      const list = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`;
      const examples = finds.slice(0, 3).map((f) => f.masked).join(", ");
      return { list, examples };
    };

    const inEmail = DC.secrets.find(ctx.text);
    if (inEmail.length) {
      const { list, examples } = describe(inEmail);
      problems.push({
        type: "secret",
        title: "Sensitive info in your email",
        detail: `Your email contains ${list} (${examples}). Email isn't a secure way to send this: copies stay in both inboxes and can be forwarded or leaked.`,
      });
    }

    for (const file of ctx.pdfs) {
      let first = null;
      const finds = [];
      for (const page of file.pages) {
        for (const f of DC.secrets.find(page.text)) {
          finds.push(f);
          first ||= { page, word: DC.verify.locate(page, f.raw) };
        }
      }
      if (!finds.length) continue;
      const { list, examples } = describe(finds);
      problems.push({
        type: "secret",
        title: "Sensitive info in your attachment",
        detail: `${file.name} contains ${list} (${examples}). Email isn't a secure way to send this.`,
        evidence: { file, page: first.page, word: first.word },
      });
    }
    return problems;
  }

  // ---- helpers ----

  function findDocAmounts(pdfs) {
    const found = [];
    for (const file of pdfs) {
      for (const page of file.pages) {
        for (const word of page.words) {
          for (const m of word.text.matchAll(MONEY)) {
            const line = sameLineText(page, word);
            found.push({ raw: m[0].replace(/\s/g, ""), file, page, word, line, labeled: TOTAL_LABEL.test(line) });
          }
        }
      }
    }
    return found;
  }

  // All the text on the same line as `word`, e.g. "Total Budget: $18,500".
  function sameLineText(page, word) {
    return page.words
      .filter((w) => Math.abs(w.y - word.y) < Math.max(word.height, 4) / 2)
      .sort((a, b) => a.x - b.x)
      .map((w) => w.text)
      .join(" ");
  }

  // The sentence in the email that contains the match, for showing in the warning.
  function quoteFromEmail(text, pattern) {
    const m = pattern.exec(text);
    if (!m) return {};
    const start = Math.max(text.lastIndexOf(".", m.index), text.lastIndexOf("\n", m.index)) + 1;
    const ends = [".", "\n"].map((c) => text.indexOf(c, m.index + m[0].length)).filter((i) => i >= 0);
    const end = ends.length ? Math.min(...ends) + 1 : text.length;
    return { emailQuote: text.slice(start, end).trim().slice(0, 200), emailMatch: m[0] };
  }

  // Same, but for exact words (ignoring capitals and extra spaces).
  function quoteForString(text, words) {
    if (!words) return {};
    return quoteFromEmail(text, new RegExp(escapeRegex(words).replace(/\s+/g, "\\s+"), "i"));
  }

  const toNumber = (raw) => Number(raw.replace(/[^\d.]/g, ""));
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  DC.rules = { missingAttachment, draftMarkedFinal, amountMismatch, sensitiveInfo, quoteForString };
})();
