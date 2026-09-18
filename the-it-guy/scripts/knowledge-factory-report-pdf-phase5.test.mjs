import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
