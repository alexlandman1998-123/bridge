#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path
from xml.sax.saxutils import escape

import pdfplumber
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    KeepTogether,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


PAGE_WIDTH, PAGE_HEIGHT = A4


def text(value):
    return str(value or "").strip()


def money(value):
    if value in (None, ""):
        return "Pending"
    try:
        return f"R {float(value):,.0f}".replace(",", " ")
    except Exception:
        return text(value)


def paragraph(value, style):
    return Paragraph(escape(text(value)).replace("\n", "<br/>"), style)


def draw_chrome(canvas, doc, route):
    agency = text(route.get("agencyName")) or "Arch9 Realty"
    website = text(route.get("website")) or "www.arch9.co.za"
    company = route.get("companyDetails") or {}
    route_label = text(route.get("routeLabel"))

    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#0f2d3f"))
    canvas.roundRect(18 * mm, PAGE_HEIGHT - 26 * mm, 36 * mm, 14 * mm, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(21 * mm, PAGE_HEIGHT - 21 * mm, "ARCH9")

    canvas.setFillColor(colors.HexColor("#102033"))
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawRightString(PAGE_WIDTH - 18 * mm, PAGE_HEIGHT - 17 * mm, text(company.get("tradingName")) or agency)
    canvas.setFont("Helvetica", 7)
    detail_lines = [
        text(company.get("legalName")) or "Arch9 Property Group (Pty) Ltd",
        text(company.get("registration")) or "Reg: 2026/000001/07",
        text(company.get("address")) or "1 Sandton Drive, Johannesburg",
        route_label,
    ]
    y = PAGE_HEIGHT - 21 * mm
    for line in detail_lines:
        canvas.drawRightString(PAGE_WIDTH - 18 * mm, y, line)
        y -= 3.5 * mm

    canvas.setStrokeColor(colors.HexColor("#d8e1eb"))
    canvas.line(18 * mm, PAGE_HEIGHT - 36 * mm, PAGE_WIDTH - 18 * mm, PAGE_HEIGHT - 36 * mm)
    canvas.line(18 * mm, 18 * mm, PAGE_WIDTH - 18 * mm, 18 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#405167"))
    canvas.drawString(18 * mm, 10 * mm, agency)
    canvas.drawCentredString(PAGE_WIDTH / 2, 10 * mm, f"Page {doc.page} of {route.get('pageCount', '4')}")
    canvas.drawRightString(PAGE_WIDTH - 18 * mm, 10 * mm, website)

    canvas.setFont("Helvetica", 6)
    initials = route.get("initialRoles") or []
    initial_labels = {
        "purchaser_1": "P1",
        "seller": "SEL",
        "developer_authorised_signatory": "DEV",
        "contractor_authorised_signatory": "CON",
        "agent": "AGT",
    }
    x = 18 * mm
    for role in initials:
        canvas.roundRect(x, 20 * mm, 24 * mm, 8 * mm, 1 * mm, stroke=1, fill=0)
        canvas.drawString(x + 1.5 * mm, 23 * mm, f"{initial_labels.get(role, role[:4].upper())} initials")
        x += 28 * mm
    canvas.restoreState()


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=7.5, leading=10))
    styles.add(ParagraphStyle(name="Tiny", parent=styles["Normal"], fontSize=6.5, leading=8))
    styles.add(ParagraphStyle(name="BodyTight", parent=styles["Normal"], fontSize=8.4, leading=11))
    styles.add(ParagraphStyle(name="Heading", parent=styles["Heading2"], fontSize=13, leading=15, textColor=colors.HexColor("#102033"), spaceAfter=5))
    styles.add(ParagraphStyle(name="Subheading", parent=styles["Heading3"], fontSize=9.5, leading=12, textColor=colors.HexColor("#27445f"), spaceBefore=4, spaceAfter=3))
    styles.add(ParagraphStyle(name="TableCell", parent=styles["Normal"], fontSize=7.4, leading=9))
    styles.add(ParagraphStyle(name="TableLabel", parent=styles["Normal"], fontSize=7.4, leading=9, textColor=colors.HexColor("#102033")))
    styles.add(ParagraphStyle(name="TableHeader", parent=styles["TableLabel"], textColor=colors.white))
    styles.add(ParagraphStyle(name="TitleProof", parent=styles["Title"], fontSize=17, leading=20, textColor=colors.HexColor("#102033")))
    return styles


