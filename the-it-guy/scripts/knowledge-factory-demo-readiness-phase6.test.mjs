import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(
  new URL("../api/knowledge-factory/demo-readiness.js", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL(
    "../src/services/propertyIntelligence/knowledgeFactoryDemoReadinessService.js",
    import.meta.url,
  ),
  "utf8",
);
const panel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryDemoReadinessPanel.jsx",
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
  api,
  /Only a principal-level administrator can view UAT demo readiness/,
  "The readiness gate must be administrator-only.",
);
assert.match(
  api,
  /BASIC_OPERATIONS[\s\S]*FULL_OPERATIONS[\s\S]*basic_contract[\s\S]*full_contract/,
  "Readiness must require the correct evidenced operations for Basic and Full packages.",
);
for (const key of ["controlled_access", "packages", "commercial_controls", "quote_flow", "fica_boundary"]) {
  assert.match(api, new RegExp(`key: "${key}"`), `Readiness must include the ${key} gate.`);
}
assert.doesNotMatch(
  api,
  /fetch\(|KNOWLEDGE_FACTORY_(?:GRAPHQL|EMAIL|PASSWORD)|\.insert\(|\.update\(/,
  "Readiness must be read-only and must not call the supplier or mutate rollout data.",
);
assert.match(
  service,
  /\/api\/knowledge-factory\/demo-readiness/,
  "The browser must request the server-checked readiness result.",
);
assert.match(
  panel,
  /read-only release checklist[\s\S]*does not enable production or supplier FICA\/KYC verification/,
  "The UI must make the UAT-only boundary explicit.",
);
assert.match(
  operations,
  /KnowledgeFactoryDemoReadinessPanel[\s\S]*organisationId=\{organisationId\}/,
  "The Operations workspace must include the final readiness gate.",
);

console.log("Knowledge Factory Phase 6 demo-readiness checks passed");
