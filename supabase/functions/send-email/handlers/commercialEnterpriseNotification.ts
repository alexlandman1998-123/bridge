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
import type { SendCommercialEnterpriseNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const EVENT_LABELS: Record<string, { title: string; subject: string }> = {
  agency_public_intake_received: {
    title: "Public Intake Received",
    subject: "New public intake received",
  },
  commercial_access_requested: {
    title: "Commercial Access Requested",
    subject: "Commercial access requested",
  },
  commercial_access_decision: {
    title: "Commercial Access Updated",
    subject: "Commercial access decision",
  },
  commercial_broker_assigned: {
    title: "Commercial Broker Assigned",
    subject: "Commercial broker assigned",
  },
  commercial_canvassing_prospect_created: {
    title: "Commercial Prospect Created",
    subject: "New commercial prospect created",
  },
  commercial_requirement_created: {
    title: "Commercial Requirement Created",
    subject: "New commercial requirement created",
  },
  commercial_requirement_stage_changed: {
    title: "Commercial Requirement Updated",
    subject: "Commercial requirement stage changed",
  },
  commercial_deal_created: {
    title: "Commercial Deal Created",
    subject: "New commercial deal created",
  },
  commercial_deal_stage_changed: {
    title: "Commercial Deal Updated",
    subject: "Commercial deal stage changed",
  },
  commercial_viewing_scheduled: {
    title: "Commercial Viewing Scheduled",
    subject: "Commercial viewing scheduled",
  },
  commercial_viewing_status_changed: {
    title: "Commercial Viewing Updated",
    subject: "Commercial viewing status changed",
  },
  commercial_document_request_created: {
    title: "Commercial Document Requested",
    subject: "Commercial document requested",
  },
  commercial_document_uploaded: {
    title: "Commercial Document Uploaded",
    subject: "Commercial document uploaded",
  },
  commercial_heads_of_terms_status_changed: {
    title: "Heads Of Terms Updated",
    subject: "Commercial heads of terms status changed",
  },
  commercial_transaction_status_changed: {
    title: "Commercial Transaction Updated",
    subject: "Commercial transaction status changed",
  },
  enterprise_member_scope_changed: {
    title: "Enterprise Access Scope Updated",
    subject: "Enterprise access scope updated",
  },
  enterprise_branch_team_assignment_changed: {
    title: "Enterprise Assignment Updated",
    subject: "Enterprise branch or team assignment changed",
  },
};

const DISPATCH_TYPES = new Set([
  "commercial_enterprise_dispatch",
  "commercial_enterprise_resend",
  "commercial_enterprise_notifications_dispatch",
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

function normalizeEventKind(
  payload: SendCommercialEnterpriseNotificationPayload,
) {
  const eventKind = firstText(
    payload.eventKind,
    payload.event_kind,
    payload.type,
  );
  if (eventKind === "commercial_enterprise_notification") {
    return "commercial_deal_stage_changed";
  }
  return EVENT_LABELS[eventKind] ? eventKind : "commercial_deal_stage_changed";
}

function defaultMessage({
  eventKind,
  entityLabel,
  status,
  previousStatus,
  brokerName,
}: {
  eventKind: string;
  entityLabel: string;
  status: string;
  previousStatus: string;
  brokerName: string;
}) {
  const entity = entityLabel || "the commercial record";
  if (eventKind === "agency_public_intake_received") {
    return `A new public intake has been received for ${entity}.`;
  }
  if (eventKind.includes("access")) {
    return `Commercial access ${
      status || "status"
    } has been updated for ${entity}.`;
  }
  if (eventKind.includes("assigned")) {
    return `${brokerName || "A broker"} has been assigned to ${entity}.`;
  }
  if (eventKind.includes("created")) {
    return `${entity} has been created in the commercial workspace.`;
  }
  if (eventKind.includes("stage") || eventKind.includes("status")) {
    return `${entity} moved${previousStatus ? ` from ${previousStatus}` : ""}${
      status ? ` to ${status}` : ""
    }.`;
  }
  return `Commercial workspace activity was recorded for ${entity}.`;
}

function defaultCtaLabel(eventKind: string) {
  if (eventKind.startsWith("enterprise_")) return "Open Enterprise Settings";
  if (eventKind.includes("access")) return "Review Access";
  if (eventKind.includes("intake")) return "Open Lead";
  if (eventKind.includes("document")) return "Open Documents";
  return "Open Commercial Workspace";
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
  if (eventKind.startsWith("enterprise_") || eventKind.includes("access")) {
    return `${appBaseUrl}/settings/users`;
  }
  if (eventKind.includes("intake")) return `${appBaseUrl}/leads`;
  if (eventKind.includes("requirement")) {
    return `${appBaseUrl}/commercial/requirements`;
  }
  if (eventKind.includes("viewing")) return `${appBaseUrl}/commercial/viewings`;
  if (eventKind.includes("document")) {
    return `${appBaseUrl}/commercial/documents`;
  }
  if (eventKind.includes("transaction")) {
    return `${appBaseUrl}/commercial/pipeline`;
  }
  return `${appBaseUrl}/commercial`;
}

export function buildCommercialEnterpriseNotificationEmail({
  eventKind,
  recipientName,
  title,
  message,
  actionLink,
  ctaLabel,
  entityLabel,
  entityType,
  status,
  previousStatus,
  brokerName,
  brokerEmail,
  branchName,
  teamName,
  requesterName,
  requesterEmail,
  clientName,
  propertyLabel,
  amountLabel,
  nextAction,
  branding,
}: {
  eventKind: string;
  recipientName: string;
  title: string;
  message: string;
  actionLink?: string;
  ctaLabel?: string;
  entityLabel?: string;
  entityType?: string;
  status?: string;
  previousStatus?: string;
  brokerName?: string;
  brokerEmail?: string;
  branchName?: string;
  teamName?: string;
  requesterName?: string;
  requesterEmail?: string;
  clientName?: string;
  propertyLabel?: string;
  amountLabel?: string;
  nextAction?: string;
  branding: EmailBranding;
}) {
  const fields = [
    { label: "Record", value: entityLabel || "" },
    { label: "Type", value: entityType || "" },
    { label: "Status", value: status || "" },
    { label: "Previous Status", value: previousStatus || "" },
    { label: "Broker", value: brokerName || brokerEmail || "" },
    { label: "Branch", value: branchName || "" },
    { label: "Team", value: teamName || "" },
    { label: "Requester", value: requesterName || requesterEmail || "" },
    { label: "Client", value: clientName || "" },
    { label: "Property", value: propertyLabel || "" },
    { label: "Value", value: amountLabel || "" },
    { label: "Next Action", value: nextAction || "" },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName || "there"},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(fields, "Commercial Summary"),
      actionLink
        ? renderBridgeCta(ctaLabel || defaultCtaLabel(eventKind), actionLink, {
          primaryColor: branding.primaryColor,
        })
        : "",
    ].join(""),
    securityTitle: "Commercial Workspace Visibility",
    securityBody:
      "Commercial and enterprise notifications only include records available to authorised account members.",
    helpBody:
      "Open the workspace to review the full record, owner, due dates and next actions.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  const text = [
    `Hi ${recipientName || "there"},`,
    "",
    message,
    entityLabel ? `Record: ${entityLabel}` : "",
    entityType ? `Type: ${entityType}` : "",
    previousStatus ? `Previous status: ${previousStatus}` : "",
    status ? `Status: ${status}` : "",
    brokerName || brokerEmail ? `Broker: ${brokerName || brokerEmail}` : "",
    branchName ? `Branch: ${branchName}` : "",
    teamName ? `Team: ${teamName}` : "",
    requesterName || requesterEmail
      ? `Requester: ${requesterName || requesterEmail}`
      : "",
    clientName ? `Client: ${clientName}` : "",
    propertyLabel ? `Property: ${propertyLabel}` : "",
    amountLabel ? `Value: ${amountLabel}` : "",
    nextAction ? `Next action: ${nextAction}` : "",
    actionLink
      ? `${ctaLabel || defaultCtaLabel(eventKind)}: ${actionLink}`
      : "",
  ].filter(Boolean).join("\n");

  return { html, text };
}

function contentFromPayload(
  req: Request,
  payload: SendCommercialEnterpriseNotificationPayload,
  branding: EmailBranding,
) {
  const metadata = asRecord(payload.metadata);
  const eventKind = normalizeEventKind(payload);
  const labels = EVENT_LABELS[eventKind] ||
    EVENT_LABELS.commercial_deal_stage_changed;
  const merged = { ...(payload as Record<string, unknown>), ...metadata };
  const entityLabel = firstText(
    payload.entityLabel,
    payload.entity_label,
    metadata.entityLabel,
    metadata.entity_label,
    metadata.requirementName,
    metadata.dealName,
    metadata.transactionName,
  );
  const status = firstText(payload.status, metadata.status);
  const previousStatus = firstText(
    payload.previousStatus,
    payload.previous_status,
    metadata.previousStatus,
    metadata.previous_status,
  );
  const brokerName = firstText(
    payload.brokerName,
    payload.broker_name,
    metadata.brokerName,
  );
  const message = firstText(payload.message, metadata.message) ||
    defaultMessage({
      eventKind,
      entityLabel,
      status,
      previousStatus,
      brokerName,
    });
  const subject = firstText(payload.subject, metadata.subject) ||
    labels.subject;
  const title = firstText(payload.title, metadata.title) || labels.title;
  const email = buildCommercialEnterpriseNotificationEmail({
    eventKind,
    recipientName: firstText(
      payload.recipientName,
      payload.recipient_name,
      metadata.recipientName,
    ),
    title,
    message,
    actionLink: actionLinkFor(req, merged, eventKind),
    ctaLabel: firstText(payload.ctaLabel, payload.cta_label, metadata.ctaLabel),
    entityLabel,
    entityType: firstText(
      payload.entityType,
      payload.entity_type,
      metadata.entityType,
    ),
    status,
    previousStatus,
    brokerName,
    brokerEmail: firstText(
      payload.brokerEmail,
      payload.broker_email,
      metadata.brokerEmail,
    ),
    branchName: firstText(
      payload.branchName,
      payload.branch_name,
      metadata.branchName,
    ),
    teamName: firstText(payload.teamName, payload.team_name, metadata.teamName),
    requesterName: firstText(
      payload.requesterName,
      payload.requester_name,
      metadata.requesterName,
    ),
    requesterEmail: firstText(
      payload.requesterEmail,
      payload.requester_email,
      metadata.requesterEmail,
    ),
    clientName: firstText(
      payload.clientName,
      payload.client_name,
      metadata.clientName,
    ),
    propertyLabel: firstText(
      payload.propertyLabel,
      payload.property_label,
      metadata.propertyLabel,
    ),
    amountLabel: firstText(
      payload.amountLabel,
      payload.amount_label,
      metadata.amountLabel,
    ),
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
      "commercial_enterprise_notification",
    eventKind: normalizeText(event.automation_key) ||
      normalizeText(event.event_key),
    to: normalizeText(event.recipient_email),
    subject: normalizeText(event.subject),
    message: normalizeText(event.message_preview),
    organisationId: normalizeText(event.organisation_id),
    recipientName: firstText(payload.recipientName, metadata.recipientName),
  } as SendCommercialEnterpriseNotificationPayload;
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
      source: "commercial_enterprise_notification",
      phase: "phase_8_commercial_enterprise_layer",
      notificationEventId: event.id,
      automationKey: event.automation_key,
      dedupeKey: event.dedupe_key || null,
    },
  }).select("id").single();
  return inserted.error ? null : inserted.data;
}

async function dispatchQueuedEvents(
  req: Request,
  payload: SendCommercialEnterpriseNotificationPayload,
) {
  if (!isServiceRequest(req)) {
    return jsonResponse(403, {
      error:
        "Service role authorization is required for commercial/enterprise dispatch.",
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
    "bridge_claim_commercial_enterprise_notifications_phase8",
    {
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
        ) || "Arch9 <onboarding@resend.dev>",
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
        { status: "sent", providerMessageId: providerId },
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
        providerMessageId: providerId,
      });
    } else {
      const message = normalizeText(sendResult.error?.message) ||
        "Resend rejected the commercial/enterprise notification email.";
      const delivery = await insertCommunicationDelivery(
        supabase,
        event,
        content,
        { status: "failed", errorMessage: message },
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

export async function handleCommercialEnterpriseNotificationEmail(
  req: Request,
  payload: SendCommercialEnterpriseNotificationPayload,
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
      error: "Resend rejected the commercial/enterprise notification email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: content.eventKind,
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
