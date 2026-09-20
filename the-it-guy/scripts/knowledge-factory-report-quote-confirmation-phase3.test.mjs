import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260919195512_knowledge_factory_report_quote_confirmation_phase3.sql",
    import.meta.url,
  ),
  "utf8",
);
const api = await readFile(
  new URL("../api/knowledge-factory/report-purchase-intents.js", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL(
    "../src/services/propertyIntelligence/knowledgeFactoryReportPurchaseService.js",
    import.meta.url,
  ),
  "utf8",
);
const modal = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryReportPurchaseModal.jsx",
    import.meta.url,
  ),
  "utf8",
);

for (const column of [
  "quoted_supplier_credits",
  "quoted_field_cost",
  "quoted_type_cost",
  "quoted_price_surcharge",
  "quote_expires_at",
  "confirmation_attested_at",
  "confirmed_at",
]) {
  assert.match(migration, new RegExp(column), `Phase 3 must persist ${column}.`);
}
assert.match(
  migration,
  /status in \('quoted', 'confirmed_pending_execution', 'executing', 'executed', 'execution_failed', 'cancelled', 'expired'\)/,
  "The purchase-intent lifecycle must have an explicit quoted state.",
);
assert.match(
  migration,
  /status = 'quoted'[\s\S]*confirmation_attested_at is null/,
  "An unconfirmed quote must not carry an attestation.",
);
assert.match(
  api,
  /\["list_products", "quote", "confirm", "execute"\]/,
  "The API must expose a separate quote-and-confirm lifecycle.",
);
assert.match(
  api,
  /"GraphQL-Cost": "validate"/,
  "A quote must use the supplier's cost-validation mode.",
);
assert.match(
  api,
  /status: "quoted"[\s\S]*quote_expires_at: quoteExpiresAt/,
  "A quote must be stored with an expiry before it can be confirmed.",
);
assert.match(
  api,
  /input\.attested !== true[\s\S]*status: "confirmed_pending_execution"/,
  "Only an explicit attestation can confirm a quote.",
);
assert.match(
  api,
  /\.eq\("status", "confirmed_pending_execution"\)[\s\S]*\.gt\("quote_expires_at"/,
  "Execution must only begin from an unexpired confirmed quote.",
);
assert.match(
  service,
  /quoteKnowledgeFactoryReportPurchase[\s\S]*action: "quote"/,
  "The browser service must request an estimate before confirmation.",
);
assert.match(
  service,
  /confirmKnowledgeFactoryReportPurchase[\s\S]*attested/,
  "The browser service must carry an explicit confirmation attestation.",
);
for (const visibleStep of [
  "Get UAT estimate",
  "Confirm report at",
  "Run UAT report",
]) {
  assert.match(modal, new RegExp(visibleStep), `The UI must show “${visibleStep}”.`);
}

console.log("Knowledge Factory Phase 3 quote-and-confirmation checks passed");
