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
import { applyNotificationQueueControls } from "../services/notificationControls.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendBondAttorneyLegalNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const EVENT_LABELS: Record<string, { title: string; subject: string }> = {
  bond_application_submitted: {
    title: "Bond Application Submitted",
    subject: "Bond application submitted",
  },
  bond_application_status_changed: {
    title: "Bond Application Updated",
    subject: "Bond application status changed",
  },
  bond_additional_documents_requested: {
    title: "Bond Documents Requested",
    subject: "Additional bond documents requested",
  },
  bond_document_uploaded: {
    title: "Bond Document Uploaded",
    subject: "Bond document uploaded",
  },
  bond_bank_offer_received: {
    title: "Bank Offer Received",
    subject: "New bank offer received",
  },
  bond_bank_offer_buyer_decision: {
    title: "Bank Offer Decision",
    subject: "Buyer responded to a bank offer",
  },
  bond_grant_received: {
    title: "Bond Grant Received",
    subject: "Bond grant received",
  },
  bond_grant_published: {
    title: "Bond Grant Published",
    subject: "Bond grant published",
  },
  bond_delivery_failed: {
    title: "Bond Delivery Failed",
    subject: "Bond delivery failed",
  },
  attorney_instruction_ready: {
    title: "Attorney Instruction Ready",
    subject: "Attorney instruction ready",
  },
  attorney_instruction_accepted: {
    title: "Attorney Instruction Accepted",
    subject: "Attorney instruction accepted",
  },
  attorney_instruction_declined: {
    title: "Attorney Instruction Declined",
    subject: "Attorney instruction declined",
  },
  attorney_assignment_changed: {
    title: "Attorney Assignment Changed",
    subject: "Attorney assignment changed",
  },
  attorney_matter_stage_changed: {
    title: "Attorney Matter Updated",
    subject: "Attorney matter stage changed",
  },
  attorney_client_financial_document_published: {
    title: "Client Financial Document Published",
    subject: "Client financial document published",
  },
  legal_packet_generated: {
    title: "Legal Packet Generated",
    subject: "Legal packet generated",
  },
  legal_packet_sent_for_signing: {
    title: "Legal Packet Sent For Signing",
    subject: "Legal packet sent for signing",
  },
  legal_signer_viewed: {
    title: "Signer Viewed Legal Packet",
    subject: "Signer viewed legal packet",
  },
  legal_signer_signed: {
    title: "Signer Completed Signing",
    subject: "Signer completed signing",
  },
  legal_packet_completed: {
    title: "Legal Packet Completed",
    subject: "Legal packet completed",
  },
  legal_signing_dispatch_failed: {
    title: "Signing Dispatch Failed",
    subject: "Legal signing delivery failed",
  },
};

const DISPATCH_TYPES = new Set([
  "bond_attorney_legal_dispatch",
  "bond_attorney_legal_resend",
  "bond_attorney_legal_notifications_dispatch",
]);

function uuid(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
      .test(normalized)
    ? normalized
    : "";
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

async function serviceClient() {
  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const key = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !key) return null;
  const { createClient } = await import("supabase");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
      jwtRole(authorization) === "service_role",
  );
}

function normalizeEventKind(payload: SendBondAttorneyLegalNotificationPayload) {
  const eventKind = firstText(
    payload.eventKind,
    payload.event_kind,
    payload.type,
  );
  if (eventKind === "bond_attorney_legal_notification") {
    return "bond_application_status_changed";
  }
  return EVENT_LABELS[eventKind]
    ? eventKind
    : "bond_application_status_changed";
}

