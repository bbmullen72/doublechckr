// Finds things that should never be sent by email: card numbers, Social
// Security numbers, and API keys or private keys. Runs on your laptop, no AI.
//
// Each find comes back as { kind, label, masked, raw, index }:
//   label   what it is, e.g. "a credit card number"
//   masked  a safe way to show it, e.g. "card ending in 1111"
//   raw     the exact text found (never shown in the warning)

(() => {
  const DC = globalThis.DC;

  const KEY_PATTERNS = [
    { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    { name: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
    { name: "OpenAI API key", pattern: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}/g },
    { name: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/g },
    { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
    { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
    { name: "Stripe secret key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/g },
    { name: "private key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  ];

  // 13–19 digits, optionally grouped with spaces or dashes.
  const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
  // 123-45-6789, skipping numbers the SSA never issues.
  const SSN = /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;

  // Real card numbers pass the Luhn checksum; random long numbers almost never do.
  function passesLuhn(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return sum % 10 === 0;
  }

  function find(text) {
    if (!text) return [];
    const found = [];

    for (const m of text.matchAll(CARD)) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19 || !passesLuhn(digits) || /^(\d)\1+$/.test(digits)) continue;
      // Skip chunks of a longer number (e.g. a 22-digit tracking number).
      const before = text.slice(Math.max(0, m.index - 2), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
      if (/\d[ -]?$/.test(before) || /^[ -]?\d/.test(after)) continue;
      found.push({ kind: "card", label: "a credit card number", masked: `card ending in ${digits.slice(-4)}`, raw: m[0], index: m.index });
    }
    for (const m of text.matchAll(SSN)) {
      found.push({ kind: "ssn", label: "a Social Security number", masked: `•••-••-${m[0].slice(-4)}`, raw: m[0], index: m.index });
    }
    for (const { name, pattern } of KEY_PATTERNS) {
      for (const m of text.matchAll(pattern)) {
        const masked = name === "private key" ? "a private key" : `${name} ${m[0].slice(0, 4)}••••`;
        found.push({ kind: "key", label: `a ${name}`, masked, raw: m[0], index: m.index });
      }
    }
    return found;
  }

  const PLACEHOLDER = { card: "[card number hidden]", ssn: "[SSN hidden]", key: "[secret key hidden]" };

  // The same text with every secret replaced by a placeholder. Used before
  // anything is sent to Gemini.
  function mask(text) {
    let out = text || "";
    for (const s of find(out).sort((a, b) => b.index - a.index)) {
      out = out.slice(0, s.index) + PLACEHOLDER[s.kind] + out.slice(s.index + s.raw.length);
    }
    return out;
  }

  DC.secrets = { find, mask };
})();
