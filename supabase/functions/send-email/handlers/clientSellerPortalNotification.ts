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
import type { SendClientSellerPortalNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const EVENT_LABELS: Record<string, { title: string; subject: string }> = {
  offer_viewed_by_seller: {
    title: "Offer Viewed By Seller",
    subject: "Seller viewed an offer",
  },
  offer_not_reviewed_reminder: {
    title: "Offer Review Reminder",
    subject: "Offer awaiting your review",
  },
  offer_review_overdue_escalation: {
    title: "Offer Review Overdue",
    subject: "Offer review needs attention",
  },
  seller_mandate_viewed_unsigned_reminder: {
    title: "Seller Mandate Reminder",
    subject: "Seller mandate awaiting signature",
  },
  seller_mandate_signing_overdue_escalation: {
    title: "Seller Mandate Overdue",
    subject: "Seller mandate signing needs attention",
  },
  buyer_onboarding_opened: {
    title: "Buyer Onboarding Opened",
    subject: "Buyer opened onboarding",
  },
  buyer_onboarding_started_not_submitted_reminder: {
    title: "Buyer Onboarding Reminder",
    subject: "Buyer onboarding awaiting submission",
  },
  buyer_onboarding_overdue_escalation: {
    title: "Buyer Onboarding Overdue",
    subject: "Buyer onboarding needs attention",
  },
  buyer_onboarding_submitted_confirmation: {
    title: "Onboarding Submitted",
    subject: "Your onboarding has been submitted",
  },
  client_portal_message_received: {
    title: "Client Portal Message",
    subject: "New client portal message",
  },
  client_portal_document_uploaded: {
    title: "Client Document Uploaded",
    subject: "Client uploaded a document",
  },
  client_portal_document_rejected: {
    title: "Document Needs Reupload",
    subject: "Document reupload required",
  },
};

const DISPATCH_TYPES = new Set([
  "client_seller_portal_dispatch",
  "client_seller_portal_resend",
  "client_seller_portal_notifications_dispatch",
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
  payload: SendClientSellerPortalNotificationPayload,
) {
  const explicit = firstText(payload.eventKind, payload.event_kind);
  const type = normalizeText(payload.type);
  const eventKind = explicit || type;
  if (eventKind === "client_seller_portal_notification") {
    return "client_portal_message_received";
  }
  return EVENT_LABELS[eventKind] ? eventKind : "client_portal_message_received";
}

function defaultMessage({
  eventKind,
  offerReference,
  propertyLabel,
  buyerName,
  sellerName,
  documentTitle,
  reason,
}: {
  eventKind: string;
  offerReference: string;
  propertyLabel: string;
  buyerName: string;
  sellerName: string;
  documentTitle: string;
  reason: string;
}) {
  const offer = offerReference || "the offer";
  const property = propertyLabel ? ` for ${propertyLabel}` : "";
  if (eventKind === "offer_viewed_by_seller") {
    return `${sellerName || "The seller"} viewed ${offer}${property}.`;
  }
  if (eventKind === "offer_not_reviewed_reminder") {
    return `${offer}${property} is still awaiting seller review.`;
  }
  if (eventKind === "offer_review_overdue_escalation") {
    return `${offer}${property} has not been reviewed within the expected SLA.`;
  }
  if (eventKind === "seller_mandate_viewed_unsigned_reminder") {
    return `The seller mandate${property} has been viewed but is still unsigned.`;
  }
  if (eventKind === "seller_mandate_signing_overdue_escalation") {
    return `The seller mandate${property} is overdue for signature.`;
  }
  if (eventKind === "buyer_onboarding_opened") {
    return `${buyerName || "The buyer"} opened onboarding${property}.`;
  }
  if (eventKind === "buyer_onboarding_started_not_submitted_reminder") {
    return `Buyer onboarding${property} has been started but not submitted.`;
  }
  if (eventKind === "buyer_onboarding_overdue_escalation") {
    return `Buyer onboarding${property} is overdue and needs follow-up.`;
  }
  if (eventKind === "buyer_onboarding_submitted_confirmation") {
    return `Your onboarding${property} has been submitted.`;
  }
  if (eventKind === "client_portal_document_uploaded") {
    return `${documentTitle || "A client document"} was uploaded${property}.`;
  }
  if (eventKind === "client_portal_document_rejected") {
    return `${documentTitle || "A document"} needs to be uploaded again${
      reason ? `: ${reason}` : "."
    }`;
  }
  return `A client portal update was received${property}.`;
}

function defaultCtaLabel(eventKind: string) {
  if (eventKind.includes("offer")) return "Open Offer";
  if (eventKind.includes("mandate")) return "Open Seller Portal";
  if (eventKind.includes("onboarding")) return "Open Onboarding";
  if (eventKind.includes("document")) return "Open Documents";
  return "Open Portal";
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
  const offerId = firstText(payload.offerId, payload.offer_id);
  const transactionId = firstText(
    payload.transactionId,
    payload.transaction_id,
  );
  const listingId = firstText(payload.listingId, payload.listing_id);
  if (eventKind.includes("offer") && offerId) {
    return `${appBaseUrl}/offers/${encodeURIComponent(offerId)}`;
  }
  if (eventKind.includes("onboarding") && transactionId) {
    return `${appBaseUrl}/transactions/${
      encodeURIComponent(transactionId)
    }/onboarding`;
  }
  if (transactionId) {
    return `${appBaseUrl}/transactions/${encodeURIComponent(transactionId)}`;
  }
  if (listingId) {
    return `${appBaseUrl}/private-listings/${encodeURIComponent(listingId)}`;
  }
  return appBaseUrl;
}

export function buildClientSellerPortalNotificationEmail({
  eventKind,
  recipientName,
  title,
  message,
  actionLink,
  ctaLabel,
  offerReference,
  offerId,
  transactionReference,
  transactionId,
  listingId,
  propertyLabel,
  buyerName,
  buyerEmail,
  sellerName,
  sellerEmail,
  agentName,
  agentEmail,
  portalLabel,
  documentTitle,
  documentStatus,
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
  offerReference?: string;
  offerId?: string;
  transactionReference?: string;
  transactionId?: string;
  listingId?: string;
  propertyLabel?: string;
  buyerName?: string;
  buyerEmail?: string;
  sellerName?: string;
  sellerEmail?: string;
  agentName?: string;
  agentEmail?: string;
  portalLabel?: string;
  documentTitle?: string;
  documentStatus?: string;
  reason?: string;
  nextAction?: string;
  branding: EmailBranding;
}) {
  const fields = [
    { label: "Offer", value: offerReference || offerId || "" },
    {
      label: "Transaction",
      value: transactionReference || transactionId || "",
    },
    { label: "Listing", value: listingId || "" },
    { label: "Property", value: propertyLabel || "" },
    { label: "Buyer", value: buyerName || buyerEmail || "" },
    { label: "Seller", value: sellerName || sellerEmail || "" },
    { label: "Agent", value: agentName || agentEmail || "" },
    { label: "Portal", value: portalLabel || "" },
    { label: "Document", value: documentTitle || "" },
    { label: "Status", value: documentStatus || "" },
    { label: "Reason", value: reason || "" },
    { label: "Next Action", value: nextAction || "" },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName || "there"},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(fields, "Portal Summary"),
      actionLink
        ? renderBridgeCta(ctaLabel || defaultCtaLabel(eventKind), actionLink, {
          primaryColor: branding.primaryColor,
        })
        : "",
    ].join(""),
    securityBody:
      "Portal, offer and document details are shared only with authorised people in the account.",
    helpBody: eventKind.includes("overdue") ||
        eventKind.includes("not_submitted") ||
        eventKind.includes("rejected")
      ? "Open the workspace to review the outstanding action and keep the process moving."
      : "Open the workspace to review the latest client activity.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  const text = [
    `Hi ${recipientName || "there"},`,
    "",
    message,
    offerReference || offerId ? `Offer: ${offerReference || offerId}` : "",
    transactionReference || transactionId
      ? `Transaction: ${transactionReference || transactionId}`
      : "",
    propertyLabel ? `Property: ${propertyLabel}` : "",
    buyerName || buyerEmail ? `Buyer: ${buyerName || buyerEmail}` : "",
    sellerName || sellerEmail ? `Seller: ${sellerName || sellerEmail}` : "",
    agentName || agentEmail ? `Agent: ${agentName || agentEmail}` : "",
    portalLabel ? `Portal: ${portalLabel}` : "",
    documentTitle ? `Document: ${documentTitle}` : "",
    documentStatus ? `Status: ${documentStatus}` : "",
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
  payload: SendClientSellerPortalNotificationPayload,
  branding: EmailBranding,
) {
  const metadata = asRecord(payload.metadata);
  const eventKind = normalizeEventKind(payload);
  const labels = EVENT_LABELS[eventKind] ||
    EVENT_LABELS.client_portal_message_received;
  const offerReference = firstText(
    payload.offerReference,
    payload.offer_reference,
    metadata.offerReference,
    metadata.offer_reference,
  );
  const propertyLabel = firstText(
    payload.propertyLabel,
    payload.property_label,
    metadata.propertyLabel,
    metadata.property_label,
  );
  const buyerName = firstText(
    payload.buyerName,
    payload.buyer_name,
    metadata.buyerName,
  );
  const sellerName = firstText(
    payload.sellerName,
    payload.seller_name,
    metadata.sellerName,
  );
  const documentTitle = firstText(
    payload.documentTitle,
    payload.document_title,
    metadata.documentTitle,
    metadata.document_title,
  );
  const reason = firstText(payload.reason, metadata.reason);
  const message = firstText(payload.message, metadata.message) ||
    defaultMessage({
      eventKind,
      offerReference,
      propertyLabel,
      buyerName,
      sellerName,
      documentTitle,
      reason,
    });
  const actionLink = actionLinkFor(req, {
    ...(payload as Record<string, unknown>),
    ...metadata,
  }, eventKind);
  const subject = firstText(payload.subject, metadata.subject) ||
    labels.subject;
  const title = firstText(payload.title, metadata.title) || labels.title;
  const agentEmail = firstText(
    payload.agentEmail,
    payload.agent_email,
    metadata.agentEmail,
  );
  const email = buildClientSellerPortalNotificationEmail({
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
    offerReference,
    offerId: firstText(payload.offerId, payload.offer_id, metadata.offerId),
    transactionReference: firstText(
      payload.transactionReference,
      payload.transaction_reference,
      metadata.transactionReference,
    ),
    transactionId: firstText(
      payload.transactionId,
      payload.transaction_id,
      metadata.transactionId,
    ),
    listingId: firstText(
      payload.listingId,
      payload.listing_id,
      metadata.listingId,
    ),
    propertyLabel,
    buyerName,
    buyerEmail: firstText(
      payload.buyerEmail,
      payload.buyer_email,
      metadata.buyerEmail,
    ),
    sellerName,
    sellerEmail: firstText(
      payload.sellerEmail,
      payload.seller_email,
      metadata.sellerEmail,
    ),
    agentName: firstText(
      payload.agentName,
      payload.agent_name,
      metadata.agentName,
    ),
    agentEmail,
    portalLabel: firstText(
      payload.portalLabel,
      payload.portal_label,
      metadata.portalLabel,
    ),
    documentTitle,
    documentStatus: firstText(
      payload.documentStatus,
      payload.document_status,
      metadata.documentStatus,
    ),
    reason,
    nextAction: firstText(
      payload.nextAction,
      payload.next_action,
      metadata.nextAction,
    ),
    branding,
  });
  return { ...email, eventKind, subject, messagePreview: message, agentEmail };
}

function payloadFromEvent(event: Record<string, unknown>) {
  const payload = asRecord(event.payload_json);
  const metadata = asRecord(event.metadata_json);
  return {
    ...payload,
    metadata,
    type: normalizeText(event.automation_key) ||
      "client_seller_portal_notification",
    eventKind: normalizeText(event.automation_key) ||
      normalizeText(event.event_key),
    to: normalizeText(event.recipient_email),
    subject: normalizeText(event.subject),
    message: normalizeText(event.message_preview),
    transactionId: normalizeText(event.transaction_id),
    organisationId: normalizeText(event.organisation_id),
    recipientName: firstText(payload.recipientName, metadata.recipientName),
  } as SendClientSellerPortalNotificationPayload;
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
      source: "client_seller_portal_notification",
      phase: "phase_5_client_seller_offer_portal_events",
      notificationEventId: event.id,
      automationKey: event.automation_key,
      dedupeKey: event.dedupe_key || null,
    },
  }).select("id").single();
  return inserted.error ? null : inserted.data;
}