def details_table(rows, styles, label_width=37 * mm, value_width=124 * mm):
    prepared = [[paragraph(label, styles["TableLabel"]), paragraph(value, styles["TableCell"])] for label, value in rows if text(value)]
    if not prepared:
        prepared = [[paragraph("Details", styles["TableLabel"]), paragraph("To be completed", styles["TableCell"])]]
    return Table(prepared, colWidths=[label_width, value_width], style=[
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d8e1eb")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f4f8fb")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 5),
    ])


def has_commission_variation(fields):
    status = text(fields.get("otp_commission_variation_status")).lower()
    approval = text(fields.get("otp_commission_approval_reference"))
    mandate = text(fields.get("mandate_commission_snapshot"))
    proposal = text(fields.get("otp_commission_proposal"))
    return bool(approval or (status and status != "not_required") or (mandate and proposal and mandate != proposal))


def normalize_key(value):
    return text(value).lower().replace(" ", "_").replace("-", "_")


def status_label(value):
    labels = {
        "known": "Known",
        "estimated": "Estimated",
        "pending": "Pending",
        "not_applicable": "Not applicable",
    }
    return labels.get(normalize_key(value), text(value) or "Pending")


def responsibility_label(item):
    payer = normalize_key(item.get("payerRole") or item.get("payer_role") or "buyer")
    due = normalize_key(item.get("dueEvent") or item.get("due_event"))
    payer_labels = {
        "buyer": "Buyer",
        "seller_until_transfer_buyer_after_occupation_or_transfer": "Seller until transfer; buyer after occupation/transfer",
    }
    due_labels = {
        "on_conveyancer_demand": "On conveyancer demand",
        "before_lodgement": "Before lodgement",
        "apportioned_on_occupation_or_transfer": "Apportioned on occupation or transfer",
        "from_registration_or_project_schedule": "From registration or project schedule",
        "project_schedule_or_on_demand": "Project schedule or on demand",
        "on_demand": "On demand",
    }
    return "; ".join([payer_labels.get(payer, payer.replace("_", " ").title()), due_labels.get(due, due.replace("_", " ").title())]).strip("; ")


def cost_amount(item):
    status = normalize_key(item.get("amountStatus") or item.get("amount_status") or item.get("visibleStatus"))
    if status == "not_applicable":
        return "Not applicable"
    return money(item.get("amount"))


def buyer_cost_obligations_table(cost_items, styles):
    status_order = ["known", "estimated", "pending", "not_applicable"]
    status_rank = {status: index for index, status in enumerate(status_order)}
    items = sorted(cost_items or [], key=lambda item: (
        status_rank.get(normalize_key(item.get("amountStatus") or item.get("amount_status") or item.get("visibleStatus")), 99),
        text(item.get("label") or item.get("key")),
    ))
    rows = [[
        paragraph("Cost", styles["TableHeader"]),
        paragraph("Status", styles["TableHeader"]),
        paragraph("Amount", styles["TableHeader"]),
        paragraph("Responsibility / timing", styles["TableHeader"]),
    ]]
    if not items:
        rows.append([
            paragraph("Buyer cost obligations", styles["TableCell"]),
            paragraph("Pending", styles["TableCell"]),
            paragraph("Pending", styles["TableCell"]),
            paragraph("To be confirmed before generation", styles["TableCell"]),
        ])
    for item in items:
        rows.append([
            paragraph(text(item.get("label") or item.get("key")), styles["TableCell"]),
            paragraph(status_label(item.get("amountStatus") or item.get("amount_status") or item.get("visibleStatus")), styles["TableCell"]),
            paragraph(cost_amount(item), styles["TableCell"]),
            paragraph(responsibility_label(item), styles["TableCell"]),
        ])
    return Table(rows, repeatRows=1, colWidths=[49 * mm, 25 * mm, 27 * mm, 60 * mm], style=[
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d8e1eb")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#102033")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 4),
    ])


