import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260918122051_knowledge_factory_report_snapshots_phase4.sql",
    import.meta.url,
  ),
  "utf8",
);
const executionApi = await readFile(
  new URL("../api/knowledge-factory/report-purchase-intents.js", import.meta.url),
  "utf8",
);
const canvassingApi = await readFile(
  new URL("../api/knowledge-factory/report-canvassing.js", import.meta.url),
  "utf8",
);

assert.match(
  migration,
  /report_snapshot_version text not null[\s\S]*report_definition_snapshot jsonb not null[\s\S]*cost_validation_snapshot jsonb not null[\s\S]*request_context_snapshot jsonb not null[\s\S]*opportunity_signals jsonb not null/,
  "A completed report must retain its render contract, approved definition, cost evidence, request provenance and derived signals.",
);
assert.match(
  executionApi,
  /function reportDefinitionSnapshot[\s\S]*definitionVersion[\s\S]*excludedFields/,
  "The saved report definition must preserve the approved package scope, including exclusions.",
);
assert.match(
  executionApi,
  /function opportunitySignals[\s\S]*municipalValuationVsLatestPurchase[\s\S]*currentFinanceRecorded/,
  "Opportunity signals must be derived from saved, sanitised report data rather than another supplier request.",
);
assert.match(
  executionApi,
  /report_snapshot_version: "canvassing-report-v1"[\s\S]*report_definition_snapshot: definitionSnapshot[\s\S]*cost_validation_snapshot: commercialPreflight\.costValidation[\s\S]*request_context_snapshot: requestContextSnapshot[\s\S]*opportunity_signals: opportunitySignals\(savedReportData\)/,
  "Supplier execution must persist the complete immutable snapshot with the result.",
);
assert.match(
  canvassingApi,
  /report_snapshot_version, report_definition_snapshot, request_context_snapshot, opportunity_signals/,
  "The authorised report workspace must be able to load saved snapshot metadata without re-querying the supplier.",
);

console.log("Knowledge Factory Phase 4 report-snapshot checks passed");
