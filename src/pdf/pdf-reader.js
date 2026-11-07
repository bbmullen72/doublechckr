// Reads PDFs with PDF.js: pulls out the text (with where each piece sits on
// the page) and draws pages as images.

(() => {
  const DC = globalThis.DC;
  const MAX_PAGES = 20;
  const openDocs = new WeakMap(); // File -> the opened PDF, so we only open it once

  function open(file) {
    if (!openDocs.has(file)) {
      const loading = file.arrayBuffer().then(
        (buffer) =>
          // isEvalSupported: false closes a known security hole in this PDF.js version.
          pdfjsLib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise
      );
      openDocs.set(file, loading);
    }
    return openDocs.get(file);
  }

  async function readText(file) {
    const pdf = await open(file);
    const pages = [];

    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
      const page = await pdf.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const text = content.items
        .map((item) => item.str + (item.hasEOL ? "\n" : " "))
        .join("")
        .replace(/[ \t]+/g, " ")
        .trim();

      // PDF positions count up from the bottom of the page; flip them so
      // y counts down from the top like on screen.
      const words = content.items
        .filter((item) => item.str.trim())
        .map((item) => {
          const [, , c, d, x, y] = item.transform;
          const h = item.height || Math.hypot(c, d);
          return { text: item.str, x, y: height - y - h, width: item.width, height: h };
        });

      pages.push({ number: n, text, words, width, height });
    }
    return pages;
  }

  // Draw one page onto a canvas `width` pixels wide. `scale` converts PDF
  // positions into pixels on that canvas.
  async function renderPage(file, pageNumber, width) {
    const pdf = await open(file);
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const sharpness = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * sharpness });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${base.height * scale}px`;

    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return { canvas, scale };
  }

  DC.pdf = { readText, renderPage };
})();