function defaultMessage({
  eventKind,
  transactionReference,
  workflowLabel,
  status,
  institutionName,
  signerName,
  reason,
}: {
  eventKind: string;
  transactionReference: string;
  workflowLabel: string;
  status: string;
  institutionName: string;
  signerName: string;
  reason: string;
}) {
  const transaction = transactionReference || "the transaction";
  if (eventKind.startsWith("bond_")) {
    if (eventKind === "bond_bank_offer_received") {
      return `${
        institutionName || "A bank"
      } has issued a bond offer for ${transaction}.`;
    }
    if (eventKind === "bond_grant_received") {
      return `${
        institutionName || "A bank"
      } has issued a bond grant for ${transaction}.`;
    }
    if (eventKind === "bond_delivery_failed") {
      return `Bond delivery failed for ${transaction}${
        reason ? `: ${reason}` : "."
      }`;
    }
    return `Bond workflow ${workflowLabel || "activity"} changed${
      status ? ` to ${status}` : ""
    } for ${transaction}.`;
  }
  if (eventKind.startsWith("attorney_")) {
    return `Attorney workflow ${workflowLabel || "activity"} changed${
      status ? ` to ${status}` : ""
    } for ${transaction}${reason ? `: ${reason}` : "."}`;
  }
  if (eventKind === "legal_signer_viewed") {
    return `${
      signerName || "A signer"
    } viewed the legal packet for ${transaction}.`;
  }
  if (eventKind === "legal_signer_signed") {
    return `${signerName || "A signer"} completed signing for ${transaction}.`;
  }
  if (eventKind === "legal_signing_dispatch_failed") {
    return `Legal signing delivery failed for ${transaction}${
      reason ? `: ${reason}` : "."
    }`;
  }
  return `Legal workflow ${
    workflowLabel || "activity"
  } changed for ${transaction}.`;
}

function defaultCtaLabel(eventKind: string) {
  if (eventKind.startsWith("bond_")) return "Open Bond Workflow";
  if (eventKind.startsWith("attorney_")) return "Open Attorney Workflow";
  return "Open Legal Packet";
}

function actionLinkFor(
  req: Request,
  payload: Record<string, unknown>,
  eventKind: string,
) {
  const direct = firstText(payload.actionLink, payload.action_link);
  if (direct) return direct;
  const appBaseUrl = resolveAppBaseUrl(req);
  if (!appBaseUrl) return "";
  const transactionId = firstText(
    payload.transactionId,
    payload.transaction_id,
  );
  const packetId = firstText(payload.packetId, payload.packet_id);
  if (eventKind.startsWith("legal_") && packetId) {
    return `${appBaseUrl}/legal/packets/${encodeURIComponent(packetId)}`;
  }
  return transactionId
    ? `${appBaseUrl}/transactions/${encodeURIComponent(transactionId)}`
    : appBaseUrl;
}

export function buildBondAttorneyLegalNotificationEmail({
  eventKind,
  recipientName,
  title,
  message,
  actionLink,
  ctaLabel,
  transactionReference,
  transactionId,
  propertyLabel,
  workflowLabel,
  status,
  previousStatus,
  institutionName,
  partyName,
  partyEmail,
  documentTitle,
  packetTitle,
  packetType,
  signerName,
  signerRole,
  amountLabel,
  reason,
  nextAction,
  branding,
}: {
  eventKind: string;
  recipientName: string;
  title: string;
  message: string;
  actionLink?: string;
  ctaLabel?: string;
  transactionReference?: string;
  transactionId?: string;
  propertyLabel?: string;
  workflowLabel?: string;
  status?: string;
  previousStatus?: string;
  institutionName?: string;
  partyName?: string;
  partyEmail?: string;
  documentTitle?: string;
  packetTitle?: string;
  packetType?: string;
  signerName?: string;
  signerRole?: string;
  amountLabel?: string;
  reason?: string;
  nextAction?: string;
  branding: EmailBranding;
}) {
  const fields = [
    {
      label: "Transaction",
      value: transactionReference || transactionId || "",
    },
    { label: "Property", value: propertyLabel || "" },
    { label: "Workflow", value: workflowLabel || "" },
    { label: "Status", value: status || "" },
    { label: "Previous Status", value: previousStatus || "" },
    { label: "Institution", value: institutionName || "" },
    { label: "Party", value: partyName || partyEmail || "" },
    { label: "Document", value: documentTitle || "" },
    { label: "Legal Packet", value: packetTitle || packetType || "" },
    { label: "Signer", value: signerName || signerRole || "" },
    { label: "Amount", value: amountLabel || "" },
    { label: "Reason", value: reason || "" },
    { label: "Next Action", value: nextAction || "" },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName || "there"},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(fields, "Workflow Summary"),
      actionLink
        ? renderBridgeCta(ctaLabel || defaultCtaLabel(eventKind), actionLink, {
          primaryColor: branding.primaryColor,
        })
        : "",
    ].join(""),
    securityBody:
      "Bond, attorney and legal workflow details are shared only with authorised people in the account.",
    helpBody: eventKind.includes("failed") || eventKind.includes("declined")
      ? "Open the workflow to review the exception and assign the next action."
      : "Open the workflow to review the latest activity and keep the matter moving.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  const text = [
    `Hi ${recipientName || "there"},`,
    "",
    message,
    transactionReference || transactionId
      ? `Transaction: ${transactionReference || transactionId}`
      : "",
    propertyLabel ? `Property: ${propertyLabel}` : "",
    workflowLabel ? `Workflow: ${workflowLabel}` : "",
    previousStatus ? `Previous status: ${previousStatus}` : "",
    status ? `Status: ${status}` : "",
    institutionName ? `Institution: ${institutionName}` : "",
    partyName || partyEmail ? `Party: ${partyName || partyEmail}` : "",
    documentTitle ? `Document: ${documentTitle}` : "",
    packetTitle || packetType
      ? `Legal packet: ${packetTitle || packetType}`
      : "",
    signerName || signerRole ? `Signer: ${signerName || signerRole}` : "",
    amountLabel ? `Amount: ${amountLabel}` : "",
    reason ? `Reason: ${reason}` : "",
    nextAction ? `Next action: ${nextAction}` : "",
    actionLink
      ? `${ctaLabel || defaultCtaLabel(eventKind)}: ${actionLink}`
      : "",
  ].filter(Boolean).join("\n");

  return { html, text };
}

