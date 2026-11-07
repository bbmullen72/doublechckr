// Grabs files the moment they're attached (paperclip or drag and drop),
// reads PDFs, and plays the scanning card while it works.

(() => {
  const DC = globalThis.DC;

  // Paperclip button: Gmail opens a file picker, then fires "change" on it.
  window.addEventListener(
    "change",
    (e) => {
      const input = e.target;
      if (input instanceof HTMLInputElement && input.type === "file") {
        capture(input.files, DC.drafts.lastActive);
      }
    },
    true
  );

  // Drag and drop onto a draft.
  window.addEventListener(
    "drop",
    (e) => {
      const files = e.dataTransfer?.files;
      if (files?.length) capture(files, DC.gmail.findDraft(e.target) || DC.drafts.lastActive);
    },
    true
  );

  function capture(fileList, draft) {
    if (!draft || !fileList) return;
    const state = DC.drafts.get(draft);

    for (const file of Array.from(fileList)) {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const entry = { file, name: file.name, isPdf, pages: null, error: null, seenInDraft: false };
      state.files.push(entry);

      if (isPdf) readWithAnimation(entry, draft);
      else DC.toast(`doublechckr saw ${file.name} (only PDFs are checked for now)`);
    }
    DC.badge.update(draft);
  }

  async function readWithAnimation(entry, draft) {
    const state = DC.drafts.get(draft);
    state.pending++;
    DC.badge.update(draft);
    const card = DC.scanCard.open(draft, entry.name);

    try {
      const preview = card.step("Rendering page 1");
      try {
        const { canvas } = await DC.pdf.renderPage(entry.file, 1, card.PREVIEW_WIDTH);
        card.setPreview(canvas);
        preview.done("Rendered page 1");
      } catch {
        preview.fail("Couldn't draw a preview");
      }
      await card.pace();

      const reading = card.step("Reading text");
      entry.pages = await DC.pdf.readText(entry.file);
      const chars = entry.pages.reduce((sum, p) => sum + p.text.length, 0);
      // Very little text per page usually means a scanned document (a photo
      // of paper). Those need the vision step, which comes later.
      entry.looksScanned = chars < 50 * entry.pages.length;
      reading.done(`Read ${DC.plural(entry.pages.length, "page")}`);
      logPages(entry, chars);
      await card.pace();

      const layout = card.step("Mapping layout");
      const blocks = entry.pages.reduce((sum, p) => sum + p.words.length, 0);
      layout.done(`Mapped ${DC.plural(blocks, "text block")}`);
      await card.pace();

      const comparing = card.step("Comparing with your email");
      await card.pace();
      const issues = DC.checkDraft(draft);
      comparing.done(issues.length ? DC.plural(issues.length, "possible problem") : "Everything matches");

      card.finish(entry.looksScanned ? "scanned" : issues.length ? "issues" : "verified");
    } catch (err) {
      entry.error = String(err);
      console.warn("[doublechckr] couldn't read", entry.name, err);
      card.finish("error");
    } finally {
      state.pending--;
      DC.badge.update(draft);
    }
  }

  function logPages(entry, chars) {
    console.groupCollapsed(`[doublechckr] read ${entry.name}: ${entry.pages.length} pages, ${chars} characters`);
    for (const page of entry.pages) console.log(`--- page ${page.number} ---\n${page.text}`);
    console.log("full result:", entry.pages);
    console.groupEnd();
  }

  // Forget files the user removed from the draft. A file counts as removed
  // once its name has shown up in the draft and then disappears.
  function forgetRemoved(draft) {
    const state = DC.drafts.get(draft);
    const text = draft.textContent;
    state.files = state.files.filter((f) => {
      const present = text.includes(f.name);
      if (present) f.seenInDraft = true;
      return present || !f.seenInDraft;
    });
  }

  DC.attachments = { forgetRemoved };
})();