def build_story(route, styles):
    story = []
    route_label = text(route.get("routeLabel"))
    fields = route.get("mergeFields") or {}
    summary = route.get("summary") or {}
    buyer = summary.get("buyerInfo") or {}
    seller = summary.get("sellerInfo") or {}
    property_info = summary.get("propertyInfo") or {}

    story += [
        paragraph("OFFER TO PURCHASE", styles["TitleProof"]),
        paragraph(route_label, styles["Subheading"]),
        Spacer(1, 4 * mm),
        paragraph("Buyer Information", styles["Subheading"]),
    ]
    story.append(details_table([
        ["Full name", buyer.get("fullName") or summary.get("buyer")],
        ["ID / registration number", buyer.get("idNumber")],
        ["Email", buyer.get("email")],
        ["Telephone", buyer.get("phone")],
        ["Capacity", buyer.get("capacity")],
    ], styles))
    story += [
        Spacer(1, 3 * mm),
        paragraph("Seller Information" if route.get("routeVariant") == "resale_existing_property" else "Developer / Seller Information", styles["Subheading"]),
    ]
    story.append(details_table([
        ["Full name", seller.get("fullName") or summary.get("seller")],
        ["ID / registration number", seller.get("idNumber")],
        ["Email", seller.get("email")],
        ["Telephone", seller.get("phone")],
        ["Capacity", seller.get("capacity")],
    ], styles))
    story += [
        Spacer(1, 3 * mm),
        paragraph("Property Information", styles["Subheading"]),
    ]
    story.append(details_table([
        ["Property", property_info.get("description") or summary.get("property")],
        ["Title / unit details", property_info.get("titleType")],
        ["Purchase price", property_info.get("purchasePrice") or summary.get("purchasePrice")],
        ["Deposit", property_info.get("deposit")],
        ["Finance type", property_info.get("financeType")],
        ["Offer expiry", property_info.get("offerExpiry")],
    ], styles))
    story += [
        Spacer(1, 5 * mm),
        paragraph("Commercial Terms", styles["Heading"]),
    ]
    if has_commission_variation(fields):
        story.append(paragraph("Commission Variation", styles["Subheading"]))
        commission_rows = [
            ["Mandate commission", text(fields.get("mandate_commission_snapshot"))],
            ["OTP commission proposal", text(fields.get("otp_commission_proposal"))],
            ["Variation status", text(fields.get("otp_commission_variation_status"))],
            ["Approval reference", text(fields.get("otp_commission_approval_reference"))],
        ]
        story.append(details_table(commission_rows, styles, 55 * mm, 106 * mm))
        story.append(Spacer(1, 4 * mm))
    else:
        story.append(paragraph("Commission", styles["Subheading"]))
        story.append(paragraph("The mandate commission applies for this route.", styles["Small"]))
        story.append(Spacer(1, 4 * mm))
    story += [Spacer(1, 4 * mm), paragraph("Buyer Cost Obligations", styles["Subheading"])]
    story.append(paragraph("Known, estimated and pending buyer costs are shown before signature. Pending or estimated items stay visible until the appointed professional or authority confirms the final amount.", styles["Small"]))
    story.append(Spacer(1, 2 * mm))
    story.append(buyer_cost_obligations_table(route.get("costItems", []), styles))
    story += [
        Spacer(1, 4 * mm),
        paragraph(f"Matter attorney cost quote status: {fields.get('matter_attorney_cost_quote_status')}", styles["Small"]),
        paragraph(f"Transfer attorney: {fields.get('transfer_attorney_company_name')}", styles["Small"]),
        Spacer(1, 5 * mm),
        paragraph("Legal Clauses", styles["Heading"]),
    ]

    for section in route.get("legalSections", []):
        story.append(KeepTogether([
            paragraph(f"{section.get('sectionNumber')}. {section.get('label')}", styles["Subheading"]),
            paragraph(section.get("legalText"), styles["Tiny"]),
        ]))

    signature_block = [
        Spacer(1, 5 * mm),
        paragraph("Signatures, Dates And Initials", styles["Heading"]),
        paragraph("Initials are required on every page. Signature and date boxes are role scoped for this OTP route.", styles["BodyTight"]),
        paragraph(f"Initial markers every page: {'; '.join([role + ' initials' for role in route.get('initialRoles', [])])}", styles["Small"]),
        Spacer(1, 4 * mm),
    ]
    signature_rows = [[
        paragraph("Signer role", styles["TableLabel"]),
        paragraph("Signature", styles["TableLabel"]),
        paragraph("Witness 1", styles["TableLabel"]),
        paragraph("Witness 2", styles["TableLabel"]),
        paragraph("Date", styles["TableLabel"]),
    ]]
    for role in route.get("signatureRoles", []):
        signature_rows.append([
            paragraph(role, styles["TableCell"]),
            paragraph("Signature field", styles["TableCell"]),
            paragraph("Witness 1", styles["TableCell"]),
            paragraph("Witness 2", styles["TableCell"]),
            paragraph("Date field", styles["TableCell"]),
        ])
    signature_block.append(Table(signature_rows, colWidths=[44 * mm, 34 * mm, 31 * mm, 31 * mm, 21 * mm], rowHeights=17 * mm, style=[
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#8ca0b3")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f4f8fb")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    signature_block += [
        Spacer(1, 5 * mm),
        paragraph("Initials are shown in the footer on every page for each required role.", styles["Small"]),
    ]
    story.append(KeepTogether(signature_block))
    return story


def build_pdf(path, route, styles):
    frame = Frame(18 * mm, 26 * mm, PAGE_WIDTH - 36 * mm, PAGE_HEIGHT - 68 * mm, id="body")
    doc = BaseDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=38 * mm,
        bottomMargin=24 * mm,
    )
    doc.addPageTemplates([PageTemplate(id="proof", frames=[frame], onPage=lambda c, d: draw_chrome(c, d, route))])
    doc.build(build_story(route, styles))


def make_doc(path, route):
    styles = make_styles()
    temp_path = path.with_name(f"{path.stem}.pagecount.tmp.pdf")
    route["pageCount"] = ""
    build_pdf(temp_path, route, styles)
    route["pageCount"] = len(PdfReader(str(temp_path)).pages)
    build_pdf(path, route, styles)
    try:
        temp_path.unlink()
    except FileNotFoundError:
        pass


def inspect_pdf(path):
    reader = PdfReader(str(path))
    page_count = len(reader.pages)
    with pdfplumber.open(str(path)) as pdf:
        page_text = [(page.extract_text() or "") for page in pdf.pages]
    all_text = "\n".join(page_text)
    return {
        "path": str(path),
        "fileName": path.name,
        "byteLength": path.stat().st_size,
        "pageCount": page_count,
        "text": all_text,
        "pageTextLengths": [len(value.strip()) for value in page_text],
    }


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: render_otp_phase27_pdf.py input.json evidence.json")
    input_path = Path(sys.argv[1])
    evidence_path = Path(sys.argv[2])
    payload = json.loads(input_path.read_text())
    output_dir = Path(payload["outputDir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    evidence = []
    for route in payload["routes"]:
        path = output_dir / route["fileName"]
        make_doc(path, route)
        inspected = inspect_pdf(path)
        inspected["routeVariant"] = route["routeVariant"]
        inspected["routeLabel"] = route["routeLabel"]
        inspected["expectedMarkers"] = route.get("expectedMarkers", [])
        inspected["forbiddenMarkers"] = route.get("forbiddenMarkers", [])
        evidence.append(inspected)
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps({"files": evidence}, indent=2))


if __name__ == "__main__":
    main()