function contentFromPayload(
  req: Request,
  payload: SendBondAttorneyLegalNotificationPayload,
  branding: EmailBranding,
) {
  const metadata = asRecord(payload.metadata);
  const eventKind = normalizeEventKind(payload);
  const labels = EVENT_LABELS[eventKind] ||
    EVENT_LABELS.bond_application_status_changed;
  const merged = { ...(payload as Record<string, unknown>), ...metadata };
  const transactionReference = firstText(
    payload.transactionReference,
    payload.transaction_reference,
    metadata.transactionReference,
    metadata.transaction_reference,
  );
  const workflowLabel = firstText(
    payload.workflowLabel,
    payload.workflow_label,
    metadata.workflowLabel,
  );
  const status = firstText(payload.status, metadata.status);
  const institutionName = firstText(
    payload.institutionName,
    payload.institution_name,
    metadata.institutionName,
    metadata.bankName,
  );
  const signerName = firstText(
    payload.signerName,
    payload.signer_name,
    metadata.signerName,
  );
  const reason = firstText(
    payload.reason,
    metadata.reason,
    metadata.errorSummary,
  );
  const message = firstText(payload.message, metadata.message) ||
    defaultMessage({
      eventKind,
      transactionReference,
      workflowLabel,
      status,
      institutionName,
      signerName,
      reason,
    });
  const subject = firstText(payload.subject, metadata.subject) ||
    labels.subject;
  const title = firstText(payload.title, metadata.title) || labels.title;
  const actionLink = actionLinkFor(req, merged, eventKind);
  const email = buildBondAttorneyLegalNotificationEmail({
    eventKind,
    recipientName: firstText(
      payload.recipientName,
      payload.recipient_name,
      metadata.recipientName,
    ),
    title,
    message,
    actionLink,
    ctaLabel: firstText(payload.ctaLabel, payload.cta_label, metadata.ctaLabel),
    transactionReference,
    transactionId: firstText(
      payload.transactionId,
      payload.transaction_id,
      metadata.transactionId,
    ),
    propertyLabel: firstText(
      payload.propertyLabel,
      payload.property_label,
      metadata.propertyLabel,
    ),
    workflowLabel,
    status,
    previousStatus: firstText(
      payload.previousStatus,
      payload.previous_status,
      metadata.previousStatus,
    ),
    institutionName,
    partyName: firstText(
      payload.partyName,
      payload.party_name,
      metadata.partyName,
    ),
    partyEmail: firstText(
      payload.partyEmail,
      payload.party_email,
      metadata.partyEmail,
    ),
    documentTitle: firstText(
      payload.documentTitle,
      payload.document_title,
      metadata.documentTitle,
    ),
    packetTitle: firstText(
      payload.packetTitle,
      payload.packet_title,
      metadata.packetTitle,
    ),
    packetType: firstText(
      payload.packetType,
      payload.packet_type,
      metadata.packetType,
    ),
    signerName,
    signerRole: firstText(
      payload.signerRole,
      payload.signer_role,
      metadata.signerRole,
    ),
    amountLabel: firstText(
      payload.amountLabel,
      payload.amount_label,
      metadata.amountLabel,
    ),
    reason,
    nextAction: firstText(
      payload.nextAction,
      payload.next_action,
      metadata.nextAction,
    ),
    branding,
  });
  return { ...email, eventKind, subject, messagePreview: message };
}

