import { createClient } from "supabase";
import {
  buildClientJourneyEmail,
  CLIENT_JOURNEY_EMAIL_KINDS,
  type ClientJourneyEmailKind,
} from "../content/clientJourneyEmails.ts";
import {
  normalizeEmailAddress,
  resolveAudienceEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

type ClientJourneyPayload = Record<string, unknown>;
const kinds = new Set<string>(CLIENT_JOURNEY_EMAIL_KINDS);
const linkRequired = new Set<ClientJourneyEmailKind>([
  "seller_listing_live",
  "client_portal_agent_message",
  "client_documents_received",
  "transfer_lodged",
  "transfer_registered",
  "buyer_proof_of_funds_required",
]);

export async function handleClientJourneyEmail(
  req: Request,
  payload: ClientJourneyPayload,
) {
  const serviceKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!serviceKey || req.headers.get("authorization") !== `Bearer ${serviceKey}`) {
    return jsonResponse(403, { error: "Service access is required." });
  }
  const kind = normalizeText(payload.type).toLowerCase();
  if (!kinds.has(kind)) {
    return jsonResponse(400, { error: "Unknown client journey email type." });
  }
  const to = normalizeEmailAddress(payload.to);
  const organisationId = normalizeText(
    payload.organisationId ?? payload.organisation_id,
  );
  const actionUrl = normalizeText(payload.actionUrl ?? payload.action_url);
  if (!to || !organisationId) {
    return jsonResponse(400, {
      error: "Recipient and organisation are required.",
    });
  }
  if (linkRequired.has(kind as ClientJourneyEmailKind) && !actionUrl) {
    return jsonResponse(400, { error: "A secure action link is required." });
  }
  if (actionUrl) {
    try {
      if (!["https:", "http:"].includes(new URL(actionUrl).protocol)) {
        throw new Error("Unsupported protocol");
      }
    } catch {
      return jsonResponse(400, { error: "A valid action link is required." });
    }
  }

  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  const platformSender = normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  if (!supabaseUrl || !resendApiKey) {
    return jsonResponse(500, { error: "Email delivery is not configured." });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const agency = await supabase.from("organisations")
    .select("name")
    .eq("id", organisationId)
    .maybeSingle();
  const agencyName = normalizeText(agency.data?.name);
  if (agency.error || !agencyName) {
    return jsonResponse(422, { error: "Agency identity was not found." });
  }
  const branding = await resolveEmailBranding({
    supabase,
    payload,
    organisationId,
    defaults: { organisationName: agencyName },
  });
  const content = buildClientJourneyEmail({
    kind: kind as ClientJourneyEmailKind,
    recipientName: normalizeText(payload.recipientName ?? payload.recipient_name),
    propertyLabel: normalizeText(payload.propertyLabel ?? payload.property_label),
    agentName: normalizeText(payload.agentName ?? payload.agent_name),
    actionUrl,
    appointmentWhen: normalizeText(payload.appointmentWhen ?? payload.appointment_when),
    appointmentWhere: normalizeText(payload.appointmentWhere ?? payload.appointment_where),
    documentCount: Number(payload.documentCount ?? payload.document_count) || 0,
    branding,
  });
  const sender = await resolveAudienceEmailSender({
    audience: "client",
    branding,
    platformSender,
    supabase,
  });
  const result = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    replyTo: normalizeEmailAddress(
      branding.replyTo || branding.supportEmail || branding.fromEmail,
    ) || undefined,
    idempotencyKey: normalizeText(
      payload.idempotencyKey ?? payload.idempotency_key,
    ) || undefined,
  });
  if (!result.ok) {
    return jsonResponse(502, {
      error: "Email delivery failed.",
      details: result.error,
    });
  }
  return jsonResponse(200, {
    ok: true,
    type: kind,
    emailId: result.data?.id || null,
  });
}
