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
import type { SendTransactionOperationsNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const EVENT_LABELS: Record<string, { title: string; subject: string }> = {
  transaction_created: {
    title: "Transaction Created",
    subject: "New transaction created",
  },
  transaction_owner_changed: {
    title: "Transaction Owner Changed",
    subject: "Transaction owner changed",
  },
  transaction_roleplayer_assigned: {
    title: "Roleplayer Assigned",
    subject: "Transaction roleplayer assigned",
  },
  transaction_roleplayer_reassigned: {
    title: "Roleplayer Reassigned",
    subject: "Transaction roleplayer reassigned",
  },
  transaction_partner_accepted: {
    title: "Partner Accepted",
    subject: "Transaction partner accepted",
  },
  transaction_partner_declined: {
    title: "Partner Declined",
    subject: "Transaction partner declined",
  },
  attorney_invite_accepted: {
    title: "Attorney Accepted",
    subject: "Attorney invite accepted",
  },
  bond_originator_invite_accepted: {
    title: "Bond Originator Accepted",
    subject: "Bond originator invite accepted",
  },
  transaction_stage_changed: {
    title: "Transaction Stage Changed",
    subject: "Transaction stage changed",
  },
  transaction_stalled: {
    title: "Transaction Stalled",
    subject: "Transaction needs attention",
  },
  transaction_cancelled: {
    title: "Transaction Cancelled",
    subject: "Transaction cancelled",
  },
  transaction_archived: {
    title: "Transaction Archived",
    subject: "Transaction archived",
  },
  transaction_reactivated: {
    title: "Transaction Reactivated",
    subject: "Transaction reactivated",
  },
};

const DISPATCH_TYPES = new Set([
  "transaction_operations_dispatch",
  "transaction_operations_resend",
  "transaction_operations_notifications_dispatch",
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
  payload: SendTransactionOperationsNotificationPayload,
) {
  const explicit = firstText(payload.eventKind, payload.event_kind);
  const type = normalizeText(payload.type);
  const eventKind = explicit || type;
  if (eventKind === "transaction_operations_notification") {
    return "transaction_stage_changed";
  }
  return EVENT_LABELS[eventKind] ? eventKind : "transaction_stage_changed";
}

function defaultMessage({
  eventKind,
  transactionReference,
  roleLabel,
  partnerName,
  previousOwnerName,
  ownerName,
  previousStage,
  stage,
  reason,
}: {
  eventKind: string;
  transactionReference: string;
  roleLabel: string;
  partnerName: string;
  previousOwnerName: string;
  ownerName: string;
  previousStage: string;
  stage: string;
  reason: string;
}) {
  const transaction = transactionReference || "the transaction";
  if (eventKind === "transaction_created") {
    return `${transaction} has been created and is ready for review.`;
  }
  if (eventKind === "transaction_owner_changed") {
    return `${transaction} was reassigned${
      ownerName ? ` to ${ownerName}` : ""
    }${previousOwnerName ? ` from ${previousOwnerName}` : ""}.`;
  }
  if (eventKind === "transaction_partner_declined") {
    return `${partnerName || "A transaction partner"} declined the ${
      roleLabel || "transaction partner"
    } invitation for ${transaction}. Replacement action is required.`;
  }
  if (
    eventKind === "transaction_partner_accepted" ||
    eventKind === "attorney_invite_accepted" ||
    eventKind === "bond_originator_invite_accepted"
  ) {
    return `${partnerName || "A transaction partner"} accepted the ${
      roleLabel || "transaction partner"
    } invitation for ${transaction}.`;
  }
  if (
    eventKind === "transaction_roleplayer_assigned" ||
    eventKind === "transaction_roleplayer_reassigned"
  ) {
    return `${
      roleLabel || "A roleplayer"
    } has been assigned to ${transaction}.`;
  }
  if (eventKind === "transaction_stalled") {
    return `${transaction} has had no meaningful activity${
      reason ? `: ${reason}` : "."
    }`;
  }
  if (eventKind === "transaction_cancelled") {
    return `${transaction} has been cancelled${reason ? `: ${reason}` : "."}`;
  }
  if (eventKind === "transaction_archived") {
    return `${transaction} has been archived${reason ? `: ${reason}` : "."}`;
  }
  if (eventKind === "transaction_reactivated") {
    return `${transaction} has been reactivated and is back in the active workflow.`;
  }
  return `${transaction} moved from ${
    previousStage || "the previous stage"
  } to ${stage || "the next stage"}.`;
}

function actionLinkFor(
  req: Request,
  payload: Record<string, unknown>,
  transactionId: string,
) {
  const direct = firstText(payload.actionLink, payload.action_link);
  if (direct) return direct;
  const appBaseUrl = resolveAppBaseUrl(req);
  return appBaseUrl && transactionId
    ? `${appBaseUrl}/transactions/${encodeURIComponent(transactionId)}`
    : "";
}

export function buildTransactionOperationsNotificationEmail({
  eventKind,
  recipientName,
  title,
  message,
  actionLink,
  transactionReference,
  transactionId,
  propertyLabel,
  stage,
  previousStage,
  status,
  ownerName,
  ownerEmail,
  previousOwnerName,
  previousOwnerEmail,
  roleLabel,
  partnerName,
  partnerEmail,
  reason,
  nextAction,
  branding,
}: {
  eventKind: string;
  recipientName: string;
  title: string;
  message: string;
  actionLink?: string;
  transactionReference?: string;
  transactionId?: string;
  propertyLabel?: string;
  stage?: string;
  previousStage?: string;
  status?: string;
  ownerName?: string;
  ownerEmail?: string;
  previousOwnerName?: string;
  previousOwnerEmail?: string;
  roleLabel?: string;
  partnerName?: string;
  partnerEmail?: string;
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
    { label: "Current Stage", value: stage || "" },
    { label: "Previous Stage", value: previousStage || "" },
    { label: "Status", value: status || "" },
    { label: "Owner", value: ownerName || ownerEmail || "" },
    {
      label: "Previous Owner",
      value: previousOwnerName || previousOwnerEmail || "",
    },
    { label: "Role", value: roleLabel || "" },
    { label: "Partner", value: partnerName || partnerEmail || "" },
    { label: "Reason", value: reason || "" },
    { label: "Next Action", value: nextAction || "" },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName || "there"},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(fields, "Transaction Summary"),
      actionLink
        ? renderBridgeCta("Open Transaction", actionLink, {
          primaryColor: branding.primaryColor,
        })
        : "",
    ].join(""),
    securityBody:
      "Transaction details are shared only with authorised people in the account.",
    helpBody: eventKind === "transaction_partner_declined" ||
        eventKind === "transaction_stalled"
      ? "Open the transaction to review the exception and assign the next action."
      : "Open the transaction to review the latest activity and continue the workflow.",
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
    previousStage ? `Previous stage: ${previousStage}` : "",
    stage ? `Current stage: ${stage}` : "",
    status ? `Status: ${status}` : "",
    ownerName || ownerEmail ? `Owner: ${ownerName || ownerEmail}` : "",
    previousOwnerName || previousOwnerEmail
      ? `Previous owner: ${previousOwnerName || previousOwnerEmail}`
      : "",
    roleLabel ? `Role: ${roleLabel}` : "",
    partnerName || partnerEmail
      ? `Partner: ${partnerName || partnerEmail}`
      : "",
    reason ? `Reason: ${reason}` : "",
    nextAction ? `Next action: ${nextAction}` : "",
    actionLink ? `Open transaction: ${actionLink}` : "",
  ].filter(Boolean).join("\n");

  return { html, text };
}

