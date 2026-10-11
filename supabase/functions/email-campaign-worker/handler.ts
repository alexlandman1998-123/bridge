import { escapeHtml } from "../_shared/emailDocument.js";
import { inspectEmailHtml, renderCampaignDelivery } from "../_shared/emailContent.js";
import { checkCampaignContent } from "../_shared/emailCampaignContentCheck.ts";

const text = (value: unknown) => String(value || "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function failQueuedCampaign(db: any, campaign: any, job: any, reason: string) {
  await db.from("email_campaign_recipients").update({ status: "failed", error_reason: reason }).eq("campaign_id", campaign.id).eq("status", "queued");
  const { count: alreadySent } = await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).eq("status", "sent");
  await db.from("email_campaigns").update({ status: alreadySent ? "partially_failed" : "failed" }).eq("id", campaign.id);
  await db.from("email_campaign_dispatch_jobs").update({ status: "failed", last_error: reason }).eq("id", job.id);
}

async function trackLinks(db: any, html: string, campaign: any, recipient: any, functionBaseUrl: string) {
  const links = new Map<string, string>();
  const rewritten = html.replace(/(<a\b[^>]*\bhref\s*=\s*["'])(https?:\/\/[^"'\s>]+)(["'][^>]*>)/gi, (match, prefix, target, suffix) => {
    if (/\/(?:email\/unsubscribe|email-unsubscribe)\b/i.test(target)) return match;
    const decodedTarget = target.replace(/&amp;/g, "&");
    const key = `${campaign.id}:${decodedTarget}`;
    links.set(key, decodedTarget);
    return `${prefix}__ARCH9_TRACK_${key}__${suffix}`;
  });
  let output = rewritten;
  for (const [key, target] of links) {
    const { data, error } = await db.from("email_campaign_links").upsert({ organisation_id: campaign.organisation_id, campaign_id: campaign.id, target_url: target }, { onConflict: "campaign_id,target_url" }).select("tracking_token").single();
    if (error || !data?.tracking_token) { output = output.split(`__ARCH9_TRACK_${key}__`).join(escapeHtml(target)); continue; }
    const trackingUrl = `${functionBaseUrl}?l=${encodeURIComponent(data.tracking_token)}&r=${encodeURIComponent(recipient.id)}&t=${encodeURIComponent(recipient.tracking_token)}`;
    output = output.split(`__ARCH9_TRACK_${key}__`).join(escapeHtml(trackingUrl));
  }
  return output;
}

