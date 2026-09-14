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
  /Five-case canvassing cost matrix/,
  "Operations must explain the five-case UAT matrix.",
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

console.log("knowledge factory canvassing cost matrix checks passed");
