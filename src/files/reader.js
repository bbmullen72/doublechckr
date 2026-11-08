// One way to read any attachment we check, whether it's a PDF or a photo.

(() => {
  const DC = globalThis.DC;

  const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;
  const IMAGE_NAMES = /\.(png|jpe?g|webp|gif)$/i;

  // "pdf", "image", or null if we don't check this kind of file.
  function kindOf(file) {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
    if (IMAGE_TYPES.test(file.type) || IMAGE_NAMES.test(file.name)) return "image";
    return null;
  }

  const readerFor = (file) => (kindOf(file) === "image" ? DC.image : DC.pdf);

  DC.files = {
    kindOf,
    readText: (file) => readerFor(file).readText(file),
    renderPage: (file, pageNumber, width, sharpness) => readerFor(file).renderPage(file, pageNumber, width, sharpness),
  };
})();
