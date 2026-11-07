// The card that pops up while a PDF is being read: a preview of the page
// with a scanning line sweeping over it, and a checklist of steps.

(() => {
  const DC = globalThis.DC;

  const CARD_WIDTH = 240;
  const PREVIEW_WIDTH = 210;
  // Reading a PDF takes a fraction of a second. A short pause between steps
  // lets people watching the demo follow along. Set to 0 to turn it off.
  const PACE_MS = 350;

  const RESULT_TITLES = {
    verified: "Looks good",
    issues: "Found possible problems",
    scanned: "Looks scanned",
    error: "Couldn't read this file",
  };

  function open(draft, fileName) {
    const card = DC.el("div", "dc-scan");
    const title = DC.el("span", null, "doublechckr is reading");
    const header = DC.el("div", "dc-scan-header");
    header.append(DC.el("span", "dc-scan-pulse"), title);

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
        };
      },

      pace: () => DC.wait(PACE_MS),

      // Show the result, then slide the card away.
      async finish(result) {
        card.dataset.result = result;
        title.textContent = RESULT_TITLES[result];
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
