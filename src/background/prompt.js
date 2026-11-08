// What we ask Gemini, and the exact shape we want its answer in.

export const SYSTEM_PROMPT = `You check an outgoing email against its attached document right before it is sent. Your job is to catch mistakes like attaching the wrong file, an outdated version, or a document whose facts contradict the email.

Report a finding only when:
- the email and the document clearly disagree (amounts, dates, names, companies, version such as "final" vs a document marked DRAFT), or
- the document is clearly not what the email says it is (e.g. the email says "budget" but the document is a schedule or an unrelated table), or
- the document is addressed to, or prepared for, a different person or organization than the email's recipients, or
- the email explicitly promises something is in the document (e.g. "includes the timeline") and it is not there.

Do not report:
- things the email simply doesn't mention
- numbers in the document that could reasonably be line items or subtotals
- typos, formatting, tone, or writing advice
- anything you are unsure about. When in doubt, leave it out. A false alarm is worse than a missed problem.

For every finding:
- email_quote: words copied exactly from the email (at most 15 words). Empty only if the problem isn't tied to specific email words.
- document_quote: words copied exactly, character for character, from the document's text (at most 15 words). If the evidence is only visible in a page image (a watermark, stamp, logo, or picture of text), write what you see and set seen_in_image to true. Leave it empty if the problem is that something is missing.
- page: the page number the evidence is on (1 if it's about the whole document).
- severity: "mismatch" for a clear contradiction, "review" for a likely problem worth a second look.
- explanation: one plain sentence a non-technical person understands.

If nothing is wrong, return an empty findings list.

Separately, decide whether the attachment itself is a photo or scan of a sensitive personal document: a passport, driver's license, national ID card, Social Security card, or credit/debit card. Set sensitive_document to that type only when the attachment IS one of these (or mainly shows one), such as a picture of the front of a card or a scanned passport page. Do not set it just because a document mentions an ID number or the last digits of a card. Otherwise set it to "none". Set sensitive_page to the page it appears on. Do this even if the email is empty.`;

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING", description: "One short sentence saying what the attached document is." },
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: ["amount", "date", "name", "version", "wrong_document", "recipient", "missing_content", "other"],
          },
          severity: { type: "STRING", enum: ["mismatch", "review"] },
          title: { type: "STRING" },
          explanation: { type: "STRING" },
          email_quote: { type: "STRING" },
          document_quote: { type: "STRING" },
          seen_in_image: { type: "BOOLEAN" },
          page: { type: "INTEGER" },
        },
        required: ["type", "severity", "title", "explanation", "email_quote", "document_quote", "seen_in_image", "page"],
      },
    },
  },
  required: ["summary", "findings", "sensitive_document", "sensitive_page"],
};
RESPONSE_SCHEMA.properties.sensitive_document = {
  type: "STRING",
  enum: ["none", "passport", "drivers_license", "national_id", "social_security_card", "credit_card", "debit_card"],
};
RESPONSE_SCHEMA.properties.sensitive_page = { type: "INTEGER" };

// The privacy screen: runs on small, blurred thumbnails before any readable
// picture is sent, so an ID or card is recognized without being readable.
export const SCREEN_PROMPT = `You are a privacy screen. You get small, deliberately blurred thumbnails of an email attachment's pages or photos. You will not be able to read text or numbers; judge from layout, shape, and appearance.

Decide whether any thumbnail shows a sensitive personal document: a passport (or passport photo page), a driver's license, a national ID card, a Social Security card, or a credit/debit card. Only say yes when the image mainly shows one of these, such as the front or back of a card or an ID, or a passport page. Ordinary documents, forms, invoices, charts, and photos of people or places are "none".

Set sensitive_page to the page number of the thumbnail it appears on.`;

export const SCREEN_SCHEMA = {
  type: "OBJECT",
  properties: {
    sensitive_document: {
      type: "STRING",
      enum: ["none", "passport", "drivers_license", "national_id", "social_security_card", "credit_card", "debit_card"],
    },
    sensitive_page: { type: "INTEGER" },
  },
  required: ["sensitive_document", "sensitive_page"],
};

const MAX_PAGE_CHARS = 6000;

// Turn the email and document into the message we send.
export function buildParts({ email, file }) {
  const lines = [
    "EMAIL",
    `To: ${email.recipients.join(", ") || "(no recipients yet)"}`,
    `Subject: ${email.subject || "(no subject)"}`,
    "Body:",
    email.body || "(empty)",
    "",
    `ATTACHED ${file.kind === "image" ? "IMAGE" : "DOCUMENT"}: ${file.name}`,
  ];
  if (file.otherAttachments?.length) {
    lines.push(
      `This email has other attachments too: ${file.otherAttachments.join(", ")}. They are checked separately. ` +
        "Parts of the email may describe those files instead of this one. Only check what the email says about THIS file. " +
        "Never report something as missing, or this file as the wrong document, just because the email also mentions another attachment."
    );
  }
  if (file.kind === "image") {
    lines.push("(This attachment is a photo. Read it from the image below.)");
  } else {
    // Long documents: only the retrieved pages are included. Say which, and
    // why, so Gemini doesn't call something "missing" that's on a page it
    // wasn't given.
    if (file.totalPages > file.pages.length) {
      lines.push(
        `The document has ${file.totalPages} pages. Only the pages most relevant to the email are included below ` +
          `(pages ${file.pages.map((p) => p.number).join(", ")}). Do not report content as missing just because ` +
          "it isn't on these pages."
      );
      if (file.retrieved?.length) {
        lines.push("Each email statement and the page retrieved as its best match:");
        for (const r of file.retrieved) lines.push(`- "${r.claim}" → page ${r.page}`);
      }
    }
    for (const page of file.pages) {
      lines.push(`--- Page ${page.number} text ---`, page.text.slice(0, MAX_PAGE_CHARS) || "(no text found on this page)");
    }
  }

  const parts = [{ text: lines.join("\n") }];
  for (const image of file.images) {
    parts.push({ text: `Image of page ${image.page}:` });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: image.data } });
  }
  return parts;
}
