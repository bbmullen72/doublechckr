"""Makes the simple GullHacks demo PDFs for testing doublechckr's built-in checks.

Run:  python3 demo/make_demo_pdfs.py
No extra installs needed. Everything in these files is made up.
"""

from pathlib import Path

HERE = Path(__file__).parent

# Salisbury University maroon and gold, as PDF color values (0 to 1).
MAROON = "0.478 0.059 0.114"
GOLD = "0.949 0.710 0.141"


def make_pdf(path, lines):
    """lines: list of (font_size, text). Writes a one-page PDF with a maroon and gold band."""
    parts = [
        f"{MAROON} rg 0 774 612 18 re f",  # maroon band across the top
        f"{GOLD} rg 0 768 612 6 re f",  # gold stripe under it
        "0 0 0 rg",
    ]
    y = 720
    for size, text in lines:
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        parts.append(f"BT /F1 {size} Tf 72 {y} Td ({safe}) Tj ET")
        y -= size + 14
    parts.append("BT /F1 8 Tf 72 40 Td (Demo document for doublechckr - Not an official Salisbury University document) Tj ET")
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


make_pdf(HERE / "DeMo_Sponsorship_Proposal.pdf", [
    (22, "GULLHACKS SPONSORSHIP PROPOSAL"),
    (14, "Status: DRAFT"),
    (12, "Prepared for: Chesapeake Software"),
    (12, "Prepared by: GullHacks Organizing Team, Salisbury University"),
    (12, ""),
    (12, "Gold tier: logo on t-shirts, judging seat, recruiting table."),
    (12, "Event date: November 14"),
    (14, "Total Budget: $18,500"),
])

make_pdf(HERE / "DeMo_Hotel_Booking.pdf", [
    (22, "HOTEL BOOKING FORM"),
    (12, "Event: GullHacks 2026 keynote speaker"),
    (12, "Guest: Sammy Seagull"),
    (12, "Check-in: November 13    Check-out: November 16"),
    (12, "Room: King, non-smoking (3 nights)"),
    (12, ""),
    (14, "Payment card on file: 4111 1111 1111 1111"),
    (12, "Expires: 12/29    Name on card: Sammy Seagull"),
    (12, "(Test card number - cannot be charged)"),
])

make_pdf(HERE / "DeMo_Pizza_Invoice.pdf", [
    (22, "INVOICE #1042"),
    (12, "From: Shore Line Pizza Co., Salisbury, Maryland"),
    (12, "Billed to: GullHacks Organizing Team"),
    (12, "Date: November 15"),
    (12, ""),
    (12, "Pizzas for the midnight snack (120) ...... $2,000"),
    (12, "Delivery to campus ........................ $400"),
    (14, "Total Due: $2,400"),
])
