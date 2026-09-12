import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260911173812_email_automation_operations_phase4.sql"),
  "utf8",
);
const service = readFileSync(
  resolve("the-it-guy/src/services/emailCampaignService.js"),
  "utf8",
);
const studio = readFileSync(
  resolve("the-it-guy/src/components/marketing/EmailCampaigns.jsx"),
  "utf8",
);

for (const item of [
  "create or replace view public.email_automation_journey_health",
  "with (security_invoker = true)",
  "queued_deliveries",
  "failed_enrolments",
  "failed_deliveries",
  "count(d.id) filter (where d.status = 'bounced')",
  "count(d.id) filter (where d.status = 'complained')",
  "grant select on public.email_automation_journey_health to authenticated",
]) {
  assert.ok(migration.includes(item), `Missing operational health contract: ${item}`);
}

assert.ok(service.includes('from("email_automation_journey_health")'), "Missing journey health query.");
assert.ok(service.includes("healthByJourney"), "Journey health is not joined to the workspace model.");
for (const item of ["in progress", "needs attention", "queued for the next worker run"]) {
  assert.ok(studio.includes(item), `Missing operations UI: ${item}`);
}

console.log("Email automation operations Phase 4 checks passed.");
