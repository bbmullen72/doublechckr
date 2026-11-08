// Checks Gemini's work before showing it. Every quote Gemini gives must really
// be in the email or the PDF; findings with made-up quotes are thrown out.
// Also finds where on the page the quote sits, so we can draw a box around it.

(() => {
  const DC = globalThis.DC;

  const TITLES = {
    amount: "Amount doesn't match",
    date: "Date doesn't match",
    name: "Name doesn't match",
    version: "Possible outdated document",
    wrong_document: "This may be the wrong document",
    recipient: "Document may be meant for someone else",
    missing_content: "Something your email mentions is missing",
    other: "Possible mismatch",
  };
  const SIDE_BY_SIDE = new Set(["amount", "date", "name"]);

  // Lowercase, standard quote marks and dashes, no spaces: so "$18, 500"
  // matches "$18,500" and "14–16" (long dash) matches "14-16" (hyphen).
  const squash = (s) =>
    (s || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐-―−]/g, "-")
      .replace(/\s+/g, "");

  // A page with almost no text is a picture or scan; anything Gemini quotes
  // from it can only have come from the image.
  const PICTURE_PAGE_CHARS = 50;

  const inText = (text, quote) => squash(text).includes(squash(quote));

  // Find a quote on a page and return a box covering it, or null.
  function locate(page, quote) {
    const target = squash(quote);
    if (!target) return null;

    let joined = "";
    const owner = []; // which text piece each character came from
    page.words.forEach((word, i) => {
      const s = squash(word.text);
      joined += s;
      for (let k = 0; k < s.length; k++) owner.push(i);
    });

    const at = joined.indexOf(target);
    if (at < 0) return null;

    const hits = [...new Set(owner.slice(at, at + target.length))].map((i) => page.words[i]);
    const left = Math.min(...hits.map((w) => w.x));
    const top = Math.min(...hits.map((w) => w.y));
    const right = Math.max(...hits.map((w) => w.x + w.width));
    const bottom = Math.max(...hits.map((w) => w.y + w.height));
    return { text: hits.map((w) => w.text).join(" "), x: left, y: top, width: right - left, height: bottom - top };
  }

  // Turn Gemini's findings into problems the warning can show.
  // imagePages: the page numbers Gemini was shown as pictures.
  function toIssues(findings, entry, emailText, imagePages = []) {
    const issues = [];

    for (const f of findings) {
      const emailQuote = (f.email_quote || "").trim();
      const docQuote = (f.document_quote || "").trim();

      if (emailQuote && !inText(emailText, emailQuote)) {
        DC.log("dropped a Gemini finding: its email quote isn't in the email", f);
        continue;
      }

      let page = entry.pages.find((p) => p.number === f.page) || entry.pages[0];
      let word = null;
      let visualOnly = false;

      if (docQuote) {
        // Look on the page Gemini named first, then the rest.
        for (const p of [page, ...entry.pages.filter((p) => p !== page)]) {
          word = locate(p, docQuote);
          if (word) {
            page = p;
            break;
          }
        }
        if (!word) {
          // Not in the text, so it must have come from a page image: either
          // Gemini says so, or it's a picture-only page Gemini was shown.
          const pictureOnly = page.text.length < PICTURE_PAGE_CHARS && imagePages.includes(page.number);
          if (f.seen_in_image || pictureOnly) {
            visualOnly = true; // e.g. a watermark or a scanned form
          } else {
            DC.log("dropped a Gemini finding: its document quote isn't in the PDF", f);
            continue;
          }
        }
      }

      const type = TITLES[f.type] ? f.type : "other";
      const issue = {
        type,
        source: "gemini",
        title: type === "other" ? f.title || TITLES.other : TITLES[type],
        detail: f.explanation,
        evidence: { file: entry, page, word, visualOnly, ...DC.rules.quoteForString(emailText, emailQuote) },
      };
      if (SIDE_BY_SIDE.has(type)) {
        const email = keyValue(type, emailQuote);
        const doc = keyValue(type, docQuote);
        if (email && doc) issue.compare = { email, doc };
      }
      issues.push(issue);
    }
    return issues;
  }

  // The short value to show in a side-by-side box: "$12,000" rather than
  // "The event budget comes to $12,000 total." Null if there's no short value,
  // in which case the warning shows the explanation sentence instead.
  const MONEY = /\$\s?\d[\d,]*(?:\.\d{1,2})?/;
  const DATE =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:\s*[-‐-―]\s*\d{1,2})?(?:,?\s+\d{4})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/i;

  function keyValue(type, quote) {
    if (!quote) return null;
    const pattern = { amount: MONEY, date: DATE }[type];
    const found = pattern && quote.match(pattern);
    if (found) return found[0].replace(/\s+/g, " ").trim();
    return quote.length <= 24 ? quote : null;
  }

  DC.verify = { toIssues, inText, locate };
})();
