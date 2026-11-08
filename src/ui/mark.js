// The doublechckr mark: a 2×2 checker that also shows status.
//
//   watching  dark checker, breathing gently
//   checking  the two diagonals take turns flipping
//   verified  green checker (the "checkered flag": clear to send)
//   issues    red checker
//   warning   amber checker (couldn't fully check)

(() => {
  const DC = globalThis.DC;

  DC.mark = function mark(state = "watching") {
    const el = DC.el("span", "dc-mark");
    el.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) el.append(DC.el("span", "dc-mark-sq"));
    el.dataset.state = state;
    return el;
  };

  // The mark followed by the name, e.g. in the popup header.
  DC.wordmark = function wordmark(state) {
    const el = DC.el("span", "dc-wordmark");
    el.append(DC.mark(state), DC.el("span", "dc-wordmark-text", "doublechckr"));
    return el;
  };
})();