function contentFromPayload(
  req: Request,
  payload: SendTransactionOperationsNotificationPayload,
  branding: EmailBranding,
) {
  const metadata = asRecord(payload.metadata);
  const eventKind = normalizeEventKind(payload);
  const labels = EVENT_LABELS[eventKind] ||
    EVENT_LABELS.transaction_stage_changed;
  const transactionId = firstText(
    payload.transactionId,
    payload.transaction_id,
    metadata.transactionId,
    metadata.transaction_id,
  );
  const transactionReference = firstText(
    payload.transactionReference,
    payload.transaction_reference,
    metadata.transactionReference,
    metadata.transaction_reference,
  );
  const roleLabel = firstText(
    payload.roleLabel,
    payload.role_label,
    metadata.roleLabel,
  );
  const partnerName = firstText(
    payload.partnerName,
    payload.partner_name,
    metadata.partnerName,
    metadata.companyName,
    metadata.contactName,
  );
  const previousOwnerName = firstText(
    payload.previousOwnerName,
    payload.previous_owner_name,
    metadata.previousOwnerName,
  );
  const ownerName = firstText(
    payload.ownerName,
    payload.owner_name,
    metadata.ownerName,
  );
  const previousStage = firstText(
    payload.previousStage,
    payload.previous_stage,
    metadata.previousStage,
  );
  const stage = firstText(
    payload.stage,
    metadata.stage,
    payload.currentStage,
    metadata.currentStage,
  );
  const reason = firstText(payload.reason, metadata.reason);
  const message = firstText(payload.message, metadata.message) ||
    defaultMessage({
      eventKind,
      transactionReference,
      roleLabel,
      partnerName,
      previousOwnerName,
      ownerName,
      previousStage,
      stage,
      reason,
    });
  const actionLink = actionLinkFor(req, {
    ...(payload as Record<string, unknown>),
    ...metadata,
  }, transactionId);
  const subject = firstText(payload.subject, metadata.subject) ||
    labels.subject;
  const title = firstText(payload.title, metadata.title) || labels.title;
  const email = buildTransactionOperationsNotificationEmail({
    eventKind,
    recipientName: firstText(
      payload.recipientName,
      payload.recipient_name,
      metadata.recipientName,
    ),
    title,
    message,
    actionLink,
    transactionReference,
    transactionId,
    propertyLabel: firstText(
      payload.propertyLabel,
      payload.property_label,
      metadata.propertyLabel,
    ),
    stage,
    previousStage,
    status: firstText(payload.status, metadata.status),
    ownerName,
    ownerEmail: firstText(
      payload.ownerEmail,
      payload.owner_email,
      metadata.ownerEmail,
    ),
    previousOwnerName,
    previousOwnerEmail: firstText(
      payload.previousOwnerEmail,
      payload.previous_owner_email,
      metadata.previousOwnerEmail,
    ),
    roleLabel,
    partnerName,
    partnerEmail: firstText(
      payload.partnerEmail,
      payload.partner_email,
      metadata.partnerEmail,
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
      "transaction_operations_notification",
    eventKind: normalizeText(event.automation_key) ||
      normalizeText(event.event_key),
    to: normalizeText(event.recipient_email),
    subject: normalizeText(event.subject),
    message: normalizeText(event.message_preview),
    transactionId: normalizeText(event.transaction_id),
    organisationId: normalizeText(event.organisation_id),
    recipientName: firstText(payload.recipientName, metadata.recipientName),
  } as SendTransactionOperationsNotificationPayload;
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
      source: "transaction_operations_notification",
      phase: "phase_4_transaction_roleplayer_notifications",
      notificationEventId: event.id,
      automationKey: event.automation_key,
      dedupeKey: event.dedupe_key || null,
    },
  }).select("id").single();
  return inserted.error ? null : inserted.data;
}

