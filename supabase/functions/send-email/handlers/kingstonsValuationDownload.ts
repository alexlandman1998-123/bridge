import type { SendKingstonsValuationDownloadPayload } from "../types.ts";
import {
  buildKingstonsValuationDownloadEmailHtml,
  buildKingstonsValuationDownloadEmailText,
  buildKingstonsValuationDownloadSubject,
} from "../content/kingstonsValuationDownload.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function normalizeEmail(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0] || "";
}

export async function handleKingstonsValuationDownloadEmail(
  payload: SendKingstonsValuationDownloadPayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeEmail(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const valuationDownloadUrl = normalizeText(
    payload.valuationDownloadUrl || payload.valuation_download_url ||
      payload.downloadUrl || payload.download_url,
  );
  if (!valuationDownloadUrl) {
    return jsonResponse(400, {
      error: "Missing required field: valuationDownloadUrl.",
    });
  }

  const rawPayload = payload as Record<string, unknown>;
  const organisationName = normalizeText(
    payload.organisationName || payload.organisation_name,
  ) || "Kingstons Real Estate";
  const supportEmail = normalizeText(
    payload.supportEmail || payload.support_email,
  );
  const supportPhone = normalizeText(
    payload.supportPhone || payload.support_phone,
  );
  const branding = await resolveEmailBranding({
    payload: rawPayload,
    organisationId: normalizeText(
      payload.organisationId || payload.organisation_id,
    ),
    defaults: {
      organisationName,
      supportEmail,
      supportPhone,
      primaryColor: normalizeText(
        payload.organisationBrandPrimaryColor ||
          payload.organisation_brand_primary_color,
      ),
      secondaryColor: normalizeText(
        payload.organisationBrandSecondaryColor ||
          payload.organisation_brand_secondary_color,
      ),
      fromName: normalizeText(payload.fromName || payload.from_name),
      replyTo: normalizeEmail(payload.replyTo || payload.reply_to),
    },
  });

  const centralSender =
    normalizeText(payload.fromEmail || payload.from_email) ||
    normalizeText(Deno.env.get("RESEND_APPOINTMENTS_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 Appointments <appointments@bridge.co.za>";
  const sender = formatEmailSender(
    centralSender,
    branding.fromName || branding.organisationName,
  );
  const replyTo = normalizeEmail(
    payload.replyTo || payload.reply_to || payload.agentEmail ||
      payload.agent_email || branding.replyTo,
  );
  const content = {
    recipientName: normalizeText(
      payload.recipientName || payload.recipient_name,
    ),
    propertyLabel: normalizeText(
      payload.propertyLabel || payload.property_label,
    ),
    agentName: normalizeText(payload.agentName || payload.agent_name),
    agentRole: normalizeText(payload.agentRole || payload.agent_role),
    valuationDownloadUrl,
    valuationFileName: normalizeText(
      payload.valuationFileName || payload.valuation_file_name,
    ),
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  };

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    bcc: normalizeEmail(payload.agentEmail || payload.agent_email),
    subject: normalizeText(payload.subject) ||
      buildKingstonsValuationDownloadSubject(),
    html: buildKingstonsValuationDownloadEmailHtml(content),
    text: buildKingstonsValuationDownloadEmailText(content),
    replyTo: replyTo || undefined,
    idempotencyKey: normalizeText(
      payload.idempotencyKey || payload.idempotency_key,
    ) || undefined,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message ||
        "Failed to send Kingstons valuation download email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "kingstons_valuation_download",
    emailId: emailResult.data?.id || null,
    providerMessageId: emailResult.data?.id || null,
  });
}
