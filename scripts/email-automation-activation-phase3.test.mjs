import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260911173425_email_automation_activation_phase3.sql"),
  "utf8",
);
const worker = readFileSync(
  resolve("supabase/functions/email-automation-worker/index.ts"),
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
  "email_automation_set_journey_status",
  "public.email_campaign_can_send",
  "p_status not in ('active', 'paused', 'archived')",
  "c.approval_required and c.approval_status <> 'approved'",
  "i.verification_status is distinct from 'verified'",
  "email_automation_journey_status_guard",
  "app.email_automation_status_transition",
  "j.status = 'active'",
  "email_automation_claim_enrolments",
  "email_automation_claim_deliveries",
  "grant execute on function public.email_automation_set_journey_status(uuid, text) to authenticated",
]) {
  assert.ok(migration.includes(item), `Missing safe activation contract: ${item}`);
}

for (const item of [
  "approval_required", "approval_status", "campaign.approval_required && campaign.approval_status !== \"approved\"",
  "journey?.status !== \"active\"",
]) {
  assert.ok(worker.includes(item), `Missing delivery-time activation gate: ${item}`);
}

assert.ok(service.includes("getEmailAutomationJourneys"), "Missing journey status workspace read.");
assert.ok(service.includes("setEmailAutomationJourneyStatus"), "Missing journey status command.");
assert.ok(studio.includes("Journey status"), "Missing journey activation control UI.");
assert.ok(studio.includes("setJourneyStatus(journey.id, \"active\")"), "Missing activate action.");
assert.ok(studio.includes("setJourneyStatus(journey.id, \"paused\")"), "Missing pause action.");

console.log("Email automation activation Phase 3 checks passed.");
