import {
  isMissingColumnError,
  isMissingSchemaError,
  isMissingTableError,
} from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";
import type { NotificationAutomationDefinition } from "./notificationAutomationContract.ts";

type NotificationEventInput = {
  definition: NotificationAutomationDefinition;
  organisationId: unknown;
  branchId?: unknown;
  assignedUserId?: unknown;
  leadId?: unknown;
  listingId?: unknown;
  transactionId?: unknown;
  offerId?: unknown;
  appointmentId?: unknown;
  portalSessionId?: unknown;
  sellerReviewSessionId?: unknown;
  recipientEmail?: unknown;
  recipientRole?: unknown;
  subject?: unknown;
  messagePreview?: unknown;
  provider?: unknown;
  source?: unknown;
  dedupeKey?: unknown;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function normalizeUuid(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") {
    return "";
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
      normalized,
    )
    ? normalized
    : "";
}

function clipPreview(value: unknown, limit = 320) {
  const normalized = normalizeText(value);
  return normalized.length > limit
    ? `${normalized.slice(0, Math.max(limit - 1, 1))}...`
    : normalized;
}

function safeJsonRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isMissingNotificationSupport(error: unknown) {
  return isMissingSchemaError(error) ||
    isMissingTableError(error, "notification_events") ||
    isMissingColumnError(error);
}

async function safeInsertNotificationEvent(
  supabase: any,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("notification_events")
    .insert(payload)
    .select("id, status, created_at")
    .single();

  if (error) {
    if (!isMissingNotificationSupport(error)) {
      console.error("[send-email] notification event insert failed", error);
    }
    return null;
  }

  return data || null;
}

async function safeUpdateNotificationEvent(
  supabase: any,
  eventId: string,
  patch: Record<string, unknown>,
) {
  const normalizedEventId = normalizeUuid(eventId);
  if (!normalizedEventId) return null;

  const { data, error } = await supabase
    .from("notification_events")
    .update(patch)
    .eq("id", normalizedEventId)
    .select("id, status, updated_at")
    .single();

  if (error) {
    if (!isMissingNotificationSupport(error)) {
      console.error("[send-email] notification event update failed", error);
    }
    return null;
  }

  return data || null;
}

export async function prepareNotificationEvent(
  supabase: any,
  input: NotificationEventInput,
) {
  const definition = input.definition;
  const organisationId = normalizeUuid(input.organisationId);
  if (!supabase || !definition?.key || !organisationId) return null;

  const recipientEmail = normalizeText(input.recipientEmail).toLowerCase();
  const recipientRole = normalizeText(
    input.recipientRole || definition.recipientRole,
  ).toLowerCase();

  const insertPayload: Record<string, unknown> = {
    automation_key: definition.key,
    organisation_id: organisationId,
    branch_id: normalizeUuid(input.branchId) || null,
    assigned_user_id: normalizeUuid(input.assignedUserId) || null,
    lead_id: normalizeUuid(input.leadId) || null,
    listing_id: normalizeUuid(input.listingId) || null,
    transaction_id: normalizeUuid(input.transactionId) || null,
    offer_id: normalizeUuid(input.offerId) || null,
    appointment_id: normalizeUuid(input.appointmentId) || null,
    portal_session_id: normalizeUuid(input.portalSessionId) || null,
    seller_review_session_id: normalizeUuid(input.sellerReviewSessionId) ||
      null,
    event_key: definition.key,
    category: definition.category,
    trigger_type: definition.triggerType,
    channel: "email",
    status: "prepared",
    recipient_email: recipientEmail || null,
    recipient_role: recipientRole || null,
    subject: normalizeText(input.subject) || null,
    message_preview: clipPreview(input.messagePreview) || null,
    provider: normalizeText(input.provider) || null,
    source: normalizeText(input.source) || "send-email",
    dedupe_key: normalizeText(input.dedupeKey) || null,
    payload_json: safeJsonRecord(input.payload),
    metadata_json: {
      implementationStatus: definition.implementationStatus,
      defaultEnabled: definition.defaultEnabled,
      communicationTypes: definition.communicationTypes,
      roleTypes: definition.roleTypes,
      ...(safeJsonRecord(input.metadata)),
    },
  };

  return await safeInsertNotificationEvent(supabase, insertPayload);
}

export async function linkNotificationEventDelivery(
  supabase: any,
  eventId: string,
  deliveryId: string,
) {
  const normalizedDeliveryId = normalizeUuid(deliveryId);
  if (!normalizedDeliveryId) return null;
  return await safeUpdateNotificationEvent(supabase, eventId, {
    communication_delivery_id: normalizedDeliveryId,
  });
}

export async function markNotificationEventSent(
  supabase: any,
  eventId: string,
  {
    providerMessageId = "",
  }: {
    providerMessageId?: string | null;
  } = {},
) {
  return await safeUpdateNotificationEvent(supabase, eventId, {
    status: "sent",
    provider_message_id: normalizeText(providerMessageId) || null,
    sent_at: new Date().toISOString(),
  });
}

export async function markNotificationEventFailed(
  supabase: any,
  eventId: string,
  {
    errorMessage = "",
  }: {
    errorMessage?: string | null;
  } = {},
) {
  return await safeUpdateNotificationEvent(supabase, eventId, {
    status: "failed",
    error_message: normalizeText(errorMessage) || null,
    failed_at: new Date().toISOString(),
  });
}
