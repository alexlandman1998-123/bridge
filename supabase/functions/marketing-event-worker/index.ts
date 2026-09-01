import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Row = Record<string, unknown>;
// The project does not keep generated database types for Edge Functions. The
// worker is service-role only, so keep the client untyped rather than letting
// supabase-js infer a `never` schema.
type AdminClient = any;

const json = (status: number, body: Row) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const asRow = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

function isServiceRoleRequest(request: Request) {
  const token = text(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1];
  if (!payload) return false;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))?.role === "service_role";
  } catch {
    return false;
  }
}

function splitName(fullName: string) {
  const [firstName = "Guest", ...rest] = text(fullName).split(/\s+/);
  return { firstName, lastName: rest.join(" ") || null };
}

function errorMessage(error: unknown) {
  const record = asRow(error);
  return text(record.message || record.error || error) || "Worker operation failed.";
}

async function ensureCrmLead(client: AdminClient, handoff: Row) {
  const event = asRow(handoff.event);
  const rsvp = asRow(handoff.rsvp);
  const organisationId = text(handoff.organisation_id);
  const email = text(rsvp.email).toLowerCase();
  const mobile = text(rsvp.mobile);
  const { firstName, lastName } = splitName(text(rsvp.full_name));

  let contact: Row | null = null;
  if (email) {
    const { data, error } = await client.from("contacts").select("contact_id").eq("organisation_id", organisationId).ilike("email", email).limit(1).maybeSingle();
    if (error) throw error;
    contact = data;
  }
  if (!contact && mobile) {
    const { data, error } = await client.from("contacts").select("contact_id").eq("organisation_id", organisationId).eq("phone", mobile).limit(1).maybeSingle();
    if (error) throw error;
    contact = data;
  }
  if (!contact) {
    const { data, error } = await client.from("contacts").insert({ organisation_id: organisationId, first_name: firstName, last_name: lastName, email: email || null, phone: mobile || null, contact_type: "Lead", notes: `Registered for ${text(event.title)}.` }).select("contact_id").single();
    if (error) throw error;
    contact = data;
  }

  const contactId = text(contact?.contact_id);
  let lead: Row | null = null;
  if (contactId) {
    const { data, error } = await client.from("leads").select("lead_id").eq("organisation_id", organisationId).eq("contact_id", contactId).not("status", "in", "(Closed,Lost)").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    lead = data;
  }
  if (!lead) {
    const source = text(event.event_type) === "launch" ? "Launch RSVP" : "Show Day RSVP";
    const note = [`Registered for ${text(event.title)}.`, text(rsvp.note), `Guests: ${Number(rsvp.guest_count || 1)}.`].filter(Boolean).join("\n");
    const { data, error } = await client.from("leads").insert({ organisation_id: organisationId, contact_id: contactId, lead_category: "buyer", lead_direction: "Inbound", lead_source: source, stage: "New Lead", status: "New Lead", priority: "High", listing_id: text(event.subject_type) === "listing" ? text(event.subject_id) || null : null, enquired_listing_id: text(event.subject_type) === "listing" ? text(event.subject_id) || null : null, enquired_property_title: text(event.subject_label) || null, enquired_property_address: text(event.address || event.location) || null, source_reference_id: `marketing-event-rsvp:${text(handoff.rsvp_id)}`, notes: note, raw_enquiry_payload: { marketing_event_rsvp_id: handoff.rsvp_id, event_id: handoff.event_id } }).select("lead_id").single();
    if (error) throw error;
    lead = data;
  }

  const leadId = text(lead?.lead_id);
  const title = `Follow up after ${text(event.title)}`;
  const { data: existingTask, error: taskLookupError } = await client.from("tasks").select("task_id").eq("organisation_id", organisationId).eq("lead_id", leadId).eq("title", title).limit(1).maybeSingle();
  if (taskLookupError) throw taskLookupError;
  if (!existingTask) {
    const dueDate = text(event.starts_at) ? new Date(text(event.starts_at)).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const { error } = await client.from("tasks").insert({ organisation_id: organisationId, lead_id: leadId, title, description: `RSVP received for ${text(event.event_type) === "launch" ? "launch" : "show day"}. Confirm attendance and interest after the event.`, due_date: dueDate, status: "Pending", priority: "High", metadata: { source: "marketing_event_rsvp", event_id: handoff.event_id, rsvp_id: handoff.rsvp_id } });
    if (error) throw error;
  }
  return { leadId, contactId };
}

