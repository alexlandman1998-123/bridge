import { createClient } from "supabase";
import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendTransactionProgressDispatchPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

const PROFESSIONAL_ROLES = new Set([
  "developer", "platform_admin", "internal_admin", "admin", "agent",
  "attorney", "conveyancer", "bond_originator",
]);

function uuid(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function serviceClient() {
  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const key = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function jwtRole(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1] || "";
  if (!payload) return "";
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return normalizeText(JSON.parse(atob(padded))?.role).toLowerCase();
  } catch {
    return "";
  }
}

function isServiceRequest(req: Request) {
  const authorization = normalizeText(req.headers.get("authorization"));
  const serviceKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  return Boolean(
    (serviceKey && authorization === `Bearer ${serviceKey}`) ||
    jwtRole(authorization) === "service_role"
  );
}

async function assertProfessionalAccess(req: Request, supabase: any, transactionId: string) {
  const authorization = normalizeText(req.headers.get("authorization"));
  if (isServiceRequest(req)) return;

  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication is required.");
  const userResult = await supabase.auth.getUser(token);
  const userId = uuid(userResult.data?.user?.id);
  if (!userId) throw new Error("Authentication is required.");
  const profile = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = normalizeText(profile.data?.role).toLowerCase();
  if (!PROFESSIONAL_ROLES.has(role)) {
    throw new Error("Only an authorised transaction professional may dispatch progress notifications.");
  }

  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const anonKey = normalizeText(Deno.env.get("SUPABASE_ANON_KEY"));
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const access = await userClient
    .from("transactions")
    .select("id")
    .eq("id", transactionId)
    .maybeSingle();
  if (access.error || !access.data) throw new Error("You do not have access to this transaction.");
}

function buildEmail(event: Record<string, unknown>) {
  const payload = record(event.payload_json);
  const title = normalizeText(payload.title) || "Transaction progress updated";
  const description = normalizeText(payload.description) || normalizeText(event.message_preview);
  const safeExplanation = normalizeText(payload.safeExplanation);
  const expectedNextStep = normalizeText(payload.expectedNextStep);
  const recipientName = normalizeText(payload.recipientName);
  const processLabel = normalizeText(payload.processLabel) || "Transaction";
  const status = normalizeText(payload.status).replaceAll("_", " ");
  const subject = normalizeText(event.subject) || `Arch9 transaction update: ${processLabel}`;
  const fields = [
    { label: "Process", value: processLabel },
    { label: "Current update", value: title },
    { label: "Status", value: status },
    safeExplanation ? { label: "What is holding it up", value: safeExplanation } : null,
    expectedNextStep ? { label: "Expected next step", value: expectedNextStep } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const intro = [description];
  if (safeExplanation && safeExplanation !== description) intro.push(safeExplanation);
  const contentHtml = [
    renderBridgeIntroParagraphs(intro),
    renderBridgeSummaryCard(fields, "Transaction progress"),
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: description,
    title,
    greeting: recipientName ? `Hi ${recipientName},` : "Hi there,",
    contentHtml,
    securityBody: "This message contains only the progress information made visible to your transaction role. Private legal notes and documents are not included.",
    helpBody: "Sign in to Arch9 to view the latest transaction information available to your role.",
    organisationName: "Arch9",
  });
  const text = [
    recipientName ? `Hi ${recipientName},` : "Hi there,",
    "", description,
    safeExplanation && safeExplanation !== description ? safeExplanation : "",
    expectedNextStep ? `Expected next step: ${expectedNextStep}` : "",
    "", "Sign in to Arch9 to view the latest transaction information available to your role.",
  ].filter((line) => line !== "").join("\n");
  return { subject, html, text, preview: description };
}

