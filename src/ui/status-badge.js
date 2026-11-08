// The live badge next to Gmail's Send button: "Checking…", "Verified",
// "2 issues". Also turns the Send button red while there's a problem.

(() => {
  const DC = globalThis.DC;
  const badges = new WeakMap(); // draft -> badge element

  const LOOK = {
    watching: { label: () => "doublechckr", tip: "doublechckr is watching this draft" },
    checking: { label: () => "Checking…", tip: "Reading your attachment" },
    verified: { label: () => "Verified", tip: "doublechckr checked your attachment against your email" },
    clear: {
      label: () => "No issues found",
      tip: "The built-in checks found nothing. The full AI check hasn't run yet (is it set up?)",
    },
    issues: { label: (s) => DC.plural(s.issues.length, "issue"), tip: "Click to see what doesn't match" },
  };

  function ensureBadge(draft) {
    const existing = badges.get(draft);
    if (existing && existing.isConnected) return existing;

    const button = DC.gmail.sendButton(draft);
    if (!button) return null;

    const badge = DC.el("button", "dc-badge");
    badge.type = "button";
    badge.append(DC.mark(), DC.el("span", "dc-badge-label"));
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const status = DC.draftStatus(draft);
      if (status.issues.length) DC.warning.show(draft, status.issues);
    });

    (button.closest("td") || button.parentElement).append(badge);
    badges.set(draft, badge);
    return badge;
  }

  function update(draft) {
    const badge = ensureBadge(draft);
    if (!badge) return;

    const status = DC.draftStatus(draft);
    const look = LOOK[status.kind];
    const label = look.label(status);

    // Only touch the page when something changed, so animations don't restart.
    if (badge.dataset.state !== status.kind || badge.dataset.label !== label) {
      badge.dataset.state = status.kind;
      badge.dataset.label = label;
      badge.querySelector(".dc-mark").dataset.state = status.kind;
      badge.querySelector(".dc-badge-label").textContent = label;
      badge.title = look.tip;
    }
    DC.gmail.sendButton(draft)?.classList.toggle("dc-send-blocked", status.kind === "issues");
  }

  DC.badge = { update };
})();