async function processHandoffs(client: AdminClient, limit: number) {
  const { data, error } = await client.from("marketing_event_rsvp_handoffs").select("*, event:marketing_events(*), rsvp:marketing_event_rsvps(*)").eq("status", "queued").order("created_at", { ascending: true }).limit(limit);
  if (error) throw error;
  let processed = 0;
  let failed = 0;
  for (const handoff of data || []) {
    const { data: claimed } = await client.from("marketing_event_rsvp_handoffs").update({ status: "processing", attempts: Number(handoff.attempts || 0) + 1, updated_at: new Date().toISOString() }).eq("id", handoff.id).eq("status", "queued").select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const { leadId, contactId } = await ensureCrmLead(client, handoff);
      const now = new Date().toISOString();
      const { error: rsvpError } = await client.from("marketing_event_rsvps").update({ crm_lead_id: leadId, crm_contact_id: contactId, crm_processed_at: now, crm_error: null }).eq("id", handoff.rsvp_id);
      if (rsvpError) throw rsvpError;
      const { error: outboxError } = await client.from("marketing_event_rsvp_messages").upsert({ organisation_id: handoff.organisation_id, event_id: handoff.event_id, rsvp_id: handoff.rsvp_id, crm_lead_id: leadId, message_type: "confirmation", channel: "email", status: "queued", scheduled_for: now, idempotency_key: `marketing-event-rsvp:${handoff.rsvp_id}:confirmation:email` }, { onConflict: "rsvp_id,message_type,channel", ignoreDuplicates: false });
      if (outboxError) throw outboxError;
      const { error: handoffError } = await client.from("marketing_event_rsvp_handoffs").update({ status: "processed", processed_at: now, last_error: null, updated_at: now }).eq("id", handoff.id);
      if (handoffError) throw handoffError;
      processed += 1;
    } catch (error) {
      failed += 1;
      await client.from("marketing_event_rsvp_handoffs").update({ status: "failed", last_error: errorMessage(error), updated_at: new Date().toISOString() }).eq("id", handoff.id);
      await client.from("marketing_event_rsvps").update({ crm_error: errorMessage(error) }).eq("id", handoff.rsvp_id);
    }
  }
  return { processed, failed };
}

async function dispatchMessages(client: AdminClient, serviceRoleKey: string, projectUrl: string, limit: number) {
  const { data, error } = await client.from("marketing_event_rsvp_messages").select("*, event:marketing_events(*), rsvp:marketing_event_rsvps(*)").eq("status", "queued").lte("scheduled_for", new Date().toISOString()).order("scheduled_for", { ascending: true }).limit(limit);
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const message of data || []) {
    const { data: claimed } = await client.from("marketing_event_rsvp_messages").update({ status: "sending", dispatch_attempts: Number(message.dispatch_attempts || 0) + 1, last_attempt_at: new Date().toISOString(), error_message: null }).eq("id", message.id).eq("status", "queued").select("id").maybeSingle();
    if (!claimed) continue;
    const event = asRow(message.event);
    const rsvp = asRow(message.rsvp);
    const reminder = message.message_type === "morning_reminder";
    try {
      const response = await fetch(`${projectUrl.replace(/\/$/, "")}/functions/v1/send-email`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey }, body: JSON.stringify({ type: "lead_acknowledgement", to: rsvp.email, recipientName: rsvp.full_name, organisationId: message.organisation_id, source: `${event.event_type === "launch" ? "Launch" : "Show Day"} RSVP: ${event.title}`, originalMessage: reminder ? `${event.title} is happening this morning.` : `You are registered for ${event.title} on ${event.starts_at || "the scheduled date"}.`, customResponseText: reminder ? `Good morning. We look forward to welcoming you today at ${event.address || event.location || "the event venue"}.` : `Thank you for registering. We look forward to welcoming you at ${event.address || event.location || "the event venue"}.`, idempotencyKey: message.idempotency_key }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.error) throw new Error(text(body?.error) || `send-email returned HTTP ${response.status}`);
      const { error: updateError } = await client.from("marketing_event_rsvp_messages").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: body.providerMessageId || body.emailId || null, error_message: null }).eq("id", message.id);
      if (updateError) throw updateError;
      sent += 1;
    } catch (error) {
      failed += 1;
      await client.from("marketing_event_rsvp_messages").update({ status: "failed", error_message: errorMessage(error) }).eq("id", message.id);
    }
  }
  return { sent, failed };
}

Deno.serve(async (request) => {
  if (!isServiceRoleRequest(request)) return json(403, { error: "Service-role authorization is required." });
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!projectUrl || !serviceRoleKey) return json(500, { error: "Missing Supabase worker configuration." });
  const client = createClient(projectUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 100);
  try {
    const handoffs = await processHandoffs(client, limit);
    const messages = await dispatchMessages(client, serviceRoleKey, projectUrl, limit);
    return json(200, { ok: true, handoffs, messages });
  } catch (error) {
    return json(500, { ok: false, error: errorMessage(error) });
  }
});