async function cloneForResend(supabase: any, eventId: string) {
  const source = await supabase
    .from("notification_events")
    .select("*")
    .eq("id", eventId)
    .eq("automation_key", "transaction_progress_changed")
    .maybeSingle();
  if (source.error || !source.data) throw new Error("Progress notification was not found.");
  const nextId = crypto.randomUUID();
  const copy = { ...source.data };
  for (const key of [
    "id", "created_at", "updated_at", "sent_at", "delivered_at", "failed_at",
    "provider_message_id", "communication_delivery_id", "error_message",
    "last_dispatch_attempt_at", "last_dispatch_error",
  ]) delete copy[key];
  copy.id = nextId;
  copy.status = "queued";
  copy.dispatch_attempt_count = 0;
  copy.queued_at = new Date().toISOString();
  copy.next_dispatch_attempt_at = copy.queued_at;
  copy.resend_of_event_id = source.data.id;
  copy.dedupe_key = `${source.data.dedupe_key}:resend:${nextId}`;
  copy.idempotency_key = copy.dedupe_key;
  copy.metadata_json = { ...record(copy.metadata_json), manualResend: true };
  const inserted = await supabase.from("notification_events").insert(copy).select("id, transaction_id").single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function recordDelivery(
  supabase: any,
  event: Record<string, unknown>,
  content: ReturnType<typeof buildEmail>,
  status: "sent" | "failed",
  providerMessageId = "",
  errorMessage = "",
) {
  const now = new Date().toISOString();
  const inserted = await supabase.from("communication_deliveries").insert({
    organisation_id: event.organisation_id,
    transaction_id: event.transaction_id,
    communication_type: "transaction_progress_changed",
    automation_key: "transaction_progress_changed",
    notification_event_id: event.id,
    channel: "email",
    recipient: event.recipient_email,
    recipient_role: event.recipient_role,
    subject: content.subject,
    message_preview: content.preview,
    status,
    provider: "resend",
    provider_message_id: providerMessageId || null,
    error_message: errorMessage || null,
    prepared_at: now,
    sent_at: status === "sent" ? now : null,
    failed_at: status === "failed" ? now : null,
    metadata_json: { source: "transaction_progress_dispatch", phase: "phase_3_notifications" },
  }).select("id").single();
  return inserted.error ? null : inserted.data;
}

export async function handleTransactionProgressDispatchEmail(
  req: Request,
  payload: SendTransactionProgressDispatchPayload,
) {
  const supabase = serviceClient();
  const resendKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!supabase) return jsonResponse(500, { error: "Notification delivery is not configured." });

  let transactionId = uuid(payload.transactionId || payload.transaction_id);
  let eventId = uuid(payload.eventId || payload.event_id);
  const isResend = payload.resend === true;
  if (!transactionId && eventId) {
    const lookup = await supabase.from("notification_events").select("transaction_id").eq("id", eventId).maybeSingle();
    transactionId = uuid(lookup.data?.transaction_id);
  }
  const serviceRequest = isServiceRequest(req);
  if (!transactionId && !serviceRequest) {
    return jsonResponse(400, { error: "Transaction id or notification event id is required." });
  }

  try {
    if (!serviceRequest) await assertProfessionalAccess(req, supabase, transactionId);
    if (isResend) {
      if (!eventId) return jsonResponse(400, { error: "Notification event id is required for a resend." });
      const clone = await cloneForResend(supabase, eventId);
      eventId = uuid(clone.id);
    }
  } catch (error) {
    return jsonResponse(403, { error: error instanceof Error ? error.message : "Not authorised." });
  }

  const claim = await supabase.rpc("bridge_claim_transaction_progress_notifications_phase3", {
    p_transaction_id: transactionId || null,
    p_event_id: eventId || null,
    p_limit: Math.max(1, Math.min(Number(payload.limit) || 25, 100)),
  });
  if (claim.error) return jsonResponse(500, { error: claim.error.message });

  const results: Array<Record<string, unknown>> = [];
  for (const event of claim.data || []) {
    const content = buildEmail(event);
    if (!resendKey) {
      const message = "Missing RESEND_API_KEY secret.";
      await supabase.from("notification_events").update({
        status: "failed", error_message: message, last_dispatch_error: message,
        failed_at: new Date().toISOString(), next_dispatch_attempt_at: new Date(Date.now() + 300_000).toISOString(),
      }).eq("id", event.id);
      results.push({ eventId: event.id, sent: false, error: message });
      continue;
    }
    const delivery = await sendViaResendApi({
      apiKey: resendKey,
      from: normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL")) || "Arch9 <onboarding@resend.dev>",
      to: normalizeText(event.recipient_email).toLowerCase(),
      subject: content.subject,
      html: content.html,
      text: content.text,
      idempotencyKey: normalizeText(event.idempotency_key || event.dedupe_key),
      timeoutMs: 15_000,
    });
    if (delivery.ok) {
      const providerId = normalizeText(delivery.data?.id);
      const log = await recordDelivery(supabase, event, content, "sent", providerId);
      await supabase.from("notification_events").update({
        status: "sent", provider: "resend", provider_message_id: providerId || null,
        communication_delivery_id: log?.id || null, sent_at: new Date().toISOString(),
        error_message: null, last_dispatch_error: null, next_dispatch_attempt_at: null,
      }).eq("id", event.id);
      results.push({ eventId: event.id, sent: true, providerMessageId: providerId || null });
    } else {
      const message = normalizeText(delivery.error?.message) || "Resend rejected the transaction progress email.";
      const log = await recordDelivery(supabase, event, content, "failed", "", message);
      const attempts = Number(event.dispatch_attempt_count) || 1;
      const exhausted = attempts >= (Number(event.max_dispatch_attempts) || 5);
      await supabase.from("notification_events").update({
        status: "failed", communication_delivery_id: log?.id || null,
        error_message: message, last_dispatch_error: message, failed_at: new Date().toISOString(),
        next_dispatch_attempt_at: exhausted ? null : new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000).toISOString(),
      }).eq("id", event.id);
      results.push({ eventId: event.id, sent: false, error: message, exhausted });
    }
  }

  return jsonResponse(200, {
    success: true,
    transactionId: transactionId || null,
    claimed: (claim.data || []).length,
    sent: results.filter((item) => item.sent === true).length,
    failed: results.filter((item) => item.sent !== true).length,
    results,
  });
}
