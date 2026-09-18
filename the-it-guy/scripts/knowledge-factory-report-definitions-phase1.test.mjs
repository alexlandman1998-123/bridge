import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260918120156_knowledge_factory_report_definitions_phase1_realign.sql",
    import.meta.url,
  ),
  "utf8",
);
const productsApi = await readFile(
  new URL("../api/knowledge-factory/report-products.js", import.meta.url),
  "utf8",
);
const executionApi = await readFile(
  new URL("../api/knowledge-factory/report-purchase-intents.js", import.meta.url),
  "utf8",
);
const productsPanel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryReportProductsPanel.jsx",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  migration,
  /definition_version text not null[\s\S]*report_sections jsonb not null[\s\S]*excluded_field_manifest jsonb not null/,
  "Report definitions must be versioned and declare their rendered and excluded scope.",
);
assert.match(
  migration,
  /transaction_history_recent[\s\S]*finance_current_bonds/,
  "The expanded Full package must require fresh validation for transfer history and finance indicators.",
);
assert.match(
  migration,
  /status = 'draft'/,
  "Existing package definitions must return to draft when their scope changes.",
);
assert.match(
  productsApi,
  /definitionVersion: "canvassing-v1"[\s\S]*excludedFields[\s\S]*report_sections: template\.sections/,
  "The server must own the report version, exclusions and sections.",
);
assert.match(
  productsApi,
  /Historic buyer and seller names[\s\S]*Exact bond balance, bond holder, bond number and bond-owner identity/,
  "The standard Full report must clearly exclude sensitive historical-party and detailed-finance data.",
);
assert.doesNotMatch(
  executionApi,
  /holder:\s*text\(bond\?\.bondHolder[\s\S]*amount:\s*bond\?\.bondAmount/,
  "The saved Full report result must not retain detailed lender or balance data.",
);
assert.match(
  productsPanel,
  /Deliberately not included/,
  "The package UI must disclose the excluded scope before a product is sold.",
);

console.log("Knowledge Factory Phase 1 report-definition checks passed");
