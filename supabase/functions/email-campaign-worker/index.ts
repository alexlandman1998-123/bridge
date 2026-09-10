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
  return html.replace(/\{\{(first_name|last_name|full_name|agent_name|agency_name|branch_name)\}\}/g, (_, key) => text(values[key]));
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
  const { data: jobs, error: jobsError } = await db.from("email_campaign_dispatch_jobs")
    .select("id,campaign_id").eq("status", "queued").lte("run_at", now).order("run_at").limit(10);
  if (jobsError) return json(500, { error: jobsError.message });
  const campaignIds = (jobs || []).map((job) => job.campaign_id);
  if (!campaignIds.length) return json(200, { processed: 0 });
  const { data: campaigns, error } = await db.from("email_campaigns")
    .select("id,organisation_id,subject,preview_text,html,sender_identity_id,status,email_sender_identities(display_name,from_email,reply_to_email)")
    .in("id", campaignIds).in("status", ["sending", "scheduled"]);
  if (error) return json(500, { error: error.message });
  let processed = 0;
  for (const campaign of campaigns || []) {
    const job = (jobs || []).find((item) => item.campaign_id === campaign.id);
    if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "running", locked_at: now, attempts: 1 }).eq("id", job.id).eq("status", "queued");
    if (campaign.status === "scheduled") await db.from("email_campaigns").update({ status: "sending", sending_started_at: now }).eq("id", campaign.id).eq("status", "scheduled");
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
    const { data: recipients } = await db.from("email_campaign_recipients")
      .select("id,email,recipient_snapshot,send_attempts,tracking_token").eq("campaign_id", campaign.id).eq("status", "queued").order("created_at").limit(batchLimit);
    for (const recipient of recipients || []) {
      // Recheck suppressions immediately before the provider call. This closes
      // the race between audience snapshot and a one-click unsubscribe.
      const { data: suppression } = await db.from("email_suppressions").select("id").eq("organisation_id", campaign.organisation_id).eq("email", recipient.email).maybeSingle();
      const { data: preference } = await db.from("contact_marketing_preferences").select("unsubscribe_token,marketing_consent_status").eq("organisation_id", campaign.organisation_id).eq("email", recipient.email).maybeSingle();
      if (suppression || preference?.marketing_consent_status !== "opted_in") {
        await db.from("email_campaign_recipients").update({ status: "suppressed", error_reason: "suppressed before dispatch" }).eq("id", recipient.id);
        continue;
      }
      await db.from("email_campaign_recipients").update({ status: "sending", send_attempts: Number(recipient.send_attempts || 0) + 1 }).eq("id", recipient.id).eq("status", "queued");
      const identity: any = Array.isArray(campaign.email_sender_identities) ? campaign.email_sender_identities[0] : campaign.email_sender_identities;
      const unsubscribeUrl = `${publicUrl.replace(/\/$/, "")}/email/unsubscribe?token=${encodeURIComponent(text(preference?.unsubscribe_token))}`;
      const footer = `<hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0 16px"><p style="font:12px Arial;color:#667085">You received this marketing email from ${text(identity?.display_name)}. <a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
      const html = await trackLinks(db, merge(safeHtml(campaign.html), recipient.recipient_snapshot || {}) + footer, campaign, recipient, `${url.replace(/\/$/, "")}/functions/v1/email-campaign-track`);
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json", "Idempotency-Key": `campaign:${campaign.id}:recipient:${recipient.id}` }, body: JSON.stringify({ from: `${text(identity?.display_name)} <${text(identity?.from_email)}>`, reply_to: text(identity?.reply_to_email), to: [recipient.email], subject: campaign.subject, html, text: `${text(campaign.preview_text)}\n\nUnsubscribe: ${unsubscribeUrl}`, tags: [{ name: "arch9_campaign_id", value: campaign.id }, { name: "arch9_recipient_id", value: recipient.id }] }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.id) {
        await db.from("email_campaign_recipients").update({ status: "sent", provider_message_id: body.id, sent_at: new Date().toISOString(), error_reason: null }).eq("id", recipient.id);
        await db.from("email_events").insert({ organisation_id: campaign.organisation_id, campaign_id: campaign.id, recipient_id: recipient.id, provider: "resend", provider_event_id: `send:${body.id}`, event_type: "sent", payload: body });
      } else {
        await db.from("email_campaign_recipients").update({ status: "failed", error_reason: text(body?.message) || `Resend HTTP ${response.status}` }).eq("id", recipient.id);
      }
      processed += 1;
    }
    const { count: queued } = await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["queued", "sending"]);
    if (!queued) {
      const { count: failed } = await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).eq("status", "failed");
      await db.from("email_campaigns").update({ status: failed ? "partially_failed" : "sent", sent_at: new Date().toISOString() }).eq("id", campaign.id);
      if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
    } else if (job) {
      // Release the job for the next bounded batch; one invocation never
      // tries to monopolise the provider or a Worker isolate.
      await db.from("email_campaign_dispatch_jobs").update({ status: "queued", locked_at: null }).eq("id", job.id);
    }
  }
  return json(200, { processed });
});
