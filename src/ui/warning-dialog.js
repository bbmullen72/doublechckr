// The popup shown before sending when something doesn't match. For each
// problem it shows the two values side by side, the sentence from the email,
// and a zoomed-in view of the PDF page with a red box around the evidence.

(() => {
  const DC = globalThis.DC;

  const EVIDENCE_WIDTH = 440; // how wide to draw the PDF page
  const EVIDENCE_HEIGHT = 170; // how much of the page to show around the evidence

  function show(draft, issues) {
    document.querySelector(".dc-overlay")?.remove();

    const overlay = DC.el("div", "dc-overlay");
    const box = DC.el("div", "dc-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.append(
      DC.el("div", "dc-brand", "doublechckr"),
      DC.el("h2", "dc-title", DC.plural(issues.length, "possible problem")),
      DC.el("p", "dc-subtitle", "Your attachment may not match your email.")
    );

    const list = DC.el("ol", "dc-list");
    issues.forEach((issue) => list.append(renderIssue(issue)));
    box.append(list);

    const close = () => overlay.remove();
    const review = DC.el("button", "dc-btn dc-btn-primary", "Review email");
    const send = DC.el("button", "dc-btn", "Send anyway");
    review.addEventListener("click", () => {
      close();
      DC.gmail.messageBody(draft)?.focus();
    });
    send.addEventListener("click", () => {
      close();
      DC.sendGuard.sendAnyway(draft);
    });
    overlay.addEventListener("click", (e) => e.target === overlay && close());
    overlay.addEventListener("keydown", (e) => e.key === "Escape" && close());

    const actions = DC.el("div", "dc-actions");
    actions.append(send, review);
    box.append(actions);
    overlay.append(box);
    document.body.append(overlay);
    review.focus();
  }

  function renderIssue(issue) {
    const item = DC.el("li", "dc-item");
    item.append(DC.el("strong", "dc-item-title", issue.title));

    if (issue.compare) {
      const compare = DC.el("div", "dc-compare");
      compare.append(
        compareCell("Your email", issue.compare.email, false),
        compareCell(issue.evidence?.file.name || "Attached PDF", issue.compare.doc, true)
      );
      item.append(compare);
    } else {
      item.append(DC.el("p", "dc-item-detail", issue.detail));
    }

    const ev = issue.evidence;
    if (ev?.emailQuote) item.append(renderQuote(ev.emailQuote, ev.emailMatch));
    if (ev?.page) item.append(renderEvidence(ev));
    return item;
  }

  function compareCell(label, value, isDoc) {
    const cell = DC.el("div", `dc-compare-cell${isDoc ? " is-doc" : ""}`);
    cell.append(DC.el("div", "dc-compare-label", label), DC.el("div", "dc-compare-value", value));
    return cell;
  }

  // The email sentence, with the matching words highlighted.
  function renderQuote(quote, match) {
    const block = DC.el("blockquote", "dc-quote");
    const at = match ? quote.indexOf(match) : -1;
    if (at < 0) {
      block.textContent = `“${quote}”`;
    } else {
      block.append(`“${quote.slice(0, at)}`, DC.el("mark", null, match), `${quote.slice(at + match.length)}”`);
    }
    return block;
  }

  // A window onto the PDF page, scrolled so the red box is in the middle.
  function renderEvidence(ev) {
    const wrap = DC.el("div", "dc-evidence");
    const view = DC.el("div", "dc-evidence-window");
    view.style.height = `${EVIDENCE_HEIGHT}px`;
    view.append(DC.el("div", "dc-evidence-loading", "Loading page…"));
    wrap.append(view, DC.el("div", "dc-evidence-caption", `${ev.file.name} · Page ${ev.page.number}`));

    DC.pdf
      .renderPage(ev.file.file, ev.page.number, EVIDENCE_WIDTH)
      .then(({ canvas, scale }) => {
        const pad = 4;
        const boxTop = ev.word.y * scale - pad;
        const boxHeight = ev.word.height * scale + pad * 2;
        const pageHeight = ev.page.height * scale;
        const offset = clamp(boxTop + boxHeight / 2 - EVIDENCE_HEIGHT / 2, 0, Math.max(0, pageHeight - EVIDENCE_HEIGHT));

        const pageEl = DC.el("div", "dc-evidence-page");
        pageEl.style.top = `${-offset}px`;
        const highlight = DC.el("div", "dc-evidence-box");
        Object.assign(highlight.style, {
          left: `${ev.word.x * scale - pad}px`,
          top: `${boxTop}px`,
          width: `${ev.word.width * scale + pad * 2}px`,
          height: `${boxHeight}px`,
        });
        pageEl.append(canvas, highlight);
        view.replaceChildren(pageEl);
      })
      .catch(() => view.replaceChildren(DC.el("div", "dc-evidence-loading", "Couldn't show the page")));

    return wrap;
  }

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  DC.warning = { show };
})();
