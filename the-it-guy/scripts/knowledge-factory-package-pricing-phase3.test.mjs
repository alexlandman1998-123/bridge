import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260918121440_knowledge_factory_package_pricing_controls_phase3.sql",
    import.meta.url,
  ),
  "utf8",
);
const policyApi = await readFile(
  new URL("../api/knowledge-factory/package-commercial-policy.js", import.meta.url),
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
const productPanel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryReportProductsPanel.jsx",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  migration,
  /basic_report_credit_cap[\s\S]*full_report_credit_cap/,
  "Phase 3 must persist independent Basic and Full supplier-credit caps.",
);
assert.match(
  policyApi,
  /basicReportCreditCap[\s\S]*fullReportCreditCap/,
  "Commercial controls must accept both package credit caps.",
);
assert.match(
  productsApi,
  /estimateSupplierCostCents[\s\S]*selectedPriceCents > current\.validatedSupplierCostCents/,
  "A package must be priced above its validated supplier cost before it becomes UAT ready.",
);
assert.match(
  executionApi,
  /basic_report_credit_cap[\s\S]*full_report_credit_cap[\s\S]*packageCreditCap/,
  "Paid execution must enforce the correct package-specific cap.",
);
assert.match(
  productPanel,
  /Validated supplier cost:[\s\S]*Proposed gross margin:/,
  "The package workspace must show the cost and gross-margin basis for pricing.",
);

console.log("Knowledge Factory Phase 3 package-pricing checks passed");
