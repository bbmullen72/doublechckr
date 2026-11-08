// A small message in the bottom-left corner that disappears after a few seconds.

(() => {
  const DC = globalThis.DC;

  DC.toast = function toast(message) {
    const t = DC.el("div", "dc-toast");
    t.append(DC.mark(), DC.el("span", null, message));
    document.body.append(t);
    setTimeout(() => t.remove(), 4000);
  };
})();
