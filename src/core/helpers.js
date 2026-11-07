// Small helpers shared by every file.
//
// How the files talk to each other: Chrome loads each file listed in
// manifest.json in order, and they all share one object, DC. Each file adds
// its piece to DC (DC.pdf, DC.badge, ...) so later files can use it.

(() => {
  const DC = (globalThis.DC = globalThis.DC || {});

  // Create an element with an optional class and text.
  DC.el = function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  DC.plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

  DC.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  DC.log = (...args) => console.log("[doublechckr]", ...args);
})();