function payloadFromEvent(event: Record<string, unknown>) {
  const payload = asRecord(event.payload_json);
  const metadata = asRecord(event.metadata_json);
  return {
    ...payload,
    metadata,
    type: normalizeText(event.automation_key) ||
      "bond_attorney_legal_notification",
    eventKind: normalizeText(event.automation_key) ||
      normalizeText(event.event_key),
    to: normalizeText(event.recipient_email),
    subject: normalizeText(event.subject),
    message: normalizeText(event.message_preview),
    transactionId: normalizeText(event.transaction_id),
    organisationId: normalizeText(event.organisation_id),
    recipientName: firstText(payload.recipientName, metadata.recipientName),
  } as SendBondAttorneyLegalNotificationPayload;
}

async function insertCommunicationDelivery(
  supabase: any,
  event: Record<string, unknown>,
  content: { subject: string; messagePreview: string },
  {
    status,
    providerMessageId = "",
    errorMessage = "",
  }: {
    status: "sent" | "failed";
    providerMessageId?: string | null;
    errorMessage?: string | null;
  },
) {
  const now = new Date().toISOString();
  const inserted = await supabase.from("communication_deliveries").insert({
    organisation_id: uuid(event.organisation_id),
    branch_id: uuid(event.branch_id) || null,
    transaction_id: uuid(event.transaction_id) || null,
    communication_type: normalizeText(event.automation_key),
    automation_key: normalizeText(event.automation_key),
    notification_event_id: uuid(event.id),
    channel: "email",
    recipient: normalizeText(event.recipient_email).toLowerCase(),
    recipient_role: normalizeText(event.recipient_role).toLowerCase() || null,
    subject: content.subject,
    message_preview: content.messagePreview,
    status,
    provider: "resend",
    provider_message_id: normalizeText(providerMessageId) || null,
    error_message: normalizeText(errorMessage) || null,
    prepared_at: now,
    sent_at: status === "sent" ? now : null,
    failed_at: status === "failed" ? now : null,
    metadata_json: {
      source: "bond_attorney_legal_notification",
      phase: "phase_6_bond_attorney_legal_workflow_coverage",
      notificationEventId: event.id,
      automationKey: event.automation_key,
      dedupeKey: event.dedupe_key || null,
    },
  }).select("id").single();
  return inserted.error ? null : inserted.data;
}

