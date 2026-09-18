import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260918120610_knowledge_factory_package_cost_recipes_phase2.sql",
    import.meta.url,
  ),
  "utf8",
);
const recipes = await readFile(
  new URL("../api/knowledge-factory/package-report-recipes.js", import.meta.url),
  "utf8",
);
const costs = await readFile(
  new URL("../api/knowledge-factory/cost-matrix.js", import.meta.url),
  "utf8",
);
const products = await readFile(
  new URL("../api/knowledge-factory/report-products.js", import.meta.url),
  "utf8",
);
const execution = await readFile(
  new URL("../api/knowledge-factory/report-purchase-intents.js", import.meta.url),
  "utf8",
);
const panel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryCostMatrixPanel.jsx",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  migration,
  /package_basic_v1[\s\S]*package_full_v1[\s\S]*cost_validation_recipe_id/,
  "Phase 2 must persist a complete-query validation recipe for each package.",
);
assert.match(
  recipes,
  /PACKAGE_COST_RECIPE_IDS[\s\S]*package_basic_v1[\s\S]*package_full_v1/,
  "Package recipe identifiers must be server-owned.",
);
assert.match(
  recipes,
  /valuationReason[\s\S]*transfers\(first: 5\)[\s\S]*bondDateRegister/,
  "The Full recipe must cover the agreed valuation, transfer and finance-indicator scope.",
);
assert.doesNotMatch(
  recipes,
  /bondAmount|bondHolder|bondNumber|sellerName/,
  "The exact Full package recipe must not request excluded detailed-finance or historic-party fields.",
);
assert.match(
  costs,
  /package_full_v1[\s\S]*"GraphQL-Cost": "validate"/,
  "Package validation must remain a cost-only supplier request.",
);
assert.match(
  products,
  /costValidationRecipeId: "package_basic_v1"[\s\S]*costValidationRecipeId: "package_full_v1"/,
  "Products must require their complete-query validation evidence.",
);
assert.match(
  execution,
  /packageReportQuery\(productId, "CanvassingReport"\)/,
  "Paid execution must use the same server-owned query shape that was validated.",
);
assert.match(
  panel,
  /Full package - exact query[\s\S]*Required before release/,
  "Operations must make complete package validation visible before release.",
);

console.log("Knowledge Factory Phase 2 package-cost recipe checks passed");
