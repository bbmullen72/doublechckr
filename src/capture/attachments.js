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
      const kind = DC.files.kindOf(file);
      const entry = { file, name: file.name, kind, pages: null, error: null, seenInDraft: false, capturedAt: Date.now() };
      state.files.push(entry);

      if (kind) readWithAnimation(entry, draft);
      else DC.toast(`doublechckr saw ${file.name} (only PDFs and photos are checked)`);
    }
    // Files that were already attached get rechecked, now knowing about the new ones.
    DC.ai.recheck(draft);
    DC.badge.update(draft);
  }

  async function readWithAnimation(entry, draft) {
    const state = DC.drafts.get(draft);
    const isImage = entry.kind === "image";
    state.pending++;
    DC.badge.update(draft);
    const card = DC.scanCard.open(draft, entry.name);

    try {
      // Read the text first (it's quick), then start Gemini right away so it
      // works while the card plays its steps, instead of after them.
      entry.pages = await DC.files.readText(entry.file);
      const chars = entry.pages.reduce((sum, p) => sum + p.text.length, 0);
      // Very little text per page usually means a scanned document (a photo
      // of paper). Only Gemini's vision can read those.
      entry.looksScanned = chars < 50 * entry.pages.length;
      const multiPage = entry.pages.length > 1;
      const screened = DC.rag.picturePages(entry).length > 0;
      const screening = DC.rag.screen(entry); // the blurred privacy check runs before anything readable is sent
      if (multiPage) DC.rag.buildIndex(entry); // start embedding the pages now; we'll show it below
      const geminiDone = DC.ai.analyze(draft, entry);

      const preview = card.step(isImage ? "Loading image" : "Rendering page 1");
      try {
        const { canvas } = await DC.files.renderPage(entry.file, 1, card.PREVIEW_WIDTH);
        card.setPreview(canvas);
        preview.done(isImage ? "Loaded image" : "Rendered page 1");
      } catch {
        preview.fail("Couldn't draw a preview");
      }
      await card.pace();

      if (!isImage) {
        const reading = card.step("Reading text");
        reading.done(`Read ${DC.plural(entry.pages.length, "page")}`);
        logPages(entry, chars);
        await card.pace();

        const layout = card.step("Mapping layout");
        const blocks = entry.pages.reduce((sum, p) => sum + p.words.length, 0);
        layout.done(`Mapped ${DC.plural(blocks, "text block")}`);
        await card.pace();
      }

      let stopped = false;
      if (screened) {
        const privacy = card.step("Privacy check on a blurred preview");
        const { sensitive } = await screening;
        stopped = !!sensitive;
        if (sensitive) privacy.done("Looks like an ID or card: stopped before sending");
        else privacy.done("No ID or card found");
        await card.pace();
      }

      if (multiPage && !stopped) await showVisionIndex(card, entry, draft);

      const asking = card.step(isImage ? "Analyzing image…" : "Analyzing pages against your email…");
      const ai = await geminiDone;
      if (ai.status === "done") {
        const time = ` · ${ai.seconds.toFixed(1)}s`;
        asking.done(
          (ai.issues.length ? `doublechckr flagged ${DC.plural(ai.issues.length, "problem")}` : "doublechckr: looks consistent") + time
        );
      } else if (ai.status === "off") {
        asking.skip("AI check isn't set up");
      } else {
        asking.fail("Couldn't finish the check");
      }

      const issues = DC.checkDraft(draft);
      card.finish(
        issues.length ? "issues" : ai.status === "done" ? "verified" : entry.looksScanned ? "scanned" : "clear"
      );
    } catch (err) {
      entry.error = String(err);
      console.warn("[doublechckr] couldn't read", entry.name, err);
      card.finish("error");
    } finally {
      state.pending--;
      DC.badge.update(draft);
    }
  }

  // The vision-RAG steps: embed the page images, then rank them against the email.
  async function showVisionIndex(card, entry, draft) {
    const indexing = card.step("Vision index: embedding page images");
    const index = await DC.rag.buildIndex(entry);
    if (!index.ok) {
      indexing.skip(index.code === "no-key" ? "Vision index isn't set up" : "Vision index unavailable");
      await card.pace();
      return;
    }
    indexing.done(`Indexed ${DC.plural(index.pages.length, "page")} as images · ${index.seconds.toFixed(1)}s`);
    await card.pace();

    const matching = card.step("Matching your email's claims to pages");
    const matches = await DC.rag.matchClaims(entry, DC.ai.readEmail(draft).text);
    if (matches) {
      matching.done(`Matched ${DC.plural(matches.claims.length, "claim")} to pages`);
      card.setRelevance(matches);
    } else {
      matching.skip("Write a bit more to match pages");
    }
    await card.pace();
  }

  function logPages(entry, chars) {
    console.groupCollapsed(`[doublechckr] read ${entry.name}: ${entry.pages.length} pages, ${chars} characters`);
    for (const page of entry.pages) console.log(`--- page ${page.number} ---\n${page.text}`);
    console.log("full result:", entry.pages);
    console.groupEnd();
  }

  // Forget files that aren't in the draft anymore. Gmail shows each
  // attachment's name in the draft, so a file counts as gone if its name
  // disappears, or never shows up within a few seconds of being picked
  // (e.g. the upload was cancelled).
  const GRACE_MS = 5000;

  function forgetRemoved(draft) {
    const state = DC.drafts.get(draft);
    const text = draft.textContent;
    const before = state.files.length;
    state.files = state.files.filter((f) => {
      if (text.includes(f.name)) {
        f.seenInDraft = true;
        return true;
      }
      return !f.seenInDraft && Date.now() - f.capturedAt < GRACE_MS;
    });
    if (state.files.length !== before) {
      DC.log("forgot removed attachments; now tracking", state.files.map((f) => f.name));
      if (!DC.isStale()) DC.ai.recheck(draft); // the remaining files no longer share the email with it
    }
  }

  DC.attachments = { forgetRemoved };
})();
