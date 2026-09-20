import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(
  new URL("../api/knowledge-factory/fica-demo.js", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL(
    "../src/services/propertyIntelligence/knowledgeFactoryFicaService.js",
    import.meta.url,
  ),
  "utf8",
);
const workspace = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryFicaWorkspace.jsx",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  api,
  /\["list", "create", "update_checklist"\]/,
  "The FICA demo API must only expose its controlled case workflow actions.",
);
assert.match(
  api,
  /allowed_operations\?\.includes\("fica_kyc"\)[\s\S]*permission\.data\?\.allowed_operations\?\.includes\("fica_kyc"\)/,
  "FICA cases must require organisation and named-user FICA/KYC permission.",
);
assert.match(
  api,
  /input\.consentCaptured !== true[\s\S]*recorded FICA\/KYC consent/,
  "A demo case must be consent-first.",
);
assert.match(
  api,
  /verification_provider_status: "not_configured"/,
  "Opening a demo case must not claim an external verification was made.",
);
assert.doesNotMatch(
  api,
  /fetch\(|KNOWLEDGE_FACTORY_(?:GRAPHQL|EMAIL|PASSWORD)/,
  "The FICA demo endpoint must not call or receive supplier credentials.",
);
assert.match(
  service,
  /\/api\/knowledge-factory\/fica-demo[\s\S]*action: "update_checklist"/,
  "The browser must use the permission-checked demo API instead of writing FICA cases directly.",
);
assert.doesNotMatch(
  service,
  /supabase\.from\('knowledge_factory_fica_cases'\)/,
  "The browser must not update FICA cases directly.",
);
assert.match(
  workspace,
  /Controlled FICA\/KYC demo workspace[\s\S]*Party role[\s\S]*Open demo case/,
  "The user interface must make the demo boundary and party role explicit.",
);
assert.match(
  workspace,
  /External provider verification is intentionally unavailable in this demo/,
  "The UI must not make a provider verification appear available.",
);

console.log("Knowledge Factory Phase 5 FICA/KYC demo checks passed");
