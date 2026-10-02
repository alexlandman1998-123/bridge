import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildKnowledgeFactoryReportPdf } from '../src/services/propertyIntelligence/knowledgeFactoryReportPdf.js';
import { reportMoney, suppliedNumber, ownerDetails, financeIndicator, transferScope } from '../src/services/propertyIntelligence/knowledgeFactoryReportDisplay.js';

for (const absent of [null, undefined, '', ' ', NaN, Infinity, {}, false]) {
  assert.equal(suppliedNumber(absent), false);
  assert.equal(reportMoney(absent), 'Not supplied');
}
assert.equal(reportMoney(0), 'R0');
assert.equal(reportMoney('1250.50'), 'R1\u00a0250,5');
assert.deepEqual(ownerDetails({ name: 'Synthetic UAT owner', share: 0 }), ['Synthetic UAT owner', 'Type not supplied', 'Share: 0']);
assert.equal(financeIndicator(null), 'Not supplied');
assert.equal(financeIndicator(false), 'Supplier indicates no bond');
assert.match(transferScope({}), /not confirmed/);

export const pdfFixture = JSON.parse(JSON.stringify({
  id: 'synthetic-local-review-only', property_id: 383723, product_id: 'full_canvassing_report',
  executed_at: '2026-10-01T10:00:00Z', report_snapshot_version: 'canvassing-report-v1',
  report_definition_snapshot: { name: 'Full report - synthetic local verification', definitionVersion: 'local-verification', costValidationRecipeId: 'package_full_v1', excludedFields: ['Automated market valuation', 'Comparable sales', 'Bond balance and lender details'] },
  request_context_snapshot: { requestPurpose: 'Local PDF verification - not a supplier-generated report' },
  report_data: {
    property: { propertyId: 383723, address: 'SYNTHETIC UAT SAMPLE - NOT LIVE PROPERTY DATA', suburb: 'Synthetic suburb', town: 'Synthetic town', province: 'Gauteng', extent: 2.07, erf: 83, portion: 0 },
    owners: [{ name: 'Synthetic UAT owner', type: null, share: 0 }], ownership: { registeredAt: '2010-04-05' },
    municipalValuation: { value: null, date: null, municipality: null, reason: null, zoning: null },
    transactions: [{ registeredAt: '2024-01-01', purchasedAt: '2023-12-01', purchaseAmount: null }, { registeredAt: '2010-04-05', purchasedAt: null, purchaseAmount: 0, isCurrentOwner: true }],
    transferHistory: { hasMore: true, order: 'registration_descending', limit: 5 },
    finance: { hasCurrentBond: null, currentBondCount: null, hasMoreBondRecords: true, currentBonds: [] },
  },
  opportunity_signals: { ownershipRegisteredAt: '2010-04-05', ownershipTenureYears: 16, latestTransferRegisteredAt: '2024-01-01', transferRecordsReviewed: 2, currentFinanceRecorded: null, municipalValuationVsLatestPurchase: null },
}));
const pdf = buildKnowledgeFactoryReportPdf(pdfFixture);
assert.ok(pdf.getNumberOfPages() >= 1);
assert.match(Buffer.from(pdf.output('arraybuffer')).subarray(0, 8).toString(), /^%PDF-/);

const pdfRenderer = await readFile(
  new URL(
    "../src/services/propertyIntelligence/knowledgeFactoryReportPdf.js",
    import.meta.url,
  ),
  "utf8",
);
const reportApi = await readFile(
  new URL("../api/knowledge-factory/report-canvassing.js", import.meta.url),
  "utf8",
);
const reportService = await readFile(
  new URL(
    "../src/services/propertyIntelligence/knowledgeFactoryReportConversionService.js",
    import.meta.url,
  ),
  "utf8",
);
const workspace = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryPackageReportsWorkspace.jsx",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  pdfRenderer,
  /buildKnowledgeFactoryReportPdf[\s\S]*Property identity[\s\S]*Current ownership[\s\S]*Scope and provenance/,
  "The downloadable document must render the saved snapshot as a structured report.",
);
assert.match(
  pdfRenderer,
  /municipalValuationVsLatestPurchase[\s\S]*Deliberately not included/,
  "The Full report must present permitted opportunity signals and disclose excluded scope.",
);
assert.match(
  reportService,
  /action: "download"[\s\S]*reportResultId/,
  "The browser must request an authorised saved report before rendering a PDF.",
);
assert.match(
  reportApi,
  /saved_report_pdf_download[\s\S]*report_snapshot_version/,
  "Each PDF download must be audit-recorded against a saved snapshot.",
);
assert.match(
  workspace,
  /downloadKnowledgeFactoryReportPdf[\s\S]*Download PDF/,
  "The completed-reports workspace must offer the saved PDF download directly beside canvassing conversion.",
);

console.log("Knowledge Factory Phase 5 PDF delivery checks passed");
