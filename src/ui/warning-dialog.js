// The popup shown before sending when something doesn't match. Each problem
// says what's wrong once: either the two values side by side, or a one-line
// explanation. Then a zoomed-in view of the page with a red box around the
// evidence. A single problem is the headline; with several, the first is open
// and the rest are collapsed to one line each.

(() => {
  const DC = globalThis.DC;

  const EVIDENCE_WIDTH = 440; // how wide to draw the PDF page
  const EVIDENCE_HEIGHT = 170; // how much of the page to show around the evidence
  const FIT_MAX_HEIGHT = 300; // tallest the window gets when showing a whole (trimmed) page

  function show(draft, issues) {
    document.querySelector(".dc-overlay")?.remove();

    const overlay = DC.el("div", "dc-overlay");
    const box = DC.el("div", "dc-box dc-checker-edge");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const brand = DC.el("div", "dc-brand");
    brand.append(DC.wordmark("issues"));
    box.append(brand);

    if (issues.length === 1) {
      // One problem: its title is the headline, with nothing repeated above it.
      const [issue] = issues;
      const title = DC.el("h2", "dc-title dc-title-single");
      title.append(issue.title, ...tags(issue));
      box.append(title, renderBody(issue));
    } else {
      box.append(DC.el("h2", "dc-title", DC.plural(issues.length, "possible problem")));
      const list = DC.el("ol", "dc-list");
      issues.forEach((issue, i) => list.append(renderIssue(issue, i === 0)));
      box.append(list);
    }

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

  function renderIssue(issue, open) {
    const item = DC.el("li", "dc-item");
    const details = DC.el("details", "dc-item-details");
    details.open = open;

    const heading = DC.el("summary", "dc-item-heading");
    heading.append(DC.el("strong", "dc-item-title", issue.title), ...tags(issue));
    details.append(heading, renderBody(issue));
    item.append(details);
    return item;
  }

  // Small labels after a problem's title.
  function tags(issue) {
    const list = [];
    if (issue.type === "sensitive" || issue.type === "secret") list.push(DC.el("span", "dc-security-tag", "Security"));
    return list;
  }

  // What's wrong, said once: the two values side by side, or one sentence.
  // Then the page with the red box.
  function renderBody(issue) {
    const body = DC.el("div", "dc-item-body");
    const ev = issue.evidence;
    if (issue.compare) {
      const compare = DC.el("div", "dc-compare");
      compare.append(
        compareCell("Your email", issue.compare.email, false),
        compareCell(ev?.file.name || "Attached file", issue.compare.doc, true)
      );
      body.append(compare);
    } else {
      body.append(DC.el("p", "dc-item-detail", issue.detail));
    }
    if (ev?.page) body.append(renderEvidence(ev));
    return body;
  }

  function compareCell(label, value, isDoc) {
    const cell = DC.el("div", `dc-compare-cell${isDoc ? " is-doc" : ""}`);
    cell.append(DC.el("div", "dc-compare-label", label), DC.el("div", "dc-compare-value", value));
    return cell;
  }

  // A window onto the PDF page, scrolled so the red box is in the middle.
  function renderEvidence(ev) {
    const wrap = DC.el("div", "dc-evidence");
    const view = DC.el("div", "dc-evidence-window");
    view.style.height = `${EVIDENCE_HEIGHT}px`;
    view.append(DC.el("div", "dc-evidence-loading", "Loading page…"));
    const where = ev.file.kind === "image" ? ev.file.name : `${ev.file.name} · Page ${ev.page.number}`;
    const caption = `${where}${ev.visualOnly && ev.file.kind !== "image" ? " · seen in the page image" : ""}`;
    wrap.append(view, DC.el("div", "dc-evidence-caption", caption));

    DC.files
      .renderPage(ev.file.file, ev.page.number, EVIDENCE_WIDTH)
      .then(({ canvas, scale }) => {
        // No exact spot (read from a picture, or "wrong document"): show the
        // whole page, trimmed and fitted, so the evidence is always visible.
        if (!ev.word) {
          const fitted = fitContent(canvas);
          view.style.height = `${fitted.height}px`;
          view.classList.add("is-fitted");
          view.replaceChildren(fitted.canvas);
          return;
        }

        const pageEl = DC.el("div", "dc-evidence-page");
        pageEl.append(canvas);
        const pad = 4;
        const boxTop = ev.word.y * scale - pad;
        const boxHeight = ev.word.height * scale + pad * 2;
        const pageHeight = ev.page.height * scale;
        const offset = clamp(boxTop + boxHeight / 2 - EVIDENCE_HEIGHT / 2, 0, Math.max(0, pageHeight - EVIDENCE_HEIGHT));
        pageEl.style.top = `${-offset}px`;

        const highlight = DC.el("div", "dc-evidence-box");
        Object.assign(highlight.style, {
          left: `${ev.word.x * scale - pad}px`,
          top: `${boxTop}px`,
          width: `${ev.word.width * scale + pad * 2}px`,
          height: `${boxHeight}px`,
        });
        pageEl.append(highlight);
        view.replaceChildren(pageEl);
      })
      .catch(() => view.replaceChildren(DC.el("div", "dc-evidence-loading", "Couldn't show the page")));

    return wrap;
  }

  // Trim the empty margins off a drawn page (anything matching the color in
  // its top-left corner), then scale what's left to fit the evidence window.
  // Returns { canvas, height } with height in screen pixels.
  function fitContent(page) {
    const { width, height } = page;
    const pixels = page.getContext("2d").getImageData(0, 0, width, height).data;
    const bg = pixels.slice(0, 3);
    const STEP = 2; // check every other pixel; plenty for finding edges
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y += STEP) {
      for (let x = 0; x < width; x += STEP) {
        const i = (y * width + x) * 4;
        const differs =
          Math.abs(pixels[i] - bg[0]) > 24 || Math.abs(pixels[i + 1] - bg[1]) > 24 || Math.abs(pixels[i + 2] - bg[2]) > 24;
        if (!differs) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < 0) [left, top, right, bottom] = [0, 0, width - 1, height - 1]; // blank page: keep it all

    const margin = Math.round(width * 0.02);
    left = Math.max(0, left - margin);
    top = Math.max(0, top - margin);
    right = Math.min(width - 1, right + margin);
    bottom = Math.min(height - 1, bottom + margin);
    const cropW = right - left + 1;
    const cropH = bottom - top + 1;

    // Fit inside the window: full width if possible, never taller than FIT_MAX_HEIGHT.
    const sharpness = page.width / parseFloat(page.style.width);
    const shownScale = Math.min(EVIDENCE_WIDTH / (cropW / sharpness), FIT_MAX_HEIGHT / (cropH / sharpness));
    const shownW = Math.round((cropW / sharpness) * shownScale);
    const shownH = Math.round((cropH / sharpness) * shownScale);

    const out = document.createElement("canvas");
    out.width = Math.round(shownW * sharpness);
    out.height = Math.round(shownH * sharpness);
    out.style.width = `${shownW}px`;
    out.style.height = `${shownH}px`;
    out.getContext("2d").drawImage(page, left, top, cropW, cropH, 0, 0, out.width, out.height);
    return { canvas: out, height: shownH };
  }

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  DC.warning = { show };
})();
