import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryPackageReportsWorkspace.jsx",
    import.meta.url,
  ),
  "utf8",
);
const reportApi = await readFile(
  new URL("../api/knowledge-factory/report-canvassing.js", import.meta.url),
  "utf8",
);
const pdfRenderer = await readFile(
  new URL(
    "../src/services/propertyIntelligence/knowledgeFactoryReportPdf.js",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  workspace,
  /function ReportReviewModal[\s\S]*Property identity[\s\S]*Current ownership[\s\S]*Scope and provenance/,
  "Phase 4 must provide a structured in-app review of the saved report snapshot.",
);
assert.match(
  workspace,
  /Municipal valuation and zoning[\s\S]*Transfer and finance indicators/,
  "The Full package review must present its valuation, transfer and finance sections.",
);
assert.match(
  workspace,
  /setReviewingReport\(report\)[\s\S]*Review report/,
  "Completed reports must be reviewable before a user downloads or converts them.",
);
assert.match(
  workspace,
  /Reviewing or downloading it does not make another supplier request or use more supplier credits/,
  "The UI must clearly distinguish saved-report review from supplier retrieval.",
);
assert.match(
  reportApi,
  /action === "download"[\s\S]*saved_report_pdf_download/,
  "The existing authorised saved-snapshot download must remain audit-recorded.",
);
assert.match(
  pdfRenderer,
  /buildKnowledgeFactoryReportPdf[\s\S]*Scope and provenance/,
  "The reviewed report must retain the existing structured PDF renderer.",
);

console.log("Knowledge Factory Phase 4 saved-report review checks passed");
