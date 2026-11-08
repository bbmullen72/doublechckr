// The card that pops up while a PDF is being read: a preview of the page
// with a scanning line sweeping over it, and a checklist of steps.

(() => {
  const DC = globalThis.DC;

  const CARD_WIDTH = 240;
  const PREVIEW_WIDTH = 210;
  // Reading a PDF takes a fraction of a second. A short pause between steps
  // lets people watching the demo follow along. Set to 0 to turn it off.
  const PACE_MS = 350;

  const RESULTS = {
    verified: { title: "Clear to send", mark: "verified" },
    clear: { title: "No issues found", mark: "clear" },
    issues: { title: "Found possible problems", mark: "issues" },
    scanned: { title: "Needs the AI check to read", mark: "warning" },
    error: { title: "Couldn't read this file", mark: "warning" },
  };

  function open(draft, fileName) {
    const card = DC.el("div", "dc-scan dc-checker-edge");
    const mark = DC.mark("checking");
    const title = DC.el("span", null, "doublechckr is reading");
    const header = DC.el("div", "dc-scan-header");
    header.append(mark, title);

    const stage = DC.el("div", "dc-scan-stage");
    stage.append(DC.el("div", "dc-scan-laser"));
    const steps = DC.el("ol", "dc-scan-steps");

    card.append(header, DC.el("div", "dc-scan-file", fileName), stage, steps);
    placeNextTo(card, draft);
    document.body.append(card);

    return {
      PREVIEW_WIDTH,

      setPreview(canvas) {
        canvas.classList.add("dc-scan-page");
        stage.prepend(canvas);
      },

      // Adds a step with a spinner. Call done() or fail() on the result.
      step(label) {
        const item = DC.el("li", "dc-scan-step", label);
        steps.append(item);
        return {
          done(text) {
            item.classList.add("is-done");
            if (text) item.textContent = text;
          },
          fail(text) {
            item.classList.add("is-failed");
            if (text) item.textContent = text;
          },
          skip(text) {
            item.classList.add("is-skipped");
            if (text) item.textContent = text;
          },
        };
      },

      pace: () => DC.wait(PACE_MS),

      // From the vision index: a small bar per page (taller = closer to
      // something the email says), with every page a claim matched
      // highlighted, and a short "claim → page" list under it.
      setRelevance({ claims, pages }) {
        const scores = pages.map((p) => p.score);
        const low = Math.min(...scores);
        const high = Math.max(...scores);
        const matched = new Set(claims.map((c) => c.page));

        const chart = DC.el("div", "dc-scan-relevance");
        const bars = DC.el("div", "dc-scan-bars");
        for (const { page, score } of [...pages].sort((a, b) => a.page - b.page)) {
          const bar = DC.el("span", `dc-scan-bar${matched.has(page) ? " is-best" : ""}`);
          const height = high > low ? 20 + (80 * (score - low)) / (high - low) : 60;
          bar.style.height = `${height}%`;
          bar.title = `Page ${page}: similarity ${score.toFixed(3)}`;
          bars.append(bar);
        }

        const list = DC.el("ul", "dc-scan-claims");
        for (const claim of claims.slice(0, 3)) {
          const row = DC.el("li");
          const short = claim.text.length > 30 ? `${claim.text.slice(0, 29)}…` : claim.text;
          row.append(DC.el("span", "dc-scan-claim", `“${short}”`), DC.el("span", "dc-scan-claim-page", `p.${claim.page}`));
          list.append(row);
        }
        if (claims.length > 3) list.append(DC.el("li", "dc-scan-claim-more", `+${claims.length - 3} more`));

        chart.append(DC.el("div", "dc-scan-relevance-label", "Claim → page match"), bars, list);
        steps.after(chart);
      },

      // Show the result, then slide the card away.
      async finish(result) {
        card.dataset.result = result;
        title.textContent = RESULTS[result].title;
        mark.dataset.state = RESULTS[result].mark;
        await DC.wait(1600);
        card.classList.add("is-leaving");
        setTimeout(() => card.remove(), 300);
      },
    };
  }

  // Put the card just left of the draft window if there's room, otherwise inside it.
  function placeNextTo(card, draft) {
    const box = draft.getBoundingClientRect();
    const roomOnLeft = box.left - CARD_WIDTH - 16 > 16;
    card.style.left = `${roomOnLeft ? box.left - CARD_WIDTH - 16 : Math.max(16, box.left + 16)}px`;
    card.style.top = `${Math.max(16, Math.min(box.top + 16, window.innerHeight - 440))}px`;
    card.style.width = `${CARD_WIDTH}px`;
  }

  DC.scanCard = { open };
})();
