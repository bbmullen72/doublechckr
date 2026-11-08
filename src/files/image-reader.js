// Reads photo attachments (JPG, PNG, WebP, GIF). Images have no text layer,
// so they come back as a single page with no text; Gemini reads the picture.

(() => {
  const DC = globalThis.DC;
  const bitmaps = new WeakMap(); // File -> decoded image, so we only decode once

  function open(file) {
    if (!bitmaps.has(file)) bitmaps.set(file, createImageBitmap(file));
    return bitmaps.get(file);
  }

  async function readText(file) {
    const image = await open(file);
    return [{ number: 1, text: "", words: [], width: image.width, height: image.height }];
  }

  // Same shape as the PDF reader's renderPage.
  async function renderPage(file, _pageNumber, width, sharpness = window.devicePixelRatio || 1) {
    const image = await open(file);
    const scale = width / image.width;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * sharpness);
    canvas.height = Math.round(image.height * scale * sharpness);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${image.height * scale}px`;
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, scale };
  }

  DC.image = { readText, renderPage };
})();
