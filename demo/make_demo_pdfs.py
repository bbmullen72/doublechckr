"""Makes fake PDFs for testing and demoing doublechckr.

Run:  python3 demo/make_demo_pdfs.py
No extra installs needed.
"""

from pathlib import Path

HERE = Path(__file__).parent


def make_pdf(path, lines):
    """lines: list of (font_size, text). Writes a one-page PDF."""
    y, parts = 720, []
    for size, text in lines:
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        parts.append(f"BT /F1 {size} Tf 72 {y} Td ({safe}) Tj ET")
        y -= size + 14
    stream = "\n".join(parts).encode("latin-1")

    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length %d>>stream\n" % len(stream) + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (len(objects) + 1, xref)
    path.write_bytes(out)
    print("made", path.relative_to(HERE.parent))


make_pdf(HERE / "Project_Proposal.pdf", [
    (22, "PROJECT PROPOSAL"),
    (14, "Status: DRAFT"),
    (12, "Client: Acme Corporation"),
    (12, "Prepared by: Northwind Design Studio"),
    (12, ""),
    (12, "Scope: website redesign and brand refresh."),
    (12, "Implementation Deadline: June 20"),
    (14, "Total Budget: $18,500"),
])

make_pdf(HERE / "Invoice_Final.pdf", [
    (22, "INVOICE #1042"),
    (12, "Billed to: Acme Corporation"),
    (12, "Date: October 3"),
    (12, ""),
    (12, "Design work .......... $2,000"),
    (12, "Hosting setup ........ $400"),
    (14, "Total Due: $2,400"),
])
