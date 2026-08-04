import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  type EmailBranding,
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendAdditionalDocumentRequestPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function envEnabled(value: string | undefined, fallback = true) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

export function buildAdditionalDocumentRequestEmail({
  recipientName,
  title,
  message,
  transactionId,
  actionLink,
  metadata = {},
  branding,
}: {
  recipientName: string;
  title: string;
  message: string;
  transactionId?: string;
  actionLink?: string;
  metadata?: Record<string, unknown>;
  branding: EmailBranding;
}) {
  const documentLabel = firstText(
    metadata.documentLabel,
    metadata.documentTitle,
    metadata.documentName,
    metadata.document_name,
    metadata.requestTitle,
    metadata.request_title,
  );
  const propertyLabel = firstText(
    metadata.propertyLabel,
    metadata.property,
    metadata.propertyAddress,
    metadata.property_address,
  );
  const fields = [
    { label: "Transaction", value: transactionId || "" },
    { label: "Property", value: propertyLabel },
    { label: "Requested Document", value: documentLabel },
    {
      label: "Requested From",
      value: firstText(metadata.requestedFrom, metadata.requested_from),
    },
    {
      label: "Requested By",
      value: firstText(
        metadata.requestedBy,
        metadata.requested_by,
        metadata.actorRole,
      ),
    },
    {
      label: "Due Date",
      value: firstText(metadata.dueDate, metadata.due_date),
    },
    {
      label: "Status",
      value: firstText(metadata.status, metadata.documentStatus),
    },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName || "there"},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(fields, "Document Request"),
      renderBridgeCta("Open Secure Portal", actionLink || "", {
        primaryColor: branding.primaryColor,
      }),
    ].join(""),
    securityBody:
      "Requested documents should only be uploaded through the secure Arch9 portal or sent to authorised transaction parties.",
    helpBody:
      "Please open the secure portal to upload the document or review the request details.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  const text = [
    `Hi ${recipientName || "there"},`,
    "",
    message,
    transactionId ? `Transaction: ${transactionId}` : "",
    propertyLabel ? `Property: ${propertyLabel}` : "",
    documentLabel ? `Requested document: ${documentLabel}` : "",
    actionLink ? `Open secure portal: ${actionLink}` : "",
    "",
    "Please open the secure portal to upload the document or review the request details.",
  ].filter(Boolean).join("\n");

  return { html, text };
}

export async function handleAdditionalDocumentRequestEmail(
  payload: SendAdditionalDocumentRequestPayload,
) {
  const emailsEnabled = envEnabled(
    Deno.env.get("DOCUMENT_REQUEST_EMAILS_ENABLED"),
    true,
  );
  const transactionId = firstText(
    payload.transactionId,
    payload.transaction_id,
  );
  const recipientEmail = normalizeText(payload.to).toLowerCase();

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: "additional_document_request",
      sent: false,
      suppressed: true,
      reason: "document_request_emails_disabled",
      transactionId,
      recipientEmail,
    });
  }

  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const metadata = asRecord(payload.metadata);
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    organisationId: firstText(
      payload.organisationId,
      payload.organisation_id,
      metadata.organisationId,
      metadata.organisation_id,
    ),
    defaults: {
      organisationName: firstText(
        metadata.organisationName,
        metadata.agencyName,
        payload.organisationId ? "" : "Arch9",
      ) || "Arch9",
      supportEmail: firstText(metadata.supportEmail, metadata.support_email),
      supportPhone: firstText(metadata.supportPhone, metadata.support_phone),
    },
  });

  const subject = normalizeText(payload.subject) || "Document request";
  const title = normalizeText(payload.title) || "Document Request";
  const recipientName =
    firstText(payload.recipientName, payload.recipient_name) || "there";
  const message = normalizeText(payload.message) ||
    "A document has been requested for your transaction.";
  const actionLink = firstText(
    payload.actionLink,
    payload.action_link,
    metadata.actionLink,
    metadata.action_link,
    metadata.portalLink,
    metadata.portal_link,
    metadata.documentRequestLink,
    metadata.document_request_link,
  );
  const from = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <no-reply@arch9.co.za>",
    branding.fromName || branding.organisationName,
  );

  const { html, text } = buildAdditionalDocumentRequestEmail({
    recipientName,
    title,
    message,
    transactionId,
    actionLink,
    metadata,
    branding,
  });

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject,
    html,
    text,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the document request email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "additional_document_request",
    sent: true,
    transactionId,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
