import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260918124032_knowledge_factory_package_pilot_guardrails_phase6.sql",
    import.meta.url,
  ),
  "utf8",
);
const pilotApi = await readFile(
  new URL("../api/knowledge-factory/package-pilot.js", import.meta.url),
  "utf8",
);
const executionApi = await readFile(
  new URL("../api/knowledge-factory/report-purchase-intents.js", import.meta.url),
  "utf8",
);
const pilotPanel = await readFile(
  new URL(
    "../src/components/canvassing/KnowledgeFactoryPackagePilotPanel.jsx",
    import.meta.url,
  ),
  "utf8",
);
const operationsService = await readFile(
  new URL(
    "../src/services/propertyIntelligence/knowledgeFactoryOperationsService.js",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  migration,
  /pilot_report_cap integer not null[\s\S]*pilot_credit_cap integer not null[\s\S]*pilot_ends_at timestamptz not null/,
  "A named pilot must have durable report, credit and expiry guardrails.",
);
assert.match(
  pilotApi,
  /MAX_PILOT_DAYS[\s\S]*pilotEndsAt[\s\S]*pilotUsage/,
  "Pilot activation must be time-bound and show actual usage.",
);
assert.match(
  executionApi,
  /pilot_ends_at[\s\S]*reportCount >= Number\(pilot\.pilot_report_cap[\s\S]*creditsConsumed \+ Number\(estimatedCredits[\s\S]*pilot\.pilot_credit_cap/,
  "The supplier execution boundary must enforce expiry, report cap and credit cap server-side.",
);
assert.match(
  pilotPanel,
  /Pilot report cap[\s\S]*Pilot supplier-credit cap[\s\S]*Pilot end date/,
  "Administrators must set and see every named-pilot boundary in Operations.",
);
assert.match(
  operationsService,
  /packagePilot[\s\S]*reportCap[\s\S]*creditCap[\s\S]*endsAt/,
  "Operations must expose a non-sensitive named-pilot scorecard.",
);

console.log("Knowledge Factory Phase 6 package-pilot guardrail checks passed");
