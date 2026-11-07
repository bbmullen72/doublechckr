# doublechckr

double checking emails for u

A Chrome extension that checks your Gmail attachments before you hit Send.

## Try it

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.
4. Open (or reload) Gmail.

After you change the code, click the reload icon on the doublechckr card in `chrome://extensions`, then reload Gmail.

## What it does so far

- **Live badge** next to Send: "doublechckr" (watching), "Checking…", "Verified", or "2 issues". The Send button turns red while there's a problem.
- **Scanning card** when you attach a PDF: a preview of the page with a scanning line and a checklist of steps.
- **Warning before sending** that shows the evidence: both values side by side, the sentence from your email, and the PDF page with a red box around the problem.
- Built-in checks:
  - email mentions an attachment, but nothing is attached
  - email says "final", but the PDF is marked DRAFT
  - email amount doesn't match the PDF's total or budget

## Demo files

`demo/` has fake PDFs to test with. To remake them: `python3 demo/make_demo_pdfs.py`

| File | Try an email that says… | Expected |
| --- | --- | --- |
| `Project_Proposal.pdf` | "Attached is the final proposal. The total budget is $25,000." | 2 issues |
| `Project_Proposal.pdf` | "Attached is the proposal. The budget is $18,500." | Verified |
| `Invoice_Final.pdf` | "Attached is the invoice for $2,400." | Verified |
| `Invoice_Final.pdf` | "Attached is the invoice for $2,800." | 1 issue |

## Code layout

Chrome loads the files in the order listed in `manifest.json`. They share one object, `DC`, that each file adds its piece to.

| Folder | What's in it |
| --- | --- |
| `src/core/` | Shared helpers, everything Gmail-specific (`gmail.js`), and per-draft state |
| `src/pdf/` | Reading PDF text and drawing pages |
| `src/checks/` | The checks (`rules.js`) and the overall status of a draft |
| `src/capture/` | Grabbing files when they're attached |
| `src/send/` | Stopping Send when there's a problem |
| `src/ui/` | The badge, scanning card, warning popup, and small messages |
| `src/styles/` | One stylesheet per piece of UI, plus shared colors (`theme.css`) |
| `src/main.js` | Starts everything |
| `vendor/pdfjs/` | PDF.js 3.11.174, Mozilla's free PDF library |
