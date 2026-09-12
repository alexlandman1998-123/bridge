import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260911174218_email_automation_manual_enrolment_phase5.sql"),
  "utf8",
);
const worker = readFileSync(resolve("supabase/functions/email-automation-worker/index.ts"), "utf8");
const service = readFileSync(resolve("the-it-guy/src/services/emailCampaignService.js"), "utf8");
const studio = readFileSync(resolve("the-it-guy/src/components/marketing/EmailCampaigns.jsx"), "utf8");

for (const item of [
  "add column if not exists initiated_by",
  "email_automation_enqueue_manual_event",
  "v_journey.status <> 'active' or v_journey.trigger_key <> 'manual'",
  "marketing_consent_status = 'opted_in'",
  "public.email_suppressions",
  "'journey_id', v_journey.id",
  "p_event_key = 'manual'",
  "grant execute on function public.email_automation_enqueue_manual_event(uuid, uuid) to authenticated",
]) {
  assert.ok(migration.includes(item), `Missing manual-enrolment safety contract: ${item}`);
}

assert.ok(worker.includes("event.payload?.journey_id"), "Manual event does not target one journey.");
assert.ok(service.includes("enqueueEmailAutomationManualEvent"), "Missing manual-enrolment service command.");
for (const item of ["MANUAL ENROLMENT", "Queue client", "activeManualJourneys"]) {
  assert.ok(studio.includes(item), `Missing manual-enrolment UI: ${item}`);
}

console.log("Email automation manual enrolment Phase 5 checks passed.");
