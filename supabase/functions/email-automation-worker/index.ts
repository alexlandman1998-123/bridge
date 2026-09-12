import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const text = (value: unknown) => String(value || "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const retryAt = (attempts: number) => new Date(Date.now() + Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000).toISOString();
const safeHtml = (html: string) => text(html).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<iframe[\s\S]*?<\/iframe>/gi, "").replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "").replace(/javascript\s*:/gi, "");
const merge = (html: string, values: Record<string, unknown>) => html.replace(/\{\{(first_name|last_name|full_name|role_type|area|lead_stage)\}\}/g, (_, key) => text(values[key]));
const matchesEntryFilter = (filter: Record<string, unknown>, payload: Record<string, unknown>) => Object.entries(filter || {}).every(([key, value]) => text(payload[key]) === text(value));

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  if (text(req.headers.get("x-arch9-email-worker-secret")) !== text(Deno.env.get("EMAIL_CAMPAIGN_WORKER_SECRET"))) return json(401, { error: "Worker authentication failed." });
  const url = text(Deno.env.get("SUPABASE_URL")); const key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")); const resendKey = text(Deno.env.get("RESEND_API_KEY"));
  const publicUrl = text(Deno.env.get("ARCH9_PUBLIC_URL"));
  if (!url || !key || !resendKey || !publicUrl) return json(500, { error: "Automation worker is not configured." });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let processed = 0;

  const { data: events } = await db.rpc("email_automation_claim_events", { p_limit: 25 });
  for (const event of events || []) {
    try {
      const { data: journeys, error } = await db.from("email_automation_journeys").select("id,entry_filter").eq("organisation_id", event.organisation_id).eq("status", "active").eq("trigger_key", event.event_key);
      if (error) throw error;
      for (const journey of journeys || []) if ((!event.payload?.journey_id || event.payload.journey_id === journey.id) && matchesEntryFilter(journey.entry_filter || {}, event.payload || {})) await db.rpc("email_automation_enrol", { p_journey_id: journey.id, p_contact_id: event.contact_id, p_event_id: event.id, p_payload: event.payload || {} });
      await db.from("email_automation_events").update({ status: "processed", processed_at: new Date().toISOString(), locked_at: null }).eq("id", event.id).eq("status", "processing"); processed += 1;
    } catch (cause) {
      const failed = Number(event.attempts || 0) >= 3;
      await db.from("email_automation_events").update({ status: failed ? "failed" : "queued", next_run_at: retryAt(Number(event.attempts || 0)), locked_at: null, last_error: text((cause as Error).message) }).eq("id", event.id);
    }
  }

  const { data: enrolments } = await db.rpc("email_automation_claim_enrolments", { p_limit: 25 });
  for (const enrolment of enrolments || []) {
    try {
      const { data: step, error } = await db.from("email_automation_steps").select("*").eq("journey_id", enrolment.journey_id).eq("position", enrolment.current_step).maybeSingle();
      if (error) throw error;
      if (!step) { await db.from("email_automation_enrolments").update({ status: "completed", completed_at: new Date().toISOString(), locked_at: null }).eq("id", enrolment.id); continue; }
      if (step.step_type === "delay") {
        await db.from("email_automation_enrolments").update({ status: "waiting", current_step: Number(enrolment.current_step) + 1, next_run_at: new Date(Date.now() + Number(step.delay_minutes) * 60_000).toISOString(), locked_at: null }).eq("id", enrolment.id);
      } else {
        const { error: deliveryError } = await db.from("email_automation_deliveries").insert({ organisation_id: enrolment.organisation_id, enrolment_id: enrolment.id, campaign_id: step.campaign_id, contact_id: enrolment.contact_id });
        if (deliveryError && deliveryError.code !== "23505") throw deliveryError;
        await db.from("email_automation_enrolments").update({ status: "completed", completed_at: new Date().toISOString(), locked_at: null }).eq("id", enrolment.id);
      }
      processed += 1;
    } catch (cause) {
      const failed = Number(enrolment.attempts || 0) >= 3;
      await db.from("email_automation_enrolments").update({ status: failed ? "failed" : "queued", next_run_at: retryAt(Number(enrolment.attempts || 0)), locked_at: null, last_error: text((cause as Error).message) }).eq("id", enrolment.id);
    }
  }

  const { data: deliveries } = await db.rpc("email_automation_claim_deliveries", { p_limit: 25 });
  for (const delivery of deliveries || []) {
    try {
      const [{ data: campaign, error: campaignError }, { data: contact, error: contactError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
        db.from("email_campaigns").select("subject,preview_text,html,subscription_type_id,status,approval_required,approval_status,email_sender_identities(display_name,from_email,reply_to_email,verification_status)").eq("id", delivery.campaign_id).eq("organisation_id", delivery.organisation_id).single(),
        db.from("email_marketing_contacts").select("email,first_name,last_name,full_name,role_type,area,lead_stage,is_valid_email").eq("id", delivery.contact_id).single(),
        db.from("email_automation_enrolments").select("email_automation_journeys(status)").eq("id", delivery.enrolment_id).single(),
      ]);
      if (campaignError || contactError || enrolmentError || !campaign || !contact || !enrolment) throw new Error("Campaign, contact, or journey is unavailable.");
      const journey: any = Array.isArray(enrolment.email_automation_journeys) ? enrolment.email_automation_journeys[0] : enrolment.email_automation_journeys;
      if (journey?.status !== "active") {
        await db.from("email_automation_deliveries").update({ status: "queued", locked_at: null, next_run_at: new Date(Date.now() + 300_000).toISOString(), last_error: "Journey is paused." }).eq("id", delivery.id);
        continue;
      }
      const { data: currentPreference } = await db.from("contact_marketing_preferences").select("unsubscribe_token,marketing_consent_status").eq("organisation_id", delivery.organisation_id).eq("email", contact.email).maybeSingle();
      const { data: currentSuppression } = await db.from("email_suppressions").select("id").eq("organisation_id", delivery.organisation_id).eq("email", contact.email).maybeSingle();
      const identity: any = Array.isArray(campaign.email_sender_identities) ? campaign.email_sender_identities[0] : campaign.email_sender_identities;
      const { data: subscription } = await db.from("contact_email_subscriptions").select("id").eq("organisation_id", delivery.organisation_id).eq("subscription_type_id", campaign.subscription_type_id).eq("email", contact.email).eq("status", "subscribed").maybeSingle();
      if (!contact.is_valid_email || currentSuppression || currentPreference?.marketing_consent_status !== "opted_in" || !subscription || identity?.verification_status !== "verified" || !["draft", "scheduled"].includes(text(campaign.status)) || (campaign.approval_required && campaign.approval_status !== "approved")) {
        await db.from("email_automation_deliveries").update({ status: "suppressed", locked_at: null, last_error: "Consent, subscription, approval, campaign-state, suppression or verified-sender gate failed." }).eq("id", delivery.id); continue;
      }
      const deliveryKey = `automation:${delivery.id}`;
      const { data: quotaGranted, error: quotaError } = await db.rpc("email_delivery_reserve_quota", { p_organisation_id: delivery.organisation_id, p_delivery_key: deliveryKey, p_delivery_kind: "automation" });
      if (quotaError || !quotaGranted) {
        await db.from("email_automation_deliveries").update({ status: "queued", locked_at: null, next_run_at: new Date(Date.now() + 60_000).toISOString(), last_error: quotaError?.message || "Daily recipient limit reached." }).eq("id", delivery.id);
        continue;
      }
      const unsubscribeUrl = `${publicUrl.replace(/\/$/, "")}/email/unsubscribe?token=${encodeURIComponent(text(currentPreference.unsubscribe_token))}`;
      const html = `${merge(safeHtml(campaign.html), contact)}<hr><p style="font:12px Arial;color:#667085">You received this marketing email from ${text(identity.display_name)}. <a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json", "idempotency-key": `automation:${delivery.id}` }, body: JSON.stringify({ from: `${text(identity.display_name)} <${text(identity.from_email)}>`, reply_to: text(identity.reply_to_email), to: [contact.email], subject: campaign.subject, html, text: `${text(campaign.preview_text)}\n\nUnsubscribe: ${unsubscribeUrl}`, tags: [{ name: "arch9_automation_delivery_id", value: delivery.id }] }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.id) throw new Error(text(body?.message) || `Resend HTTP ${response.status}`);
      await db.from("email_automation_deliveries").update({ status: "sent", provider_message_id: body.id, sent_at: new Date().toISOString(), locked_at: null, last_error: null }).eq("id", delivery.id);
      await db.rpc("email_delivery_set_reservation", { p_delivery_key: deliveryKey, p_status: "sent" }); processed += 1;
    } catch (cause) {
      const failed = Number(delivery.attempts || 0) >= 3;
      await db.from("email_automation_deliveries").update({ status: failed ? "failed" : "queued", next_run_at: retryAt(Number(delivery.attempts || 0)), locked_at: null, last_error: text((cause as Error).message) }).eq("id", delivery.id);
      await db.rpc("email_delivery_set_reservation", { p_delivery_key: `automation:${delivery.id}`, p_status: "released" });
    }
  }
  return json(200, { processed });
});
