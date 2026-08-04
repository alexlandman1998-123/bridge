import { isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

export type NotificationRecipientControlInput = {
  organisationId?: string | null;
  recipientEmail?: string | null;
  recipientUserId?: string | null;
  recipientRole?: string | null;
  automationKey?: string | null;
  channel?: string | null;
  now?: string | null;
};

export type NotificationRecipientControlDecision = {
  allowed: boolean;
  reason: string;
  status: "allowed" | "deferred" | "skipped" | "suppressed";
  preferenceId?: string;
  suppressionId?: string;
  deferUntil?: string;
  mutedUntil?: string;
  source?: string;
  raw?: Record<string, unknown>;
};

export type NotificationDeliveryAttemptInput = {
  notificationEventId?: string | null;
  communicationDeliveryId?: string | null;
  organisationId?: string | null;
  automationKey?: string | null;
  channel?: string | null;
  recipientEmail?: string | null;
  recipientRole?: string | null;
  attemptNumber?: number | null;
  status:
    | "queued"
    | "sent"
    | "delivered"
    | "failed"
    | "skipped"
    | "deferred"
    | "suppressed";
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
  controlDecision?:
    | NotificationRecipientControlDecision
    | Record<string, unknown>
    | null;
  metadata?: Record<string, unknown> | null;
};

function normalizeUuid(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(normalized)
    ? normalized
    : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function shouldIgnoreControlError(error: unknown) {
  return isMissingSchemaError(error) ||
    isMissingTableError(error, "notification_recipient_preferences") ||
    isMissingTableError(error, "notification_suppression_list") ||
    isMissingTableError(error, "notification_delivery_attempts");
}

function normalizeDecision(
  value: unknown,
): NotificationRecipientControlDecision {
  const record = asRecord(value);
  const allowed = record.allowed !== false &&
    normalizeText(record.status).toLowerCase() !== "suppressed" &&
    normalizeText(record.status).toLowerCase() !== "skipped";
  const status = normalizeText(record.status).toLowerCase();
  return {
    allowed,
    reason: normalizeText(record.reason) ||
      (allowed ? "allowed_default" : "blocked"),
    status: status === "deferred" || status === "suppressed" ||
        status === "skipped"
      ? status
      : allowed
      ? "allowed"
      : "skipped",
    preferenceId: normalizeUuid(record.preferenceId),
    suppressionId: normalizeUuid(record.suppressionId),
    deferUntil: normalizeText(record.deferUntil),
    mutedUntil: normalizeText(record.mutedUntil),
    source: normalizeText(record.source),
    raw: record,
  };
}

export function isNotificationControlBlock(
  decision: NotificationRecipientControlDecision,
) {
  return decision.allowed !== true;
}

export async function resolveNotificationRecipientControl(
  supabase: any,
  input: NotificationRecipientControlInput,
): Promise<NotificationRecipientControlDecision> {
  if (!supabase) {
    return {
      allowed: true,
      reason: "control_plane_unavailable",
      status: "allowed",
    };
  }

  const { data, error } = await supabase.rpc(
    "bridge_resolve_notification_recipient_control_phase9",
    {
      p_organisation_id: normalizeUuid(input.organisationId) || null,
      p_recipient_email: normalizeText(input.recipientEmail).toLowerCase(),
      p_recipient_user_id: normalizeUuid(input.recipientUserId) || null,
      p_recipient_role: normalizeText(input.recipientRole).toLowerCase() ||
        null,
      p_automation_key: normalizeText(input.automationKey) || null,
      p_channel: normalizeText(input.channel).toLowerCase() || "email",
      p_now: normalizeText(input.now) || null,
    },
  );

  if (error) {
    if (!shouldIgnoreControlError(error)) {
      console.error("[send-email] notification control lookup failed", error);
    }
    return {
      allowed: true,
      reason: "control_plane_lookup_failed",
      status: "allowed",
    };
  }

  return normalizeDecision(data);
}

export async function recordNotificationDeliveryAttempt(
  supabase: any,
  input: NotificationDeliveryAttemptInput,
) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(
    "bridge_record_notification_delivery_attempt_phase9",
    {
      p_notification_event_id: normalizeUuid(input.notificationEventId) || null,
      p_communication_delivery_id:
        normalizeUuid(input.communicationDeliveryId) ||
        null,
      p_organisation_id: normalizeUuid(input.organisationId) || null,
      p_automation_key: normalizeText(input.automationKey) || null,
      p_channel: normalizeText(input.channel).toLowerCase() || "email",
      p_recipient_email: normalizeText(input.recipientEmail).toLowerCase() ||
        null,
      p_recipient_role: normalizeText(input.recipientRole).toLowerCase() ||
        null,
      p_attempt_number: Math.max(1, Number(input.attemptNumber) || 1),
      p_status: input.status,
      p_provider: normalizeText(input.provider) || null,
      p_provider_message_id: normalizeText(input.providerMessageId) || null,
      p_error_message: normalizeText(input.errorMessage) || null,
      p_latency_ms: Number.isFinite(Number(input.latencyMs))
        ? Math.max(0, Math.round(Number(input.latencyMs)))
        : null,
      p_control_decision: asRecord(input.controlDecision),
      p_metadata_json: asRecord(input.metadata),
    },
  );

  if (error) {
    if (!shouldIgnoreControlError(error)) {
      console.error(
        "[send-email] notification delivery attempt insert failed",
        error,
      );
    }
    return null;
  }

  return data || null;
}

export async function applyNotificationQueueControls(
  supabase: any,
  {
    limit = 500,
    dryRun = false,
    now = "",
    eventId = "",
  }: { limit?: number; dryRun?: boolean; now?: string; eventId?: string } = {},
) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(
    "bridge_apply_notification_preferences_to_queue_phase9",
    {
      p_limit: Math.max(1, Math.min(Number(limit) || 500, 5000)),
      p_now: normalizeText(now) || null,
      p_dry_run: Boolean(dryRun),
      p_event_id: normalizeUuid(eventId) || null,
    },
  );

  if (error) {
    if (!shouldIgnoreControlError(error)) {
      console.error("[send-email] notification queue controls failed", error);
    }
    return null;
  }

  return asRecord(data);
}

export async function getNotificationObservabilitySnapshot(
  supabase: any,
  {
    organisationId = "",
    since = "",
  }: { organisationId?: string; since?: string } = {},
) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(
    "bridge_notification_observability_snapshot_phase9",
    {
      p_organisation_id: normalizeUuid(organisationId) || null,
      p_since: normalizeText(since) || null,
    },
  );

  if (error) {
    if (!shouldIgnoreControlError(error)) {
      console.error(
        "[send-email] notification observability snapshot failed",
        error,
      );
    }
    return null;
  }

  return asRecord(data);
}
