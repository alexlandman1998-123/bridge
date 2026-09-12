import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const text = (value: unknown) => String(value || "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function safeHtml(html: string) {
  // The editor stores structured blocks, but the provider receives only a
  // defensive subset of HTML. Tracking/unsubscribe markup is appended below.
  return text(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
}

function merge(html: string, values: Record<string, unknown>) {
  const conditional = html.replace(/\{\{#if\s+(role_type|area|lead_stage)=([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, expected, body) => text(values[key]).toLowerCase() === text(expected).trim().toLowerCase() ? body : "");
  return conditional.replace(/\{\{(first_name|last_name|full_name|agent_name|agency_name|branch_name|role_type|area|lead_stage)\}\}/g, (_, key) => text(values[key]));
}

async function trackLinks(db: any, html: string, campaign: any, recipient: any, functionBaseUrl: string) {
  const links = new Map<string, string>();
  const rewritten = html.replace(/(<a\b[^>]*\bhref\s*=\s*["'])(https?:\/\/[^"'\s>]+)(["'][^>]*>)/gi, (match, prefix, target, suffix) => {
    if (/\/email\/unsubscribe\b/i.test(target)) return match;
    const key = `${campaign.id}:${target}`;
    links.set(key, target);
    return `${prefix}__ARCH9_TRACK_${key}__${suffix}`;
  });
  let output = rewritten;
  for (const [key, target] of links) {
    const { data, error } = await db.from("email_campaign_links").upsert({ organisation_id: campaign.organisation_id, campaign_id: campaign.id, target_url: target }, { onConflict: "campaign_id,target_url" }).select("tracking_token").single();
    if (error || !data?.tracking_token) continue;
    const trackingUrl = `${functionBaseUrl}?l=${encodeURIComponent(data.tracking_token)}&r=${encodeURIComponent(recipient.id)}&t=${encodeURIComponent(recipient.tracking_token)}`;
    output = output.replace(`__ARCH9_TRACK_${key}__`, trackingUrl);
  }
  return output;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  if (text(req.headers.get("x-arch9-email-worker-secret")) !== text(Deno.env.get("EMAIL_CAMPAIGN_WORKER_SECRET"))) return json(401, { error: "Worker authentication failed." });
  const url = text(Deno.env.get("SUPABASE_URL"));
  const key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const resendKey = text(Deno.env.get("RESEND_API_KEY"));
  const publicUrl = text(Deno.env.get("ARCH9_PUBLIC_URL")) || "https://app.arch9.co.za";
  if (!url || !key || !resendKey) return json(500, { error: "Email worker is not configured." });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const { data: jobs, error: jobsError } = await db.rpc("email_campaign_claim_jobs", { p_limit: 10 });
  if (jobsError) return json(500, { error: jobsError.message });
  const claimedJobs = (jobs || []) as any[];
  const campaignIds = claimedJobs.map((job) => job.campaign_id);
  if (!campaignIds.length) return json(200, { processed: 0 });
  const { data: campaigns, error } = await db.from("email_campaigns")
    .select("id,organisation_id,subject,preview_text,html,sender_identity_id,status,experiment_json,email_sender_identities(display_name,from_email,reply_to_email)")
    .in("id", campaignIds).in("status", ["sending", "scheduled"]);
  if (error) return json(500, { error: error.message });
  let processed = 0;
  for (const campaign of campaigns || []) {
    const job = claimedJobs.find((item) => item.campaign_id === campaign.id);
    if (campaign.status === "scheduled") await db.from("email_campaigns").update({ status: "sending", sending_started_at: now }).eq("id", campaign.id).eq("status", "scheduled");
    // A/B allocation and winner selection happen server-side. Recipients in
    // the holdout never reach Resend until a winner is selected.
    let experiment: any = null;
    if (campaign.experiment_json?.enabled) {
      const { data: currentExperiment } = await db.from("email_campaign_experiments").select("*").eq("campaign_id", campaign.id).maybeSingle();
      if (currentExperiment?.status === "draft") {
        const { error: allocateError } = await db.rpc("email_campaign_experiment_allocate", { p_campaign_id: campaign.id });
        if (allocateError) {
          if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "failed", last_error: `Experiment allocation failed: ${allocateError.message}` }).eq("id", job.id);
          continue;
        }
      }
      const { data: allocatedExperiment } = await db.from("email_campaign_experiments").select("*").eq("campaign_id", campaign.id).maybeSingle();
      experiment = allocatedExperiment;
      if (experiment?.status === "running" && experiment.decision_after && new Date(experiment.decision_after) <= new Date(now)) {
        const { error: decisionError } = await db.rpc("email_campaign_experiment_decide", { p_campaign_id: campaign.id });
        if (decisionError) {
          if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "failed", last_error: `Experiment decision failed: ${decisionError.message}` }).eq("id", job.id);
          continue;
        }
        const { data: decidedExperiment } = await db.from("email_campaign_experiments").select("*").eq("campaign_id", campaign.id).maybeSingle();
        experiment = decidedExperiment;
      }
    }
    const { data: policy } = await db.from("email_sending_policies")
      .select("max_recipients_per_worker_run,daily_recipient_limit,paused_at").eq("organisation_id", campaign.organisation_id).maybeSingle();
    if (policy?.paused_at) {
      if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "failed", last_error: "Organisation sending policy is paused." }).eq("id", job.id);
      continue;
    }
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: sentToday } = await db.from("email_campaign_recipients").select("id", { count: "exact", head: true })
      .eq("organisation_id", campaign.organisation_id).gte("sent_at", startOfDay.toISOString()).not("sent_at", "is", null);
    const dailyRemaining = Math.max(0, Number(policy?.daily_recipient_limit || 500) - Number(sentToday || 0));
    const batchLimit = Math.min(Number(policy?.max_recipients_per_worker_run || 50), dailyRemaining);
    if (!batchLimit) {
      if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "queued", locked_at: null, last_error: "Daily recipient limit reached." }).eq("id", job.id);
      continue;
    }
    const { data: recipients, error: recipientClaimError } = await db.rpc("email_campaign_claim_recipients", {
      p_campaign_id: campaign.id, p_limit: batchLimit,
      p_variants: experiment?.status === "running" ? ["control", "variant"] : null,
    });
    if (recipientClaimError) {
      if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "failed", last_error: `Recipient claim failed: ${recipientClaimError.message}` }).eq("id", job.id).eq("status", "running");
      continue;
    }
    for (const recipient of recipients || []) {
      // Recheck suppressions immediately before the provider call. This closes
      // the race between audience snapshot and a one-click unsubscribe.
      const { data: suppression } = await db.from("email_suppressions").select("id").eq("organisation_id", campaign.organisation_id).eq("email", recipient.email).maybeSingle();
      const { data: preference } = await db.from("contact_marketing_preferences").select("unsubscribe_token,marketing_consent_status").eq("organisation_id", campaign.organisation_id).eq("email", recipient.email).maybeSingle();
      if (suppression || preference?.marketing_consent_status !== "opted_in") {
        await db.from("email_campaign_recipients").update({ status: "suppressed", locked_at: null, error_reason: "suppressed before dispatch" }).eq("id", recipient.id);
        continue;
      }
      const deliveryKey = `campaign:${recipient.id}`;
      const { data: quotaGranted, error: quotaError } = await db.rpc("email_delivery_reserve_quota", { p_organisation_id: campaign.organisation_id, p_delivery_key: deliveryKey, p_delivery_kind: "campaign" });
      if (quotaError || !quotaGranted) {
        await db.from("email_campaign_recipients").update({ status: "queued", locked_at: null, next_attempt_at: new Date(Date.now() + 60_000).toISOString(), error_reason: quotaError?.message || "Daily recipient limit reached." }).eq("id", recipient.id).eq("status", "sending");
        continue;
      }
      const identity: any = Array.isArray(campaign.email_sender_identities) ? campaign.email_sender_identities[0] : campaign.email_sender_identities;
      const unsubscribeUrl = `${publicUrl.replace(/\/$/, "")}/email/unsubscribe?token=${encodeURIComponent(text(preference?.unsubscribe_token))}`;
      const footer = `<hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0 16px"><p style="font:12px Arial;color:#667085">You received this marketing email from ${text(identity?.display_name)}. <a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
      const html = await trackLinks(db, merge(safeHtml(campaign.html), recipient.recipient_snapshot || {}) + footer, campaign, recipient, `${url.replace(/\/$/, "")}/functions/v1/email-campaign-track`);
      const subject = experiment && recipient.experiment_variant === "variant" && text(experiment.variant_subject) ? text(experiment.variant_subject) : campaign.subject;
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json", "Idempotency-Key": `campaign:${campaign.id}:recipient:${recipient.id}` }, body: JSON.stringify({ from: `${text(identity?.display_name)} <${text(identity?.from_email)}>`, reply_to: text(identity?.reply_to_email), to: [recipient.email], subject, html, text: `${text(campaign.preview_text)}\n\nUnsubscribe: ${unsubscribeUrl}`, tags: [{ name: "arch9_campaign_id", value: campaign.id }, { name: "arch9_recipient_id", value: recipient.id }, { name: "arch9_experiment_variant", value: text(recipient.experiment_variant) }] }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.id) {
        await db.from("email_campaign_recipients").update({ status: "sent", provider_message_id: body.id, sent_at: new Date().toISOString(), error_reason: null, locked_at: null }).eq("id", recipient.id);
        await db.rpc("email_delivery_set_reservation", { p_delivery_key: deliveryKey, p_status: "sent" });
        await db.from("email_events").insert({ organisation_id: campaign.organisation_id, campaign_id: campaign.id, recipient_id: recipient.id, provider: "resend", provider_event_id: `send:${body.id}`, event_type: "sent", payload: body });
      } else {
        const retry = Number(recipient.send_attempts || 0) < 3;
        await db.from("email_campaign_recipients").update({ status: retry ? "queued" : "failed", locked_at: null, next_attempt_at: retry ? new Date(Date.now() + Math.min(60, 2 ** Number(recipient.send_attempts || 0)) * 60_000).toISOString() : new Date().toISOString(), error_reason: text(body?.message) || `Resend HTTP ${response.status}` }).eq("id", recipient.id);
        await db.rpc("email_delivery_set_reservation", { p_delivery_key: deliveryKey, p_status: "released" });
      }
      processed += 1;
    }
    const { count: queued } = await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["queued", "sending"]);
    if (!queued) {
      const { count: failed } = await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).eq("status", "failed");
      await db.from("email_campaigns").update({ status: failed ? "partially_failed" : "sent", sent_at: new Date().toISOString() }).eq("id", campaign.id);
      if (experiment?.status === "winner_selected") await db.from("email_campaign_experiments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("campaign_id", campaign.id);
      if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
    } else if (job) {
      // Release the job for the next bounded batch; one invocation never
      // tries to monopolise the provider or a Worker isolate.
      await db.from("email_campaign_dispatch_jobs").update({ status: "queued", locked_at: null }).eq("id", job.id);
    }
  }
  return json(200, { processed });
});
