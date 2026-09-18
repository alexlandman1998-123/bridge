import { jsPDF } from "jspdf";

const PAGE = { left: 16, right: 194, top: 19, bottom: 278 };
const INK = "#14213d";
const MUTED = "#64748b";
const BRAND = "#1769dc";

function text(value, fallback = "Not supplied") {
  const result = String(value ?? "").trim();
  return result || fallback;
}
function date(value) {
  if (!value) return "Not supplied";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(parsed);
}
function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `R${amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`
    : "Not supplied";
}
function filenamePart(value) {
  return text(value, "property-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildKnowledgeFactoryReportPdf(report = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const property = report.report_data?.property || {};
  const definition = report.report_definition_snapshot || {};
  const context = report.request_context_snapshot || {};
  const signals = report.opportunity_signals || {};
  const title = property.address || `Property ${text(report.property_id)}`;
  let y = PAGE.top;

  const put = (value, x, at, size = 9, color = INK, options = {}) => {
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(String(value), x, at, options.align ? { align: options.align } : undefined);
  };
  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let number = 1; number <= pages; number += 1) {
      doc.setPage(number);
      doc.setDrawColor("#dbe4ee");
      doc.line(PAGE.left, 285, PAGE.right, 285);
      put("Arch9 Property Intelligence - confidential", PAGE.left, 290, 7.5, MUTED);
      put(`${number} / ${pages}`, PAGE.right, 290, 7.5, MUTED, { align: "right" });
    }
  };
  const page = () => {
    doc.addPage();
    y = PAGE.top;
    put("ARCH9", PAGE.left, y, 9, BRAND, { bold: true });
    put("Property intelligence report", PAGE.right, y, 8, MUTED, { align: "right" });
    y += 10;
  };
  const room = (height) => {
    if (y + height > PAGE.bottom) page();
  };
  const paragraph = (value, { size = 9, color = INK, gap = 3 } = {}) => {
    const lines = doc.splitTextToSize(text(value, ""), PAGE.right - PAGE.left);
    for (const line of lines) {
      room(size * 0.55 + 1.8);
      put(line, PAGE.left, y, size, color);
      y += size * 0.55 + 1.4;
    }
    y += gap;
  };
  const section = (label) => {
    room(16);
    y += 3;
    doc.setFillColor("#edf4ff");
    doc.roundedRect(PAGE.left, y - 5, PAGE.right - PAGE.left, 9, 1.5, 1.5, "F");
    put(label, PAGE.left + 3, y + 1, 10, INK, { bold: true });
    y += 12;
  };
  const row = (label, value) => {
    const labelLines = doc.splitTextToSize(text(label, "Value"), 53);
    const valueLines = doc.splitTextToSize(text(value), 106);
    const lineCount = Math.max(labelLines.length, valueLines.length);
    room(lineCount * 4.6 + 5);
    for (let index = 0; index < lineCount; index += 1) {
      if (labelLines[index]) put(labelLines[index], PAGE.left + 1, y, 8.3, MUTED);
      if (valueLines[index]) put(valueLines[index], PAGE.left + 60, y, 8.5, INK);
      y += 4.35;
    }
    doc.setDrawColor("#e5ebf1");
    doc.line(PAGE.left, y + 0.4, PAGE.right, y + 0.4);
    y += 4;
  };

  put("ARCH9", PAGE.left, y, 11, BRAND, { bold: true });
  put("PROPERTY INTELLIGENCE", PAGE.right, y, 8, MUTED, { align: "right" });
  y += 13;
  const titleLines = doc.splitTextToSize(title, PAGE.right - PAGE.left);
  for (const line of titleLines) {
    put(line, PAGE.left, y, 18, INK, { bold: true });
    y += 8.5;
  }
  y += 2;
  put(text(definition.name, "Property intelligence report"), PAGE.left, y, 10, BRAND, { bold: true });
  y += 8;
  row("Report reference", String(report.id || "Not supplied").slice(0, 36));
  row("Generated", date(report.executed_at));
  row("Requested purpose", context.requestPurpose || "Canvassing research");

  section("Property identity");
  row("Property ID", property.propertyId || report.property_id);
  row("Address", property.address);
  row("Suburb / town", [property.suburb, property.town].filter(Boolean).join(" / "));
  row("Province / postal code", [property.province, property.postalCode].filter(Boolean).join(" / "));
  row("Type / extent", [property.type, property.extent ? `${property.extent} sqm` : ""].filter(Boolean).join(" / "));
  row("Deeds / parcel reference", [property.deedsOfficeId, property.erf ? `Erf ${property.erf}` : "", property.portion ? `Portion ${property.portion}` : "", property.unit ? `Unit ${property.unit}` : ""].filter(Boolean).join(" / "));

  section("Current ownership");
  const owners = Array.isArray(report.report_data?.owners) ? report.report_data.owners : [];
  if (owners.length) {
    owners.forEach((owner, index) =>
      row(
        `Owner ${index + 1}`,
        [owner?.name, owner?.type, owner?.share ? `Share: ${owner.share}` : ""].filter(Boolean).join(" - "),
      ),
    );
  } else {
    paragraph("No current owner record was supplied in this report snapshot.", { color: MUTED });
  }
  if (
    signals.ownershipRegisteredAt ||
    Number.isFinite(Number(signals.ownershipTenureYears))
  ) {
    row("Current ownership registered", date(signals.ownershipRegisteredAt));
    row("Approximate ownership tenure", signals.ownershipTenureYears === null || signals.ownershipTenureYears === undefined ? "Not supplied" : `${signals.ownershipTenureYears} years`);
  }

  if (report.product_id === "full_canvassing_report") {
    const valuation = report.report_data?.municipalValuation || {};
    section("Municipal valuation and zoning");
    row("Municipal valuation", money(valuation.value));
    row("Valuation date", date(valuation.date));
    row("Municipality", valuation.municipality);
    row("Zoning", valuation.zoning);
    row("Valuation reason", valuation.reason);

    section("Selected transfer timeline");
    const transactions = Array.isArray(report.report_data?.transactions)
      ? report.report_data.transactions
      : [];
    if (transactions.length) {
      transactions.forEach((transaction, index) => {
        row(
          `Transfer ${index + 1}`,
          [
            transaction?.registeredAt ? `Registered ${date(transaction.registeredAt)}` : "",
            transaction?.purchasedAt ? `Purchased ${date(transaction.purchasedAt)}` : "",
            Number.isFinite(Number(transaction?.purchaseAmount)) ? money(transaction.purchaseAmount) : "",
            transaction?.isCurrentOwner ? "Current ownership record" : "",
          ].filter(Boolean).join(" - "),
        );
      });
    } else {
      paragraph("No transfer timeline was supplied in this report snapshot.", { color: MUTED });
    }

    section("Current finance indicator");
    const finance = report.report_data?.finance || {};
    row("Current finance recorded", finance.hasCurrentBond === true ? "Yes" : "No record supplied");
    row("Current bond count", finance.currentBondCount ?? "Not supplied");
    (Array.isArray(finance.currentBonds) ? finance.currentBonds : []).forEach((bond, index) =>
      row(`Finance record ${index + 1}`, [bond?.registeredAt ? `Registered ${date(bond.registeredAt)}` : "", bond?.indicator].filter(Boolean).join(" - ")),
    );

    section("Canvassing opportunity signals");
    row("Transfer records reviewed", signals.transferRecordsReviewed ?? "Not supplied");
    row("Latest transfer registration", date(signals.latestTransferRegisteredAt));
    row("Current finance indicator", signals.currentFinanceRecorded === true ? "Recorded" : "Not recorded");
    const comparison = signals.municipalValuationVsLatestPurchase;
    row(
      "Valuation compared with latest purchase",
      comparison
        ? `${money(comparison.difference)} (${comparison.percentageDifference}% difference)`
        : "Insufficient data to compare",
    );
  }

  section("Scope and provenance");
  paragraph("This report was generated from the saved report snapshot. Downloading it does not submit another supplier request or use additional supplier credits.", { color: MUTED });
  row("Definition version", definition.definitionVersion);
  row("Cost-validation recipe", definition.costValidationRecipeId);
  const excluded = Array.isArray(definition.excludedFields) ? definition.excludedFields : [];
  if (excluded.length) row("Deliberately not included", excluded.join("; "));
  paragraph("Use this information only for the stated business purpose and in line with your organisation's legal, privacy and compliance obligations.", { size: 8, color: MUTED, gap: 0 });

  footer();
  doc.setProperties({
    title: `${title} - Arch9 property intelligence report`,
    subject: "Saved property intelligence report snapshot",
    author: "Arch9",
    creator: "Arch9",
  });
  return doc;
}

export function downloadKnowledgeFactoryReportPdf(report = {}) {
  const doc = buildKnowledgeFactoryReportPdf(report);
  const blob = doc.output("blob");
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${filenamePart(report.report_data?.property?.address)}-property-intelligence-report.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
}
