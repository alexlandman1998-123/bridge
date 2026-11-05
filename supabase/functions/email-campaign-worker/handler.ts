import { acquireCampaignSendSlot, recordCampaignBackoff } from "../_shared/emailCampaignSendGate.ts";
import { campaignSenderDetails } from "../_shared/emailCampaignSender.js";
import { refreshPlatformCampaignSender } from "../_shared/emailCampaignPlatformSender.ts";
import { refreshSendingDomain } from "../_shared/emailSendingDomain.ts";
import { supabaseServiceKey } from "../_shared/apiCredentials.ts";
import { escapeHtml } from "../_shared/emailDocument.js";
import { inspectEmailHtml, renderCampaignDelivery } from "../_shared/emailContent.js";
import { checkCampaignContent } from "../_shared/emailCampaignContentCheck.ts";
import { checkCampaignSourceFreshness } from "../_shared/emailCampaignSourceFreshness.js";

const text = (value: unknown) => String(value || "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function checked(query: any) {
  const result = await query;
  if (result.error) throw result.error;
  return result;
}
async function updateJob(db: any, job: any, values: Record<string, unknown>) {
  const result = await checked(db.from("email_campaign_dispatch_jobs").update(values)
    .eq("id", job.id).eq("status", "running").eq("lease_token", job.lease_token).select("id").maybeSingle());
  if (!result.data) throw new Error("Dispatch lease is no longer owned by this worker.");
}
async function failQueuedCampaign(db: any, job: any, reason: string) {
  const result = await checked(db.rpc("email_campaign_stop_dispatch", {
    p_job_id: job.id, p_lease_token: job.lease_token, p_reason: reason,
  }));
  if (!result.data) throw new Error("Dispatch lease is no longer owned by this worker.");
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

export function createWorkerHandler({ createClient, env, fetcher = fetch, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) }: { createClient: any; env: (key: string) => string | undefined; fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void> }) {
return async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const workerSecret = text(env("EMAIL_CAMPAIGN_WORKER_SECRET"));
  const serviceKey = text(supabaseServiceKey({ get: env } as typeof Deno.env));
  const hasWorkerSecret = Boolean(workerSecret) && text(req.headers.get("x-arch9-email-worker-secret")) === workerSecret;
  const hasServiceAuthorization = Boolean(serviceKey) && text(req.headers.get("authorization")) === `Bearer ${serviceKey}`;
  const cronKey = text(req.headers.get("x-arch9-email-cron-key"));
  const expectedCronDigest = text(env("EMAIL_CAMPAIGN_CRON_KEY_SHA256"));
  const cronDigest = cronKey ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cronKey)))).map((byte) => byte.toString(16).padStart(2, "0")).join("") : "";
  const hasCronAuthorization = Boolean(expectedCronDigest) && Boolean(cronDigest) && cronDigest === expectedCronDigest;
  if (!hasWorkerSecret && !hasServiceAuthorization && !hasCronAuthorization) return json(401, { error: "Worker authentication failed." });
  const url = text(env("SUPABASE_URL"));
  const key = text(supabaseServiceKey({ get: env } as typeof Deno.env));
  const resendKey = text(env("RESEND_API_KEY"));
  if (!url || !key || !resendKey) return json(500, { error: "Email worker is not configured." });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const reconciliation = await db.rpc("email_campaign_reconcile_provider_receipts", { p_limit: 100 });
  if (reconciliation.error) return json(503, { error: "Pending campaign receipts could not be reconciled." });
  // Claim one bounded batch. Stale leases are reclaimed atomically, and every
  // request already attempted is recovered with its original payload and key.
  const { data: jobs, error: jobsError } = await db.rpc("email_campaign_claim_dispatch_jobs", { p_limit: 1 });
  if (jobsError || !Array.isArray(jobs)) return json(500, { error: "Email dispatch storage is unavailable." });
  let campaigns: any[] = [];
  try {
    const campaignIds = (jobs || []).map((job: any) => job.campaign_id);
    if (!campaignIds.length) return json(200, { processed: 0 });
    const result = await checked(db.from("email_campaigns")
      .select("id,organisation_id,subject,preview_text,reply_to_email,html,content_json,sender_identity_id,subscription_type_id,status,email_sender_identities(display_name,from_email,reply_to_email,verification_status,sending_paused_at,email_sending_domain_id,sender_mode)")
      .in("id", campaignIds).in("status", ["sending", "scheduled"]));
    campaigns = result.data || [];
    for (const job of jobs) {
      if (!campaigns.some((campaign: any) => campaign.id === job.campaign_id)) {
        await updateJob(db, job, { status: "cancelled", locked_at: null, lease_token: null });
      }
    }
  } catch {
    // A later invocation can reclaim these leases if even releasing fails.
    for (const job of jobs || []) {
      try { await updateJob(db, job, { status: "queued", locked_at: null, lease_token: null, last_error: "Campaign data could not be read." }); } catch { /* lease recovery is durable */ }
    }
    return json(500, { error: "Campaign data could not be read." });
  }
  let processed = 0;
  for (const campaign of campaigns || []) {
    const job = (jobs || []).find((item: any) => item.campaign_id === campaign.id);
    if (!job) continue;
    try {
      if (campaign.status === "scheduled") await checked(db.from("email_campaigns").update({ status: "sending", sending_started_at: now }).eq("id", campaign.id).eq("status", "scheduled"));
      const { data: policy } = await checked(db.from("email_sending_policies")
        .select("max_recipients_per_worker_run,daily_recipient_limit,paused_at,approved_at,manual_paused_at,self_service_blocked").eq("organisation_id", campaign.organisation_id).maybeSingle());
      if (policy?.manual_paused_at) {
        await updateJob(db, job, { status: "queued", locked_at: null, lease_token: null, run_at: new Date(Date.now() + 60000).toISOString(), last_error: "Organisation sending is paused by its manager." });
        continue;
      }
      if (!policy?.approved_at || policy?.paused_at || policy?.self_service_blocked) {
        await failQueuedCampaign(db, job, policy?.paused_at ? "Organisation sending policy is paused." : "Organisation email sending is not approved.");
        continue;
      }
      const identity: any = Array.isArray(campaign.email_sender_identities) ? campaign.email_sender_identities[0] : campaign.email_sender_identities;
      if (!identity || identity.verification_status !== "verified" || identity.sending_paused_at) {
        await failQueuedCampaign(db, job, "The campaign sender is no longer verified and active.");
        continue;
      }
      let sender;
      try { sender = campaignSenderDetails({ ...identity, reply_to_email: campaign.reply_to_email || identity.reply_to_email }); }
      catch { await failQueuedCampaign(db, job, "The selected sender configuration is invalid."); continue; }
      let domain;
      if (identity.sender_mode !== "arch9") {
        const result = await checked(db.from("email_sending_domains").select("id,domain_name,provider_domain_id,verification_status")
          .eq("id", identity.email_sending_domain_id).eq("organisation_id", campaign.organisation_id).maybeSingle());
        domain = result.data;
      }
      try {
        if (identity.sender_mode === "arch9") {
          const platform = await refreshPlatformCampaignSender({ db, env, resendKey, fetcher });
          if (!platform.ready) { await failQueuedCampaign(db, job, "Arch9 campaign sending is not enabled and verified."); continue; }
        } else {
          if (!domain || await refreshSendingDomain({ db, domain, resendKey, fetcher }) !== "verified") {
            await failQueuedCampaign(db, job, "The sending domain needs DNS verification."); continue;
          }
        }
      } catch {
        // A custom-domain read failure must remain a storage failure, not proof
        // of DNS loss. Both modes retry verification without changing sender.
        await updateJob(db, job, { status: "queued", locked_at: null, last_error: "Domain verification is temporarily unavailable." });
        continue;
      }
      const context = { agencyName: identity?.display_name, senderEmail: sender.address, previewText: campaign.preview_text };
      const contentCheck = await checkCampaignContent({ db, campaign, supabaseUrl: url, fetcher, context });
      if (!contentCheck.ready) {
        if ('sourceFreshness' in contentCheck && contentCheck.sourceFreshness?.retryable) {
          await updateJob(db, job, { status: "queued", locked_at: null, last_error: contentCheck.sourceFreshness.reason });
          continue;
        }
        await failQueuedCampaign(db, job, contentCheck.errors[0]);
        continue;
      }
      // Quota reservations are authoritative, including retries. A failed count
      // must never become zero or prevent reconciliation of a reserved request.
      const batchLimit = Math.min(Number(policy?.max_recipients_per_worker_run || 50), 50);
      const { data: recipients } = await checked(db.from("email_campaign_recipients")
        .select("id,email,recipient_snapshot,send_attempts,tracking_token,status").eq("campaign_id", campaign.id)
        .in("status", ["queued", "sending"]).order("send_attempts", { ascending: false }).order("created_at").limit(batchLimit));
      let sourceStopped = false;
      for (const recipient of recipients || []) {
        // Recheck suppressions immediately before the provider call. This closes
        // the race between audience snapshot and a one-click unsubscribe.
        const { data: suppression, error: suppressionError } = await db.from("email_suppressions").select("id").eq("organisation_id", campaign.organisation_id).eq("email", recipient.email).maybeSingle();
        const { data: preference, error: preferenceError } = await db.from("contact_marketing_preferences").select("unsubscribe_token,marketing_consent_status").eq("organisation_id", campaign.organisation_id).eq("email", recipient.email).maybeSingle();
        const { data: subscription, error: subscriptionError } = await db.from("contact_email_subscriptions").select("status").eq("organisation_id", campaign.organisation_id).eq("email", recipient.email).eq("subscription_type_id", campaign.subscription_type_id).maybeSingle();
        const { data: contact, error: contactError } = await db.from("email_marketing_contacts").select("is_valid_email").eq("organisation_id", campaign.organisation_id).eq("email", recipient.email).maybeSingle();
        // Leave queued on a read failure; never interpret unknown eligibility as consent.
        if (suppressionError || preferenceError || subscriptionError || contactError) continue;
        if (subscription?.status !== "subscribed" || !contact?.is_valid_email) {
          await checked(db.from("email_campaign_recipients").update({ status: "suppressed", error_reason: "category subscription or address eligibility withdrawn before dispatch" }).eq("id", recipient.id));
          continue;
        }
        if (suppression || preference?.marketing_consent_status !== "opted_in") {
          await checked(db.from("email_campaign_recipients").update({ status: "suppressed", error_reason: "suppressed before dispatch" }).eq("id", recipient.id));
          continue;
        }
        // Recheck the single referenced listing immediately before reserving and
        // claiming each recipient. A changed source stops the remainder of a batch;
        // accepted or uncertain provider outcomes are never reset for another send.
        const sourceFreshness = await checkCampaignSourceFreshness({ db, campaign });
        if (!sourceFreshness.ready) {
          if (sourceFreshness.retryable) await updateJob(db, job, { status: "queued", locked_at: null, last_error: sourceFreshness.reason });
          else await failQueuedCampaign(db, job, sourceFreshness.reason);
          sourceStopped = true;
          break;
        }
        // The database locks one organisation policy across simultaneous jobs;
        // a browser or another worker cannot race the daily cap or a safety pause.
        const reservation = await db.rpc("email_reserve_send", { p_organisation_id: campaign.organisation_id,
          p_identity_id: campaign.sender_identity_id, p_key: `recipient:${recipient.id}`, p_test: false });
        if (reservation.error) throw reservation.error;
        if (!reservation.data) {
          await updateJob(db, job, { last_error: "Waiting for sending capacity or an organisation sending control. Queued recipients are retained." });
          break;
        }
        const unsubscribeUrl = `${url.replace(/\/$/, "")}/functions/v1/email-unsubscribe?token=${encodeURIComponent(text(preference?.unsubscribe_token))}`;
        const output = renderCampaignDelivery(campaign, { ...context, unsubscribeUrl }, { ...recipient.recipient_snapshot, agency_name: recipient.recipient_snapshot?.agency_name || identity?.display_name });
        const html = await trackLinks(db, output.html, campaign, recipient, `${url.replace(/\/$/, "")}/functions/v1/email-campaign-track`);
        const finalCheck = inspectEmailHtml(html);
        if (!finalCheck.ready) {
          await checked(db.from("email_campaign_recipients").update({ status: "failed", error_reason: finalCheck.errors[0] }).eq("id", recipient.id));
          continue;
        }
        const payload = { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, from: sender.from, reply_to: sender.replyTo, to: [recipient.email], subject: campaign.subject, html, text: output.text, tags: [{ name: "arch9_campaign_id", value: campaign.id }, { name: "arch9_recipient_id", value: recipient.id }] };
        const { data: attempt } = await checked(db.rpc("email_campaign_prepare_send", {
          p_job_id: job.id, p_lease_token: job.lease_token, p_recipient_id: recipient.id, p_payload: payload,
        }));
        if (attempt?.action === "review") break;
        if (attempt?.action === "skip") continue;
        if (attempt?.action === "lease_lost") { sourceStopped = true; break; }
        if (attempt?.action !== "send" || !attempt.payload || !attempt.idempotency_key) throw new Error("Dispatch preparation could not be confirmed.");
        // Sender changes require review; never replay a frozen request using a
        // different verified identity or silently send a changed request body.
        if (attempt.payload.from !== payload.from || attempt.payload.reply_to !== payload.reply_to) {
          await failQueuedCampaign(db, job, "Sender changed during an uncertain send; reconcile the provider outcome before resending.");
          sourceStopped = true;
          break;
        }
        const slot = await acquireCampaignSendSlot(db, {
          p_organisation_id: campaign.organisation_id, p_identity_id: campaign.sender_identity_id,
          p_key: `recipient:${recipient.id}`, p_email: recipient.email, p_recipient_id: recipient.id,
          p_job_id: job.id, p_lease_token: job.lease_token,
        }, sleep);
        if (slot === "skip" || slot === "blocked") continue;
        if (slot === "lease_lost") { sourceStopped = true; break; }
        if (slot !== "send") {
          await updateJob(db, job, { last_error: slot === "review" ? "Uncertain provider outcome requires manual reconciliation." : "Waiting for shared sending capacity or an organisation pause." });
          break;
        }
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json", "Idempotency-Key": attempt.idempotency_key },
          body: JSON.stringify(attempt.payload),
        });
        await recordCampaignBackoff(db, response);
        const body = await response.json().catch(() => ({}));
        if (response.ok && body?.id) {
          await checked(db.rpc("email_campaign_accept_send", { p_recipient_id: recipient.id, p_provider_id: body.id, p_response: body }));
        } else if (response.status === 429 || response.status >= 500 || response.status === 409 || response.ok) {
          // Provider timeouts, throttling and ambiguous responses retain the
          // request. A later run retries the same key within its safe window.
          throw new Error("Provider acceptance could not be confirmed.");
        } else {
          await checked(db.from("email_campaign_recipients").update({ status: "failed", error_reason: text(body?.message) || `Resend HTTP ${response.status}` }).eq("id", recipient.id).eq("status", "sending"));
        }
        processed += 1;
      }
      if (sourceStopped) continue;
      await checked(db.rpc("email_campaign_finish_dispatch", { p_job_id: job.id, p_lease_token: job.lease_token }));
    } catch {
      try {
        await updateJob(db, job, { status: "queued", locked_at: null, lease_token: null,
          run_at: new Date(Date.now() + 60000).toISOString(), last_error: "Dispatch could not be confirmed. Retrying the saved request safely." });
      } catch { /* A stale lease is reclaimed by the next worker. */ }
      return json(503, { error: "Dispatch could not be confirmed. Saved requests will be reconciled before completion.", processed });
    }
  }
  return json(200, { processed });
};
}