async function dispatchQueuedEvents(
  req: Request,
  payload: SendClientSellerPortalNotificationPayload,
) {
  if (!isServiceRequest(req)) {
    return jsonResponse(403, {
      error:
        "Service role authorization is required for client/seller portal dispatch.",
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
  let dueQueueResult: Record<string, unknown> | null = null;
  if (queueDue) {
    const queued = await supabase.rpc(
      "bridge_queue_client_seller_portal_due_notifications_phase5",
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
      },
    );
    if (queued.error) {
      const message = normalizeText(queued.error.message).toLowerCase();
      const code = normalizeText(queued.error.code).toUpperCase();
      if (
        code !== "42883" &&
        !message.includes(
          "bridge_queue_client_seller_portal_due_notifications_phase5",
        )
      ) {
        return jsonResponse(500, { error: queued.error.message });
      }
    } else {
      dueQueueResult = asRecord(queued.data);
    }
  }

  const claim = await supabase.rpc(
    "bridge_claim_client_seller_portal_notifications_phase5",
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
      bcc: content.agentEmail,
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
        "Resend rejected the client/seller portal notification email.";
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
    dueQueue: dueQueueResult,
    claimed: (claim.data || []).length,
    sent: results.filter((item) => item.sent === true).length,
    failed: results.filter((item) => item.sent !== true).length,
    results,
  });
}

export async function handleClientSellerPortalNotificationEmail(
  req: Request,
  payload: SendClientSellerPortalNotificationPayload,
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
    bcc: content.agentEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the client/seller portal notification email.",
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
