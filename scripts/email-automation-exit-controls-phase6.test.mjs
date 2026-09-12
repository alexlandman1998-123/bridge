import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260911174652_email_automation_exit_controls_phase6.sql"),
  "utf8",
);
const studio = readFileSync(
  resolve("the-it-guy/src/components/marketing/EmailCampaigns.jsx"),
  "utf8",
);

for (const item of [
  "email_automation_exit_contact_by_email",
  "set status = 'exited'",
  "set status = 'suppressed'",
  "email_automation_preference_exit_trigger",
  "after update of marketing_consent_status on public.contact_marketing_preferences",
  "email_automation_suppression_exit_trigger",
  "after insert or update of reason on public.email_suppressions",
  "marketing_consent_status <> 'opted_in'",
  "count(e.id) filter (where e.status = 'exited')::integer as exited",
  "with (security_invoker = true)",
  "revoke all on function public.email_automation_exit_contact_by_email",
]) {
  assert.ok(migration.includes(item), `Missing exit-control contract: ${item}`);
}
assert.ok(studio.includes("exited</span>"), "Missing exited-journey operational metric.");
console.log("Email automation exit controls Phase 6 checks passed.");
