// Vision-based RAG: finds which page of an attachment backs up each claim in
// the email, by comparing embeddings of the page IMAGES with embeddings of
// the email's sentences (Gemini Embedding 2 puts both in the same space).
//
//   1. Index:  draw each page and embed the picture (once per attachment).
//   2. Claims: split the email into sentences that say something checkable.
//   3. Query:  embed every claim (one request; only new claims are sent).
//   4. Match:  cosine similarity between each claim and every page; each
//              claim gets its best page.
//
// The matches decide which pages Gemini's check reads and sees.

(() => {
  const DC = globalThis.DC;

  const INDEX_PAGES = 20; // embed at most this many pages
  const IMAGE_WIDTH = 768; // pixels; also used for the pictures Gemini's check sees
  const MAX_CLAIMS = 6;
  const MIN_CLAIM_WORDS = 4;
  const NOT_A_CLAIM = /^(hi|hello|hey|dear|thanks|thank you|best|cheers|regards|sincerely|sent from)\b/i;

  // One picture per page, drawn once and shared by the index and Gemini's check.
  // Card numbers, SSNs and keys in the page's text are blacked out first, so
  // they never leave your laptop.
  function pageImage(entry, pageNumber) {
    entry.pictures ||= new Map();
    if (!entry.pictures.has(pageNumber)) {
      entry.pictures.set(
        pageNumber,
        DC.files.renderPage(entry.file, pageNumber, IMAGE_WIDTH, 1).then(({ canvas, scale }) => {
          blackOutSecrets(entry, pageNumber, canvas, scale);
          return canvas.toDataURL("image/jpeg", 0.75).split(",")[1];
        })
      );
    }
    return entry.pictures.get(pageNumber);
  }

  // ---- Privacy screen ----
  // Photos and picture-only pages (scans) could be an ID or a card. Before any
  // readable picture of them leaves the laptop, a small, blurred thumbnail is
  // checked first. If it's an ID or card, nothing readable is ever sent.
  const PICTURE_PAGE_CHARS = 200; // below this, a page is mostly picture
  const THUMB_WIDTH = 320; // pixels
  const THUMB_BLUR = 3; // pixels: enough that numbers can't be read

  function picturePages(entry) {
    if (entry.kind === "image") return [1];
    return entry.pages.filter((p) => p.text.length < PICTURE_PAGE_CHARS).map((p) => p.number).slice(0, INDEX_PAGES);
  }

  async function blurredThumbnail(entry, pageNumber) {
    const { canvas } = await DC.files.renderPage(entry.file, pageNumber, THUMB_WIDTH, 1);
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.filter = `blur(${THUMB_BLUR}px)`;
    ctx.drawImage(canvas, 0, 0);
    return out.toDataURL("image/jpeg", 0.7).split(",")[1];
  }

  // Resolves to { pages, sensitive } where sensitive is null or
  // { sensitive_document, sensitive_page }. Runs once per attachment.
  function screen(entry) {
    entry.screen ||= (async () => {
      const pages = picturePages(entry);
      if (!pages.length) return { pages, sensitive: null };
      const started = performance.now();
      const images = await Promise.all(pages.map(async (page) => ({ page, data: await blurredThumbnail(entry, page) })));
      const response = await DC.send({ type: "screen-images", images }).catch(() => null);
      const result = response?.ok ? response.result : null;
      const sensitive = result && result.sensitive_document !== "none" ? result : null;
      DC.log(
        `privacy screen for ${entry.name}: ${DC.plural(pages.length, "blurred thumbnail")}, ` +
          `${sensitive ? `found ${sensitive.sensitive_document} on page ${sensitive.sensitive_page}` : "nothing sensitive"} ` +
          `in ${((performance.now() - started) / 1000).toFixed(2)}s`
      );
      return { pages, sensitive };
    })();
    return entry.screen;
  }

  function blackOutSecrets(entry, pageNumber, canvas, scale) {
    const page = entry.pages?.find((p) => p.number === pageNumber);
    if (!page) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    for (const secret of DC.secrets.find(page.text)) {
      const box = DC.verify.locate(page, secret.raw);
      if (box) ctx.fillRect(box.x * scale - 2, box.y * scale - 2, box.width * scale + 4, box.height * scale + 4);
    }
  }

  // Embed the page pictures. Saved on the entry, so it only happens once.
  // Resolves to { ok: true, pages: [{ page, vector }], seconds } or { ok: false, code }.
  function buildIndex(entry) {
    entry.index ||= (async () => {
      // Readable page pictures are only sent once the privacy screen says no ID or card.
      if ((await screen(entry)).sensitive) return { ok: false, code: "sensitive" };
      const started = performance.now();
      try {
        const pages = entry.pages.slice(0, INDEX_PAGES);
        const images = await Promise.all(pages.map((p) => pageImage(entry, p.number)));
        const response = await DC.send({ type: "embed-pages", images });
        if (!response?.ok) {
          if (response) console.warn("[doublechckr] vision index:", response.error);
          entry.index = null; // let a later attempt try again
          return { ok: false, code: response?.code || "stale" };
        }
        const seconds = (performance.now() - started) / 1000;
        DC.log(`vision index for ${entry.name}: ${DC.plural(pages.length, "page")} in ${seconds.toFixed(2)}s`);
        return { ok: true, seconds, pages: pages.map((p, i) => ({ page: p.number, vector: response.vectors[i] })) };
      } catch (err) {
        console.warn("[doublechckr] vision index:", err);
        return { ok: false, code: "error" };
      }
    })();
    return entry.index;
  }

  // The email's checkable sentences: "The event budget comes to $12,000
  // total." Greetings, sign-offs and very short lines are skipped.
  function claimsFrom(text) {
    const words = (s) => s.split(/\s+/).filter(Boolean).length;
    const sentences = text
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“$])/))
      .map((s) => s.trim())
      .filter((s) => words(s) >= MIN_CLAIM_WORDS && !NOT_A_CLAIM.test(s));
    return [...new Set(sentences)].slice(0, MAX_CLAIMS);
  }

  // Claim embeddings, remembered by text so unchanged claims aren't re-sent.
  const claimVectors = new Map();
  async function embedClaims(claims) {
    const missing = claims.filter((c) => !claimVectors.has(c));
    if (missing.length) {
      const response = await DC.send({ type: "embed-queries", texts: missing }).catch(() => null);
      if (!response?.ok) return null;
      missing.forEach((c, i) => claimVectors.set(c, response.vectors[i]));
      while (claimVectors.size > 100) claimVectors.delete(claimVectors.keys().next().value);
    }
    return claims.map((c) => claimVectors.get(c));
  }

  // Both vectors come back normalized, so cosine similarity is a plain dot product.
  const cosine = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

  // Match each claim to its best page. Returns null if there's nothing to go on,
  // otherwise:
  //   claims: [{ text, page, score }]     each claim's best page
  //   pages:  [{ page, score }]           every page's best score over all claims, best first
  async function matchClaims(entry, emailText) {
    const claims = claimsFrom(emailText);
    if (!claims.length) return null;
    const [index, vectors] = await Promise.all([buildIndex(entry), embedClaims(claims)]);
    if (!index.ok || !vectors) return null;

    const best = new Map(); // page -> best score from any claim
    const matched = claims.map((text, i) => {
      let top = null;
      for (const { page, vector } of index.pages) {
        const score = cosine(vectors[i], vector);
        if (!top || score > top.score) top = { page, score };
        best.set(page, Math.max(best.get(page) ?? -1, score));
      }
      return { text, ...top };
    });

    return {
      claims: matched,
      pages: [...best].map(([page, score]) => ({ page, score })).sort((a, b) => b.score - a.score),
    };
  }

  DC.rag = { pageImage, buildIndex, claimsFrom, matchClaims, screen, picturePages };
})();