export function createWorkerHandler({ createClient, env, fetcher = fetch }: { createClient: any; env: (key: string) => string | undefined; fetcher?: typeof fetch }) {
return async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const workerSecret = text(env("EMAIL_CAMPAIGN_WORKER_SECRET"));
  const serviceKey = text(env("SUPABASE_SERVICE_ROLE_KEY"));
  const hasWorkerSecret = Boolean(workerSecret) && text(req.headers.get("x-arch9-email-worker-secret")) === workerSecret;
  const hasServiceAuthorization = Boolean(serviceKey) && text(req.headers.get("authorization")) === `Bearer ${serviceKey}`;
  const cronKey = text(req.headers.get("x-arch9-email-cron-key"));
  const expectedCronDigest = text(env("EMAIL_CAMPAIGN_CRON_KEY_SHA256"));
  const cronDigest = cronKey ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cronKey)))).map((byte) => byte.toString(16).padStart(2, "0")).join("") : "";
  const hasCronAuthorization = Boolean(expectedCronDigest) && Boolean(cronDigest) && cronDigest === expectedCronDigest;
  if (!hasWorkerSecret && !hasServiceAuthorization && !hasCronAuthorization) return json(401, { error: "Worker authentication failed." });
  const url = text(env("SUPABASE_URL"));
  const key = text(env("SUPABASE_SERVICE_ROLE_KEY"));
  const resendKey = text(env("RESEND_API_KEY"));
  if (!url || !key || !resendKey) return json(500, { error: "Email worker is not configured." });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const { data: jobs, error: jobsError } = await db.from("email_campaign_dispatch_jobs")
    .select("id,campaign_id").eq("status", "queued").lte("run_at", now).order("run_at").limit(10);
  if (jobsError) return json(500, { error: jobsError.message });
  const campaignIds = (jobs || []).map((job: any) => job.campaign_id);
  if (!campaignIds.length) return json(200, { processed: 0 });
  const { data: campaigns, error } = await db.from("email_campaigns")
    .select("id,organisation_id,subject,preview_text,html,content_json,sender_identity_id,status,email_sender_identities(display_name,from_email,reply_to_email,verification_status,sending_paused_at)")
    .in("id", campaignIds).in("status", ["sending", "scheduled"]);
  if (error) return json(500, { error: error.message });
  let processed = 0;
  for (const campaign of campaigns || []) {
    const job = (jobs || []).find((item: any) => item.campaign_id === campaign.id);
    if (!job) continue;
    const { data: claimedJob, error: claimError } = await db.from("email_campaign_dispatch_jobs").update({ status: "running", locked_at: now, attempts: 1 }).eq("id", job.id).eq("status", "queued").select("id").maybeSingle();
    if (claimError || !claimedJob) continue;
    if (campaign.status === "scheduled") await db.from("email_campaigns").update({ status: "sending", sending_started_at: now }).eq("id", campaign.id).eq("status", "scheduled");
    const { data: policy } = await db.from("email_sending_policies")
      .select("max_recipients_per_worker_run,daily_recipient_limit,paused_at,approved_at").eq("organisation_id", campaign.organisation_id).maybeSingle();
    if (!policy?.approved_at || policy?.paused_at) {
      if (job) await db.from("email_campaign_dispatch_jobs").update({ status: "failed", last_error: policy?.paused_at ? "Organisation sending policy is paused." : "Organisation email sending is not approved." }).eq("id", job.id);
      continue;
    }
    const identity: any = Array.isArray(campaign.email_sender_identities) ? campaign.email_sender_identities[0] : campaign.email_sender_identities;
    if (!identity || identity.verification_status !== "verified" || identity.sending_paused_at) {
      await failQueuedCampaign(db, campaign, job, "The campaign sender is no longer verified and active.");
      continue;
    }
    const context = { agencyName: identity?.display_name, senderEmail: identity?.from_email, previewText: campaign.preview_text };
    const contentCheck = await checkCampaignContent({ db, campaign, supabaseUrl: url, fetcher, context });
    if (!contentCheck.ready) {
      await failQueuedCampaign(db, campaign, job, contentCheck.errors[0]);
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
      const { data: claimedRecipient, error: recipientClaimError } = await db.from("email_campaign_recipients").update({ status: "sending", send_attempts: Number(recipient.send_attempts || 0) + 1 }).eq("id", recipient.id).eq("status", "queued").select("id").maybeSingle();
      if (recipientClaimError || !claimedRecipient) continue;
      const unsubscribeUrl = `${url.replace(/\/$/, "")}/functions/v1/email-unsubscribe?token=${encodeURIComponent(text(preference?.unsubscribe_token))}`;
      const output = renderCampaignDelivery(campaign, { ...context, unsubscribeUrl }, { ...recipient.recipient_snapshot, agency_name: recipient.recipient_snapshot?.agency_name || identity?.display_name });
      const html = await trackLinks(db, output.html, campaign, recipient, `${url.replace(/\/$/, "")}/functions/v1/email-campaign-track`);
      const finalCheck = inspectEmailHtml(html);
      if (!finalCheck.ready) {
        await db.from("email_campaign_recipients").update({ status: "failed", error_reason: finalCheck.errors[0] }).eq("id", recipient.id);
        continue;
      }
      const response = await fetcher("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json", "Idempotency-Key": `campaign:${campaign.id}:recipient:${recipient.id}` }, body: JSON.stringify({ from: `${text(identity?.display_name)} <${text(identity?.from_email)}>`, reply_to: text(identity?.reply_to_email), to: [recipient.email], subject: campaign.subject, html, text: output.text, tags: [{ name: "arch9_campaign_id", value: campaign.id }, { name: "arch9_recipient_id", value: recipient.id }] }) });
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
};
}
