import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260914133424_knowledge_factory_canvassing_cost_matrix.sql",
    import.meta.url,
  ),
  "utf8",
);
const api = await readFile(
  new URL("../api/knowledge-factory/cost-matrix.js", import.meta.url),
  "utf8",
);
const panel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryCostMatrixPanel.jsx",
    import.meta.url,
  ),
  "utf8",
);
const operations = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryOperationsWorkspace.jsx",
    import.meta.url,
  ),
  "utf8",
);
const productMigration = await readFile(
  new URL(
    "../../supabase/migrations/20260917062711_knowledge_factory_report_products_phase1.sql",
    import.meta.url,
  ),
  "utf8",
);
const productsApi = await readFile(
  new URL("../api/knowledge-factory/report-products.js", import.meta.url),
  "utf8",
);
const productsPanel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryReportProductsPanel.jsx",
    import.meta.url,
  ),
  "utf8",
);
const purchaseMigration = await readFile(
  new URL(
    "../../supabase/migrations/20260917063337_knowledge_factory_report_purchase_intents_phase2.sql",
    import.meta.url,
  ),
  "utf8",
);
const purchaseApi = await readFile(
  new URL(
    "../api/knowledge-factory/report-purchase-intents.js",
    import.meta.url,
  ),
  "utf8",
);
const purchasePanel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryReportPurchaseModal.jsx",
    import.meta.url,
  ),
  "utf8",
);
const executionMigration = await readFile(
  new URL(
    "../../supabase/migrations/20260917064405_knowledge_factory_report_execution_phase3.sql",
    import.meta.url,
  ),
  "utf8",
);
const conversionMigration = await readFile(
  new URL(
    "../../supabase/migrations/20260917065342_knowledge_factory_report_canvassing_conversion_phase4.sql",
    import.meta.url,
  ),
  "utf8",
);
const conversionApi = await readFile(
  new URL("../api/knowledge-factory/report-canvassing.js", import.meta.url),
  "utf8",
);
const conversionPanel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryPackageReportsWorkspace.jsx",
    import.meta.url,
  ),
  "utf8",
);
const commercialControlsMigration = await readFile(
  new URL(
    "../../supabase/migrations/20260917070101_knowledge_factory_package_commercial_controls_phase5.sql",
    import.meta.url,
  ),
  "utf8",
);
const commercialControlsApi = await readFile(
  new URL(
    "../api/knowledge-factory/package-commercial-policy.js",
    import.meta.url,
  ),
  "utf8",
);
const commercialControlsPanel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryPackageCommercialPolicyPanel.jsx",
    import.meta.url,
  ),
  "utf8",
);
const pilotMigration = await readFile(
  new URL(
    "../../supabase/migrations/20260917071055_knowledge_factory_package_pilot_phase6.sql",
    import.meta.url,
  ),
  "utf8",
);
const pilotApi = await readFile(
  new URL("../api/knowledge-factory/package-pilot.js", import.meta.url),
  "utf8",
);
const pilotPanel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryPackagePilotPanel.jsx",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  migration,
  /create table public\.knowledge_factory_cost_validations/,
  "Cost validations must be persisted without supplier payloads.",
);
assert.match(
  migration,
  /enable row level security/,
  "Cost validations must enable RLS.",
);
assert.match(
  migration,
  /revoke all on public\.knowledge_factory_cost_validations/,
  "Browser writes must be blocked.",
);
assert.match(
  migration,
  /snapshot_core[\s\S]*finance_current_bonds/,
  "The schema must restrict records to the five fixed recipes.",
);
assert.match(
  api,
  /"GraphQL-Cost": "validate"/,
  "The supplier call must request a cost validation, not a report.",
);
assert.doesNotMatch(
  api,
  /"GraphQL-Cost": "report"/,
  "The cost matrix must never request a billable report.",
);
assert.match(
  api,
  /Only a principal-level administrator can validate the canvassing cost matrix/,
  "The matrix must be admin controlled.",
);
assert.match(
  api,
  /owner_current_transfer[\s\S]*transaction_history_recent[\s\S]*finance_current_bonds/,
  "The API must define the controlled sensitive-field recipes.",
);
assert.match(
  panel,
  /Canvassing cost-validation matrix/,
  "Operations must identify the package cost-validation matrix.",
);
assert.match(
  panel,
  /Basic package - exact query[\s\S]*Full package - exact query/,
  "Operations must expose the complete Basic and Full package validations.",
);
assert.match(
  panel,
  /does\s+not request a report, store supplier data/,
  "The UI must make its non-report scope explicit.",
);
assert.match(
  operations,
  /KnowledgeFactoryCostMatrixPanel/,
  "The matrix must be available in Operations.",
);
assert.match(
  productMigration,
  /create table public\.knowledge_factory_report_products[\s\S]*enable row level security/,
  "Phase 1 report definitions must be shared and protected by RLS.",
);
assert.match(
  productMigration,
  /basic_owner_lookup[\s\S]*full_canvassing_report/,
  "Phase 1 must limit products to the two controlled report packages.",
);
assert.match(
  productsApi,
  /basic_owner_lookup[\s\S]*priceCents: 500[\s\S]*full_canvassing_report[\s\S]*priceCents: 2500/,
  "The server must own the R5 basic and R25 full package defaults.",
);
assert.match(
  productsApi,
  /included_recipe_ids: template\.recipeIds[\s\S]*field_manifest: template\.fields/,
  "The server must own the package recipe and field definitions.",
);
assert.match(
  productsPanel,
  /no customer report can be generated in this\s+phase/,
  "Phase 1 must keep package definition separate from chargeable report generation.",
);
assert.match(
  productsPanel,
  /Mark UAT ready/,
  "Phase 1 should require explicit UAT readiness before later release work.",
);
assert.match(
  operations,
  /KnowledgeFactoryReportProductsPanel/,
  "Phase 1 report packages must be available in Operations.",
);
assert.match(
  purchaseMigration,
  /create table public\.knowledge_factory_report_purchase_intents[\s\S]*enable row level security/,
  "Phase 2 confirmations must be stored separately with RLS enabled.",
);
assert.match(
  purchaseMigration,
  /confirmed_pending_execution[\s\S]*does not itself trigger supplier execution/,
  "Phase 2 must persist a confirmation without treating it as supplier execution.",
);
assert.match(
  purchaseApi,
  /\["list_products", "confirm", "execute"\][\s\S]*status", "uat_validated"/,
  "Only UAT-ready server-owned packages may be confirmed.",
);
assert.match(
  purchaseApi,
  /if \(action === "execute"\)/,
  "The chargeable supplier path must be an explicit Phase 3 action.",
);
assert.match(
  purchaseApi,
  /"GraphQL-Cost": "report"/,
  "Phase 3 execution must make the supplier call in report mode.",
);
assert.match(
  purchaseApi,
  /Report selection confirmed\. No supplier data has been requested yet/,
  "Phase 2 confirmation must remain a no-charge action.",
);
assert.match(
  purchasePanel,
  /No supplier data has been requested or charged in\s+this step/,
  "The purchase confirmation must clearly state its no-charge scope.",
);
assert.match(
  executionMigration,
  /create table public\.knowledge_factory_report_results[\s\S]*enable row level security/,
  "Phase 3 results must be stored in their own RLS-protected table.",
);
assert.match(
  executionMigration,
  /execution_failed[\s\S]*knowledge_factory_report_results_read/,
  "Phase 3 must model execution failures and constrain result access.",
);
assert.match(
  purchaseApi,
  /status: "executing"/,
  "Phase 3 must claim a report intent before execution.",
);
assert.match(
  purchaseApi,
  /\.eq\("status", "confirmed_pending_execution"\)/,
  "Only a previously confirmed report intent may be claimed for execution.",
);
assert.match(
  purchaseApi,
  /report_data: reportData\(result\.property, intent\.product_id\)/,
  "Phase 3 must save a server-shaped report result rather than a raw supplier payload.",
);
assert.match(
  purchasePanel,
  /Running this UAT report will now request the package’s fixed[\s\S]*consume supplier credits/,
  "The UI must make the billable execution step explicit.",
);
assert.match(
  conversionMigration,
  /create table public\.knowledge_factory_report_canvassing_conversions[\s\S]*unique references public\.knowledge_factory_report_results/,
  "Phase 4 must allow only one canvassing conversion for each completed report.",
);
assert.match(
  conversionMigration,
  /enable row level security[\s\S]*knowledge_factory_report_canvassing_conversions_read/,
  "Phase 4 conversion records must be protected by RLS.",
);
assert.match(
  conversionApi,
  /status: "converting"/,
  "Phase 4 must claim a conversion before creating the prospect.",
);
assert.match(
  conversionApi,
  /\.eq\("status", "ready"\)/,
  "Phase 4 must only claim a conversion that is ready.",
);
assert.match(
  conversionApi,
  /Supplier owner data was reviewed in the report and has not been copied into this prospect/,
  "Phase 4 must not silently copy supplier owner data into canvassing prospects.",
);
assert.match(
  conversionApi,
  /source: "Knowledge Factory Property Report"[\s\S]*canvassing_method: "Area Farming"/,
  "Converted prospects must retain their controlled property-report source.",
);
assert.match(
  conversionPanel,
  /Create canvassing prospect[\s\S]*not copied from the supplier report/,
  "The conversion UI must require an explicit, privacy-safe prospect review.",
);
assert.match(
  commercialControlsMigration,
  /create table public\.knowledge_factory_package_commercial_policies[\s\S]*enable row level security/,
  "Phase 5 package commercial controls must be stored behind RLS.",
);
assert.match(
  commercialControlsMigration,
  /revoke all on public\.knowledge_factory_package_commercial_policies[\s\S]*grant select/,
  "Package commercial-control writes must remain server-only.",
);
assert.match(
  commercialControlsMigration,
  /controlled_uat[\s\S]*pilot[\s\S]*suspended/,
  "Phase 5 must model a controlled UAT, pilot, and suspended state.",
);
assert.match(
  commercialControlsMigration,
  /knowledge_factory_audit_log_operation_check[\s\S]*commercial_policy/,
  "Phase 5 control changes must use their own auditable operation type.",
);
assert.match(
  commercialControlsApi,
  /monthly_credit_cap[\s\S]*monthly_report_cap[\s\S]*daily_report_cap_per_user/,
  "The commercial-controls API must own credit, monthly-volume, and daily-user limits.",
);
assert.match(
  purchaseApi,
  /assertPackageCommercialPolicy[\s\S]*supplierReport/,
  "The package execution route must enforce commercial controls before supplier data is requested.",
);
assert.match(
  purchaseApi,
  /complete-query UAT cost validation/,
  "Execution must use validated UAT evidence for its commercial preflight.",
);
assert.match(
  purchaseApi,
  /error\?\.retryable[\s\S]*confirmed_pending_execution/,
  "A commercial block must leave the no-charge report intent available to retry.",
);
assert.match(
  commercialControlsPanel,
  /Commercial release controls[\s\S]*Limits are checked on the server before a package can request\s+supplier data/,
  "Operations must expose the commercial-control purpose clearly.",
);
assert.match(
  operations,
  /KnowledgeFactoryPackageCommercialPolicyPanel/,
  "Phase 5 package controls must be available in Operations.",
);
assert.match(
  pilotMigration,
  /create table public\.knowledge_factory_package_pilot_enrolments[\s\S]*enable row level security/,
  "Phase 6 pilot enrolments must be stored behind RLS.",
);
assert.match(
  pilotMigration,
  /candidate[\s\S]*active[\s\S]*paused[\s\S]*cardinality\(allowed_user_ids\) <= 5/,
  "Phase 6 must keep a small named-user cohort with a pause state.",
);
assert.match(
  pilotMigration,
  /revoke all on public\.knowledge_factory_package_pilot_enrolments/,
  "Pilot enrolment writes must remain server-only.",
);
assert.match(
  pilotApi,
  /Set the Phase 5 package commercial controls to Pilot[\s\S]*KNOWLEDGE_FACTORY_PILOT_ENABLED/,
  "Pilot activation must require both the private gate and the Phase 5 pilot policy.",
);
assert.match(
  pilotApi,
  /active named user with property-report permission/,
  "Only active report-entitled users may be included in the pilot cohort.",
);
assert.match(
  purchaseApi,
  /assertPilotAccess[\s\S]*supplierReport/,
  "The supplier route must enforce named-user pilot access before report execution.",
);
assert.match(
  purchaseApi,
  /restricted to the UAT supplier endpoint[\s\S]*active named-user package pilot/,
  "The Phase 6 pilot must stay on the UAT supplier endpoint and require an active cohort record.",
);
assert.match(
  pilotPanel,
  /Phase 6: named-user pilot[\s\S]*maximum of \{state\.limit\} named users/,
  "Operations must present the named-user pilot boundary.",
);
assert.match(
  operations,
  /KnowledgeFactoryPackagePilotPanel/,
  "The Phase 6 pilot panel must be available in Operations.",
);

console.log("knowledge factory canvassing cost matrix checks passed");
