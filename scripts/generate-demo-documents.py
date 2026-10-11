"""Rebuild five deliberately fictional, text-only bill-analysis PDF fixtures."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "pdf"
OUTPUT.mkdir(parents=True, exist_ok=True)

SHEETS = [
    ("synthetic-original-estimate.pdf", "Original specialist estimate", "DOC-ORIGINAL", [
        "Practice: Demo Harbour Eye Practice (fictional)",
        "Document date: 08/10/2026", "Proposed service date: 20/10/2026",
        "Procedure: Left-eye cataract procedure (fictional)",
        "Proposed MBS item: 42702 (illustrative only)",
        "Surgeon fee: $2,300.00", "Anaesthetist fee: $750.00",
        "Hospital fee: $900.00", "Theatre fee: $450.00",
        "Accommodation: $250.00", "Device: $500.00", "Medicines: $80.00",
        "Total provider fees: $5,230.00", "Excess: $500.00 (separate)",
        "Included: surgeon, anaesthetist, hospital, theatre, accommodation, device, medicines.",
        "Excluded: diagnostic tests, if required.",
        "Condition: estimate only; valid until 31/10/2026.",
    ]),
    ("synthetic-revised-estimate.pdf", "Revised specialist estimate", "DOC-REVISED", [
        "Practice: Demo Harbour Eye Practice (fictional)",
        "Document date: 12/10/2026", "Proposed service date: 20/10/2026",
        "Procedure: Left-eye cataract procedure (fictional)",
        "Proposed MBS item: 42702 (illustrative only)",
        "Surgeon fee: $2,100.00", "Anaesthetist fee: $750.00",
        "Hospital fee: $900.00", "Theatre fee: $450.00",
        "Accommodation: $250.00", "Device: $500.00", "Medicines: $80.00",
        "Total provider fees: $5,030.00", "Excess: $500.00 (separate)",
        "Included: surgeon, anaesthetist, hospital, theatre, accommodation, device, medicines.",
        "Excluded: diagnostic tests, if required.",
        "Condition: revised estimate only; valid until 31/10/2026.",
    ]),
    ("synthetic-final-invoice.pdf", "Final invoice", "DOC-INVOICE", [
        "Practice: Demo Harbour Eye Practice (fictional)",
        "Invoice date: 22/10/2026", "Service date: 20/10/2026",
        "Procedure: Left-eye cataract procedure (fictional)",
        "MBS item stated: 42702 (illustrative only)",
        "Surgeon fee: $2,100.00", "Anaesthetist fee: $750.00",
        "Hospital fee: $900.00", "Theatre fee: $450.00",
        "Accommodation: $250.00", "Device: $500.00", "Medicines: $80.00",
        "Additional theatre session: $700.00",
        "Total charges: $5,730.00", "Medicare payment shown: $1,000.00",
        "Patient balance shown: $4,730.00", "Insurer payment: not shown on this invoice.",
        "Condition: additional theatre session was not in revised estimate; ask for explanation.",
    ]),
    ("synthetic-insurer-statement.pdf", "Insurer benefit statement", "DOC-BENEFIT", [
        "Insurer: DemoCover (fictional)", "Statement date: 23/10/2026",
        "Service date: 20/10/2026", "Procedure: Left-eye cataract procedure (fictional)",
        "Claim reference: SYNTHETIC-ONLY", "MBS item stated: 42702 (illustrative only)",
        "Insurer payment: $3,000.00", "Payment date: 23/10/2026",
        "Condition: synthetic payment record; confirm whether the provider applied it.",
    ]),
    ("synthetic-inconsistent-total.pdf", "Arithmetic review example", "DOC-INCONSISTENT", [
        "Practice: Demo Harbour Eye Practice (fictional)", "Document date: 24/10/2026",
        "Procedure: Left-eye cataract procedure (fictional)",
        "Surgeon fee: $2,100.00", "Anaesthetist fee: $750.00",
        "Total provider fees: $3,000.00",
        "Condition: synthetic arithmetic mismatch for manual review.",
    ]),
]

for filename, title, marker, lines in SHEETS:
    path = OUTPUT / filename
    pdf = canvas.Canvas(str(path), pagesize=(595, 842), invariant=1, pageCompression=0)
    pdf.setTitle(f"FICTIONAL - {title}")
    pdf.setAuthor("MediFair AI synthetic fixture")
    pdf.setFillColor(HexColor("#153c35"))
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(42, 786, "MediFair AI | FICTIONAL DOCUMENT")
    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(HexColor("#476b59"))
    pdf.drawString(42, 764, "Synthetic test data only - no real patient, practice or insurer")
    pdf.setStrokeColor(HexColor("#b5d4bd"))
    pdf.line(42, 748, 553, 748)
    pdf.setFillColor(HexColor("#153c35"))
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(42, 722, title)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(42, 703, f"Fixture reference: {marker}")
    y = 674
    for line in lines:
        pdf.drawString(42, y, line)
        y -= 25
    pdf.setStrokeColor(HexColor("#b5d4bd"))
    pdf.line(42, 77, 553, 77)
    pdf.setFont("Helvetica", 8)
    pdf.setFillColor(HexColor("#637b68"))
    pdf.drawString(42, 60, "All amounts and coverage statements are fabricated for application testing.")
    pdf.save()
    print(path)
