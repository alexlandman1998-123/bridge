import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260911173114_email_automation_event_integrations_phase2.sql"),
  "utf8",
);
const service = readFileSync(
  resolve("the-it-guy/src/services/emailCampaignService.js"),
  "utf8",
);

for (const item of [
  "email_automation_lead_listing_enquiry_event",
  "after insert or update of enquired_listing_id on public.leads",
  "c.source_id = new.contact_id",
  "'listing_enquiry'",
  "email_automation_listing_price_reduction_event",
  "after update of asking_price on public.listing_publication_data",
  "new.asking_price >= old.asking_price",
  "l.enquired_listing_id = new.listing_id",
  "'price_reduction'",
  "revoke all on function public.email_automation_lead_listing_enquiry_event()",
]) {
  assert.ok(migration.includes(item), `Missing Phase 2 event integration: ${item}`);
}

assert.ok(
  service.includes("export async function enqueueEmailAutomationEvent"),
  "Missing application integration for agent-controlled manual enrolment.",
);
assert.ok(
  service.includes('supabase.rpc("email_automation_enqueue_event"'),
  "Manual enrolment must use the authorised event enqueue RPC.",
);

console.log("Email automation event integrations Phase 2 checks passed.");
