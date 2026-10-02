import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reportData, opportunitySignals } from '../api/knowledge-factory/report-purchase-intents.js';

const property = {
  propertyId: 383723, extent: 2.07, portion: 0,
  currentOwnership: { nodes: [{ isCurrentOwner: true, dateRegister: '2010-04-05', buyers: { pageInfo: { hasNextPage: false }, nodes: [{ buyerName: 'Synthetic UAT owner', buyerType: 1, share: 0 }] }, bonds: { pageInfo: { hasNextPage: true }, nodes: [{ bondDateRegister: '2010-04-05', bondInd: 'Synthetic indicator', isCurrentBond: true }, { isCurrentBond: false }, { isCurrentBond: null }] } }] },
  valuationValue: null,
  transfers: { pageInfo: { hasNextPage: true }, nodes: [{ dateRegister: null, datePurchase: null, purchaseAmount: null }, { dateRegister: '1990-01-01', purchaseAmount: 0 }, { dateRegister: '2024-01-01', purchaseAmount: 1200000 }, { dateRegister: '2010-04-05', isCurrentOwner: true }] },
};
const basic = reportData(property, 'basic_owner_lookup');
assert.equal(basic.ownership.registeredAt, '2010-04-05');
assert.equal(opportunitySignals(basic).ownershipRegisteredAt, '2010-04-05');
assert.equal(basic.owners[0].type, 'Supplier type code 1');
assert.equal(basic.owners[0].share, 0);
assert.equal(basic.property.hasDeeds, null);
const full = reportData(property, 'full_canvassing_report');
assert.deepEqual(full.transactions.map((row) => row.registeredAt), ['2024-01-01', '2010-04-05', '1990-01-01', null]);
assert.equal(full.transferHistory.hasMore, true);
assert.equal(full.finance.hasMoreBondRecords, true);
assert.equal(full.finance.currentBonds.length, 1, 'Unknown current-status bonds cannot be represented as current.');
assert.equal(full.finance.currentBondCount, null, 'Unknown current-status flags cannot imply a verified zero or total count.');
assert.equal(full.municipalValuation.value, null);
const saved = JSON.parse(JSON.stringify({ report_data: full, opportunity_signals: opportunitySignals(full) }));
assert.deepEqual(saved.report_data, full, 'Saving/reloading JSON must retain dates, missing values, limited history and zero shares.');
assert.equal(saved.opportunity_signals.ownershipRegisteredAt, '2010-04-05');
assert.equal(saved.opportunity_signals.latestTransferRegisteredAt, '2024-01-01');
const missing = reportData({ propertyId: 1 }, 'full_canvassing_report');
assert.equal(missing.finance.hasCurrentBond, null);
assert.equal(missing.finance.currentBondCount, null);
assert.equal(opportunitySignals(missing).ownershipTenureYears, null);
assert.equal(opportunitySignals({ ownership: { registeredAt: 'invalid' } }).ownershipTenureYears, null);
assert.throws(() => reportData({ ...property, currentOwnership: { nodes: [{ buyers: { pageInfo: { hasNextPage: true }, nodes: [] } }] } }, 'basic_owner_lookup'), /owner list/);

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