async function dispatchQueuedEvents(
  req: Request,
  payload: SendBondAttorneyLegalNotificationPayload,
) {
  if (!isServiceRequest(req)) {
    return jsonResponse(403, {
      error: "Service role authorization is required for bond/legal dispatch.",
    });
  }
  const supabase = await serviceClient();
  if (!supabase) {
    return jsonResponse(500, {
      error: "Notification delivery is not configured.",
    });
  }
  await applyNotificationQueueControls(supabase, {
    limit: Math.max(1, Math.min(Number(payload.limit) || 25, 100)),
    now: normalizeText(asRecord(payload).now),
    eventId: uuid(payload.eventId || payload.event_id),
  });

  const claim = await supabase.rpc(
    "bridge_claim_bond_attorney_legal_notifications_phase6",
    {
      p_transaction_id: uuid(payload.transactionId || payload.transaction_id) ||
        null,
      p_event_id: uuid(payload.eventId || payload.event_id) || null,
      p_limit: Math.max(1, Math.min(Number(payload.limit) || 25, 100)),
    },
  );
  if (claim.error) return jsonResponse(500, { error: claim.error.message });

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  const results: Array<Record<string, unknown>> = [];
  for (const event of claim.data || []) {
    const eventPayload = payloadFromEvent(event);
    const branding = await resolveEmailBranding({
      supabase,
      payload: {
        ...asRecord(event.payload_json),
        ...asRecord(event.metadata_json),
      },
      organisationId: uuid(event.organisation_id),
      defaults: { organisationName: "Arch9" },
    });
    const content = contentFromPayload(req, eventPayload, branding);
    if (!resendApiKey) {
      const message = "Missing RESEND_API_KEY secret.";
      await supabase.from("notification_events").update({
        status: "failed",
        error_message: message,
        last_dispatch_error: message,
        failed_at: new Date().toISOString(),
        next_dispatch_attempt_at: new Date(Date.now() + 300_000).toISOString(),
      }).eq("id", event.id);
      results.push({ eventId: event.id, sent: false, error: message });
      continue;
    }
    const sendResult = await sendViaResendApi({
      apiKey: resendApiKey,
      from: formatEmailSender(
        normalizeText(
          Deno.env.get("ARCH9_RESEND_FROM_EMAIL") ||
            Deno.env.get("RESEND_FROM_EMAIL"),
        ) ||
          "Arch9 <onboarding@resend.dev>",
        branding.fromName || branding.organisationName,
      ),
      to: normalizeText(event.recipient_email).toLowerCase(),
      subject: content.subject,
      html: content.html,
      text: content.text,
      idempotencyKey: normalizeText(event.idempotency_key || event.dedupe_key),
      timeoutMs: 15_000,
    });

    if (sendResult.ok) {
      const providerId = normalizeText(sendResult.data?.id);
      const delivery = await insertCommunicationDelivery(
        supabase,
        event,
        content,
        {
          status: "sent",
          providerMessageId: providerId,
        },
      );
      await supabase.from("notification_events").update({
        status: "sent",
        provider: "resend",
        provider_message_id: providerId || null,
        communication_delivery_id: delivery?.id || null,
        sent_at: new Date().toISOString(),
        error_message: null,
        last_dispatch_error: null,
        next_dispatch_attempt_at: null,
      }).eq("id", event.id);
      results.push({
        eventId: event.id,
        sent: true,
        providerMessageId: providerId || null,
      });
    } else {
      const message = normalizeText(sendResult.error?.message) ||
        "Resend rejected the bond/legal workflow notification email.";
      const delivery = await insertCommunicationDelivery(
        supabase,
        event,
        content,
        {
          status: "failed",
          errorMessage: message,
        },
      );
      const attempts = Number(event.dispatch_attempt_count) || 1;
      const exhausted = attempts >= (Number(event.max_dispatch_attempts) || 5);
      await supabase.from("notification_events").update({
        status: "failed",
        communication_delivery_id: delivery?.id || null,
        error_message: message,
        last_dispatch_error: message,
        failed_at: new Date().toISOString(),
        next_dispatch_attempt_at: exhausted
          ? null
          : new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000)
            .toISOString(),
      }).eq("id", event.id);
      results.push({
        eventId: event.id,
        sent: false,
        error: message,
        exhausted,
      });
    }
  }

  return jsonResponse(200, {
    success: true,
    claimed: (claim.data || []).length,
    sent: results.filter((item) => item.sent === true).length,
    failed: results.filter((item) => item.sent !== true).length,
    results,
  });
}

export async function handleBondAttorneyLegalNotificationEmail(
  req: Request,
  payload: SendBondAttorneyLegalNotificationPayload,
) {
  const type = normalizeText(payload.type);
  if (DISPATCH_TYPES.has(type)) {
    return await dispatchQueuedEvents(req, payload);
  }

  const recipientEmail = normalizeText(payload.to).toLowerCase();
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
        payload.organisationName,
        payload.organisation_name,
        metadata.organisationName,
        metadata.organisation_name,
      ) || "Arch9",
      supportEmail: firstText(metadata.supportEmail, metadata.support_email),
      supportPhone: firstText(metadata.supportPhone, metadata.support_phone),
    },
  });
  const content = contentFromPayload(req, payload, branding);
  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: formatEmailSender(
      normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
        "Arch9 <no-reply@arch9.co.za>",
      branding.fromName || branding.organisationName,
    ),
    to: recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the bond/legal workflow notification email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: content.eventKind,
    sent: true,
    transactionId: firstText(payload.transactionId, payload.transaction_id),
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