async function dispatchQueuedEvents(
  req: Request,
  payload: SendTransactionOperationsNotificationPayload,
) {
  if (!isServiceRequest(req)) {
    return jsonResponse(403, {
      error: "Service role authorization is required for transaction dispatch.",
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
    now: normalizeText(payload.now),
    eventId: uuid(payload.eventId || payload.event_id),
  });

  const queueDue = payload.queueDue ?? payload.queue_due ?? true;
  let stalledQueueResult: Record<string, unknown> | null = null;
  if (queueDue) {
    const queued = await supabase.rpc(
      "bridge_queue_transaction_stalled_notifications_phase4",
      {
        p_limit: Math.max(
          1,
          Math.min(
            Number(payload.queueLimit ?? payload.queue_limit) || 100,
            500,
          ),
        ),
        p_now: normalizeText(payload.now) || new Date().toISOString(),
        p_dry_run: payload.dryRun === true || payload.dry_run === true,
        p_stalled_after_days: Math.max(
          1,
          Math.min(
            Number(payload.stalledAfterDays ?? payload.stalled_after_days) || 7,
            90,
          ),
        ),
      },
    );
    if (queued.error) {
      const message = normalizeText(queued.error.message).toLowerCase();
      const code = normalizeText(queued.error.code).toUpperCase();
      if (
        code !== "42883" &&
        !message.includes(
          "bridge_queue_transaction_stalled_notifications_phase4",
        )
      ) {
        return jsonResponse(500, { error: queued.error.message });
      }
    } else {
      stalledQueueResult = asRecord(queued.data);
    }
  }
  const claim = await supabase.rpc(
    "bridge_claim_transaction_operations_notifications_phase4",
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
        providerMessageId: providerId || null,
      });
    } else {
      const message = normalizeText(sendResult.error?.message) ||
        "Resend rejected the transaction operations email.";
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
    stalledQueue: stalledQueueResult,
    claimed: (claim.data || []).length,
    sent: results.filter((item) => item.sent === true).length,
    failed: results.filter((item) => item.sent !== true).length,
    results,
  });
}

export async function handleTransactionOperationsNotificationEmail(
  req: Request,
  payload: SendTransactionOperationsNotificationPayload,
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
      error: "Resend rejected the transaction operations email.",
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
