#!/bin/sh
# Builds the GullHacks demo PDFs and images in demo/ from the pages in
# demo/sources/, using Chrome to print and screenshot them. Run from anywhere:
#   sh demo/build-demo-files.sh
set -e

DEMO="$(cd "$(dirname "$0")" && pwd)"
SRC="$DEMO/sources"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

# Chrome in headless mode prints a harmless line or two; hide them.
chrome() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars "$@" 2>/dev/null; }
pdf() { chrome --no-pdf-header-footer --print-to-pdf="$DEMO/$2" "file://$SRC/$1"; echo "made demo/$2"; }
shot() { chrome --window-size="$3" --force-device-scale-factor=2 ${4:+--default-background-color=00000000} --screenshot="$2" "file://$SRC/$1"; }

# The simple PDFs for the built-in checks.
python3 "$DEMO/make_demo_pdfs.py"

# Pictures the PDFs below use.
shot draft-stamp.html "$SRC/draft-stamp.png" 1400,500 transparent
shot scanned-invoice.html "$SRC/scanned-invoice.png" 816,800
for page in photos floorplan prizes budget venue; do
  shot "packet-$page.html" "$SRC/packet-$page.png" 816,1000
done

# PDFs for the Gemini checks.
pdf catering-agreement.html DeMo_Catering_Agreement.pdf
pdf scanned-wrapper.html DeMo_Scanned_Tshirt_Invoice.pdf
pdf sponsor-proposal.html DeMo_Sponsor_Proposal_Delmarva.pdf
pdf weekend-schedule.html DeMo_Weekend_Schedule.pdf
pdf sponsor-packet.html DeMo_Sponsor_Packet.pdf
pdf organizer-handbook.html DeMo_Organizer_Handbook_20pg.pdf

# Photos of sensitive documents.
shot fake-card.html "$DEMO/DeMo_Credit_Card.png" 900,600 && echo "made demo/DeMo_Credit_Card.png"
shot fake-passport.html "$DEMO/DeMo_Passport.png" 1000,680 && echo "made demo/DeMo_Passport.png"
