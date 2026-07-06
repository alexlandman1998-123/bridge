import { createClient } from "supabase";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendNotificationReminderDispatchPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const REMINDER_AUTOMATION_KEYS = [
  "buyer_onboarding_reminder",
  "seller_onboarding_reminder",
  "attorney_invite_reminder",
  "bond_originator_invite_reminder",
  "agent_invite_reminder",
] as const;

const REMINDER_EVENT_SELECT = [
  "id",
  "automation_key",
  "organisation_id",
  "branch_id",
  "assigned_user_id",
  "lead_id",
  "listing_id",
  "transaction_id",
  "offer_id",
  "appointment_id",
  "portal_session_id",
  "seller_review_session_id",
  "recipient_email",
  "recipient_role",
  "subject",
  "message_preview",
  "source",
  "dedupe_key",
  "payload_json",
  "metadata_json",
  "queued_at",
  "created_at",
  "dispatch_attempt_count",
].join(", ");

type ReminderAutomationKey = typeof REMINDER_AUTOMATION_KEYS[number];

type ReminderEventRow = {
  id: string;
  automation_key: string | null;
  organisation_id: string | null;
  branch_id?: string | null;
  assigned_user_id?: string | null;
  lead_id?: string | null;
  listing_id?: string | null;
  transaction_id?: string | null;
  offer_id?: string | null;
  appointment_id?: string | null;
  portal_session_id?: string | null;
  seller_review_session_id?: string | null;
  recipient_email?: string | null;
  recipient_role?: string | null;
  subject?: string | null;
  message_preview?: string | null;
  dedupe_key?: string | null;
  payload_json?: Record<string, unknown> | null;
  metadata_json?: Record<string, unknown> | null;
  queued_at?: string | null;
  created_at?: string | null;
  dispatch_attempt_count?: number | null;
};

type ReminderEmailContent = {
  subject: string;
  html: string;
  text: string;
  messagePreview: string;
};

function isReminderAutomationKey(
  value: string,
): value is ReminderAutomationKey {
  return REMINDER_AUTOMATION_KEYS.includes(value as ReminderAutomationKey);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

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

function coalesceText(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function toPositiveInteger(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function createServiceRoleClient() {
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function resolveSourceMetadata(event: ReminderEventRow) {
  const metadata = asRecord(event.metadata_json);
  return asRecord(metadata.sourceMetadata);
}

function resolveActionLink(event: ReminderEventRow, req: Request) {
  const payload = asRecord(event.payload_json);
  const sourceMetadata = resolveSourceMetadata(event);
  const directLink = coalesceText(
    payload.actionLink,
    payload.action_link,
    payload.onboardingLink,
    payload.onboarding_link,
    payload.portalLink,
    payload.portal_link,
    payload.invitationLink,
    payload.invitation_link,
    payload.inviteLink,
    payload.invite_link,
    sourceMetadata.onboardingLink,
    sourceMetadata.onboarding_link,
    sourceMetadata.portalLink,
    sourceMetadata.portal_link,
    sourceMetadata.canonicalInviteLink,
    sourceMetadata.legacyOnboardingLink,
    sourceMetadata.invitationLink,
    sourceMetadata.invitation_link,
    sourceMetadata.inviteLink,
    sourceMetadata.invite_link,
  );
  if (directLink) return directLink;

  const appBaseUrl = resolveAppBaseUrl(req);
  if (!appBaseUrl) return "";

  const automationKey = normalizeText(event.automation_key);
  const onboardingToken = coalesceText(
    payload.onboardingToken,
    payload.onboarding_token,
    sourceMetadata.onboardingToken,
    sourceMetadata.onboarding_token,
  );
  if (onboardingToken && automationKey === "buyer_onboarding_reminder") {
    return `${appBaseUrl}/client/onboarding/${
      encodeURIComponent(onboardingToken)
    }`;
  }
  if (onboardingToken && automationKey === "seller_onboarding_reminder") {
    return `${appBaseUrl}/seller/onboarding/${
      encodeURIComponent(onboardingToken)
    }`;
  }

  const inviteToken = coalesceText(
    payload.inviteToken,
    payload.invite_token,
    sourceMetadata.canonicalInviteToken,
    sourceMetadata.inviteToken,
    sourceMetadata.invite_token,
  );
  if (inviteToken) {
    return `${appBaseUrl}/invite/${encodeURIComponent(inviteToken)}`;
  }

  return "";
}

function reminderDisplayName(automationKey: string) {
  if (automationKey === "buyer_onboarding_reminder") {
    return "buyer onboarding";
  }
  if (automationKey === "seller_onboarding_reminder") {
    return "seller onboarding";
  }
  if (automationKey === "attorney_invite_reminder") {
    return "attorney invite";
  }
  if (automationKey === "bond_originator_invite_reminder") {
    return "bond originator invite";
  }
  return "workspace invite";
}

function resolveTemplate(event: ReminderEventRow, actionLink: string) {
  const automationKey = normalizeText(event.automation_key);
  const payload = asRecord(event.payload_json);
  const sourceMetadata = resolveSourceMetadata(event);
  const reminderDay = coalesceText(payload.reminderDay, payload.reminder_day);
  const organisationName = coalesceText(
    sourceMetadata.organisationName,
    sourceMetadata.organisation_name,
    "Arch9",
  );
  const recipientName = coalesceText(
    sourceMetadata.inviteeName,
    sourceMetadata.invitee_name,
    sourceMetadata.contactName,
    sourceMetadata.contact_name,
    automationKey.includes("invite") ? "there" : "",
  );
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const sourceSubject = coalesceText(payload.sourceSubject);
  const reminderLabel = reminderDay
    ? `Day ${reminderDay} reminder`
    : "Reminder";

  if (automationKey === "buyer_onboarding_reminder") {
    return {
      title: "Complete your buyer onboarding",
      ctaLabel: "Complete Buyer Onboarding",
      greeting,
      organisationName,
      intro: [
        "This is a quick reminder that your buyer onboarding is still waiting for completion.",
        "Completing it helps the team prepare the transaction file, finance requirements, and next steps without delay.",
      ],
      summaryTitle: "Onboarding Reminder",
      summaryFields: [
        { label: "Reminder", value: reminderLabel },
        { label: "Original email", value: sourceSubject },
      ],
      fallback:
        "If the secure button is not available, reply to this email and the team will resend your onboarding link.",
      security:
        "The onboarding link is unique to your transaction. Do not forward it unless your property representative asks you to.",
    };
  }

  if (automationKey === "seller_onboarding_reminder") {
    return {
      title: "Complete your seller onboarding",
      ctaLabel: "Complete Seller Onboarding",
      greeting,
      organisationName,
      intro: [
        "This is a quick reminder that your seller onboarding is still outstanding.",
        "Finishing the form keeps mandate preparation, compliance checks, and document collection moving smoothly.",
      ],
      summaryTitle: "Onboarding Reminder",
      summaryFields: [
        { label: "Reminder", value: reminderLabel },
        { label: "Original email", value: sourceSubject },
      ],
      fallback:
        "If the secure button is not available, reply to this email and the team will resend your seller onboarding link.",
      security:
        "Your seller onboarding workspace is protected and only shared with authorised people working on your file.",
    };
  }

  if (automationKey === "attorney_invite_reminder") {
    return {
      title: "Your transaction invite is waiting",
      ctaLabel: "Open Secure Invite",
      greeting,
      organisationName,
      intro: [
        "This is a quick reminder that your attorney invite has not been accepted yet.",
        "Accepting the invite gives you secure access to the transaction workspace and the role-specific information you need.",
      ],
      summaryTitle: "Invite Reminder",
      summaryFields: [
        { label: "Reminder", value: reminderLabel },
        { label: "Role", value: "Attorney" },
      ],
      fallback:
        "If the secure button is not available, reply to this email and the transaction owner will resend the invite.",
      security:
        "This invite only grants access to the transaction workspace and permissions linked to your role.",
    };
  }

  if (automationKey === "bond_originator_invite_reminder") {
    return {
      title: "Your bond originator invite is waiting",
      ctaLabel: "Open Secure Invite",
      greeting,
      organisationName,
      intro: [
        "This is a quick reminder that your bond originator invite has not been accepted yet.",
        "Accepting it connects you to the transaction workspace so the finance lane can move without manual follow-up.",
      ],
      summaryTitle: "Invite Reminder",
      summaryFields: [
        { label: "Reminder", value: reminderLabel },
        { label: "Role", value: "Bond Originator" },
      ],
      fallback:
        "If the secure button is not available, reply to this email and the transaction owner will resend the invite.",
      security:
        "This invite only grants access to the transaction workspace and permissions linked to your role.",
    };
  }

  return {
    title: "Your workspace invite is waiting",
    ctaLabel: "Accept Invite",
    greeting,
    organisationName,
    intro: [
      "This is a quick reminder that your Arch9 workspace invite has not been accepted yet.",
      "Accepting the invite lets you join the workspace and complete the setup steps for your role.",
    ],
    summaryTitle: "Workspace Invite Reminder",
    summaryFields: [
      { label: "Reminder", value: reminderLabel },
      {
        label: "Access",
        value: coalesceText(sourceMetadata.workspaceRole, "Agent"),
      },
    ],
    fallback:
      "If the secure button is not available, reply to this email and the workspace admin will resend the invite.",
    security:
      "This invite is tied to your email address and the workspace permissions assigned by the admin.",
  };
}

function buildReminderEmail(
  event: ReminderEventRow,
  req: Request,
): ReminderEmailContent {
  const actionLink = resolveActionLink(event, req);
  const template = resolveTemplate(event, actionLink);
  const subject = coalesceText(
    event.subject,
    `Reminder: ${reminderDisplayName(normalizeText(event.automation_key))}`,
  );
  const messagePreview = coalesceText(
    event.message_preview,
    template.intro[0],
  );
  const contentHtml = [
    renderBridgeIntroParagraphs(template.intro),
    renderBridgeSummaryCard(template.summaryFields, template.summaryTitle),
    actionLink ? renderBridgeCta(template.ctaLabel, actionLink) : "",
    renderBridgeIntroParagraphs([template.fallback]),
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: messagePreview,
    title: template.title,
    greeting: template.greeting,
    contentHtml,
    securityBody: template.security,
    helpBody:
      "If you have already completed this step, no action is needed and you can ignore this reminder.",
    organisationName: template.organisationName,
  });
  const text = [
    template.greeting,
    "",
    ...template.intro,
    "",
    actionLink ? `${template.ctaLabel}: ${actionLink}` : template.fallback,
    "",
    "If you have already completed this step, no action is needed.",
  ].join("\n");

  return { subject, html, text, messagePreview };
}

async function insertReminderCommunicationDelivery(
  supabase: any,
  event: ReminderEventRow,
  content: ReminderEmailContent,
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
  const nowIso = new Date().toISOString();
  const payload = {
    organisation_id: normalizeUuid(event.organisation_id),
    branch_id: normalizeUuid(event.branch_id) || null,
    lead_id: normalizeUuid(event.lead_id) || null,
    listing_id: normalizeUuid(event.listing_id) || null,
    transaction_id: normalizeUuid(event.transaction_id) || null,
    offer_id: normalizeUuid(event.offer_id) || null,
    appointment_id: normalizeUuid(event.appointment_id) || null,
    portal_session_id: normalizeUuid(event.portal_session_id) || null,
    seller_review_session_id: normalizeUuid(event.seller_review_session_id) ||
      null,
    communication_type: normalizeText(event.automation_key),
    automation_key: normalizeText(event.automation_key),
    notification_event_id: normalizeUuid(event.id),
    channel: "email",
    recipient: normalizeText(event.recipient_email).toLowerCase(),
    recipient_role: normalizeText(event.recipient_role).toLowerCase() || null,
    subject: content.subject,
    message_preview: content.messagePreview,
    status,
    provider: "resend",
    provider_message_id: normalizeText(providerMessageId) || null,
    error_message: normalizeText(errorMessage) || null,
    prepared_at: nowIso,
    sent_at: status === "sent" ? nowIso : null,
    failed_at: status === "failed" ? nowIso : null,
    metadata_json: {
      source: "notification_reminder_dispatch",
      phase: "phase_4_reminder_dispatch",
      notificationEventId: event.id,
      automationKey: event.automation_key,
      dedupeKey: event.dedupe_key || null,
      dispatchAttemptCount: event.dispatch_attempt_count || 0,
    },
  };

  const { data, error } = await supabase
    .from("communication_deliveries")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error(
      "[notification-reminder-dispatch] delivery insert failed",
      error,
    );
    return null;
  }

  return data || null;
}

async function markReminderEventSent(
  supabase: any,
  event: ReminderEventRow,
  deliveryId: string,
  providerMessageId: string,
) {
  const metadata = asRecord(event.metadata_json);
  return await supabase
    .from("notification_events")
    .update({
      status: "sent",
      provider: "resend",
      provider_message_id: normalizeText(providerMessageId) || null,
      communication_delivery_id: normalizeUuid(deliveryId) || null,
      sent_at: new Date().toISOString(),
      last_dispatch_error: null,
      metadata_json: {
        ...metadata,
        phase: "phase_4_reminder_dispatch",
        dispatchedAt: new Date().toISOString(),
        communicationDeliveryId: deliveryId || null,
      },
    })
    .eq("id", event.id)
    .select("id, status")
    .single();
}

async function markReminderEventFailed(
  supabase: any,
  event: ReminderEventRow,
  errorMessage: string,
  deliveryId = "",
) {
  const metadata = asRecord(event.metadata_json);
  return await supabase
    .from("notification_events")
    .update({
      status: "failed",
      error_message: normalizeText(errorMessage) || null,
      last_dispatch_error: normalizeText(errorMessage) || null,
      communication_delivery_id: normalizeUuid(deliveryId) || null,
      failed_at: new Date().toISOString(),
      metadata_json: {
        ...metadata,
        phase: "phase_4_reminder_dispatch",
        dispatchFailedAt: new Date().toISOString(),
        communicationDeliveryId: deliveryId || null,
      },
    })
    .eq("id", event.id)
    .select("id, status")
    .single();
}

async function fetchDryRunEvents(
  supabase: any,
  eventId: string,
  limit: number,
) {
  let query = supabase
    .from("notification_events")
    .select(REMINDER_EVENT_SELECT)
    .eq("category", "reminder")
    .eq("trigger_type", "scheduled_reminder")
    .eq("channel", "email")
    .eq("status", "queued")
    .in("automation_key", [...REMINDER_AUTOMATION_KEYS])
    .order("queued_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (eventId) {
    query = query.eq("id", eventId);
  }

  return await query;
}

function isMissingPhase6QueueRpc(error: unknown) {
  const record = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const code = normalizeText(record.code).toUpperCase();
  const message = normalizeText(record.message).toLowerCase();
  return code === "42883" ||
    message.includes("bridge_queue_notification_reminder_events_phase6");
}

async function queueDueNotificationReminderEvents(
  supabase: any,
  {
    queueLimit,
    now,
    dryRun,
  }: {
    queueLimit: number;
    now: string;
    dryRun: boolean;
  },
) {
  const phase6 = await supabase.rpc(
    "bridge_queue_notification_reminder_events_phase6",
    {
      p_limit: queueLimit,
      p_now: now,
      p_dry_run: dryRun,
      p_respect_quiet_hours: true,
    },
  );

  if (!phase6.error) {
    return phase6;
  }

  if (!isMissingPhase6QueueRpc(phase6.error)) {
    return phase6;
  }

  const phase3 = await supabase.rpc(
    "bridge_queue_notification_reminder_events_phase3",
    {
      p_limit: queueLimit,
      p_now: now,
      p_dry_run: dryRun,
    },
  );

  if (phase3.error) {
    return phase3;
  }

  return {
    ...phase3,
    data: {
      ...(asRecord(phase3.data)),
      phase6Fallback: true,
      phase: "phase_3_reminder_queue",
    },
  };
}

export async function handleNotificationReminderDispatchEmail(
  req: Request,
  payload: SendNotificationReminderDispatchPayload,
) {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return jsonResponse(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.",
    });
  }

  const dryRun = payload.dryRun === true || payload.dry_run === true;
  const eventId = normalizeUuid(payload.eventId || payload.event_id);
  const limit = eventId ? 1 : toPositiveInteger(
    payload.limit ?? payload.dispatchLimit ?? payload.dispatch_limit,
    25,
    100,
  );
  const queueLimit = toPositiveInteger(
    payload.queueLimit ?? payload.queue_limit,
    50,
    500,
  );
  const queueDue = !eventId &&
    payload.queueDue !== false &&
    payload.queue_due !== false;
  const resetStale = payload.resetStale !== false &&
    payload.reset_stale !== false;
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));

  if (!dryRun && !resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  let staleResetCount = 0;
  if (!dryRun && resetStale) {
    const reset = await supabase.rpc(
      "bridge_reset_stale_notification_reminder_processing_phase4",
      {},
    );
    if (reset.error) {
      return jsonResponse(500, {
        error: "Failed to reset stale reminder dispatch claims.",
        details: reset.error,
      });
    }
    staleResetCount = Number(reset.data || 0);
  }

  let queueResult: unknown = null;
  if (queueDue) {
    const queued = await queueDueNotificationReminderEvents(supabase, {
      queueLimit,
      now: normalizeText(payload.now) || new Date().toISOString(),
      dryRun,
    });
    if (queued.error) {
      return jsonResponse(500, {
        error: "Failed to queue due notification reminders before dispatch.",
        details: queued.error,
      });
    }
    if (asRecord(queued.data).success === false) {
      return jsonResponse(500, {
        error: "Failed to queue due notification reminders before dispatch.",
        details: queued.data,
      });
    }
    queueResult = queued.data || null;
  }

  const claimed = dryRun
    ? await fetchDryRunEvents(supabase, eventId, limit)
    : await supabase.rpc("bridge_claim_notification_reminder_events_phase4", {
      p_limit: limit,
      p_event_id: eventId || null,
    });

  if (claimed.error) {
    return jsonResponse(500, {
      error: dryRun
        ? "Failed to read queued notification reminders."
        : "Failed to claim queued notification reminders.",
      details: claimed.error,
    });
  }

  const events = (claimed.data || []) as ReminderEventRow[];
  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  const results = [];

  for (const event of events) {
    const automationKey = normalizeText(event.automation_key);
    if (!isReminderAutomationKey(automationKey)) {
      continue;
    }

    const recipientEmail = normalizeText(event.recipient_email).toLowerCase();
    const content = buildReminderEmail(event, req);

    if (dryRun) {
      results.push({
        eventId: event.id,
        automationKey,
        recipientEmail,
        subject: content.subject,
        dryRun: true,
      });
      continue;
    }

    if (!recipientEmail) {
      await markReminderEventFailed(
        supabase,
        event,
        "Reminder event is missing a recipient email.",
      );
      results.push({
        eventId: event.id,
        automationKey,
        ok: false,
        error: "missing_recipient_email",
      });
      continue;
    }

    const sendResult = await sendViaResendApi({
      apiKey: resendApiKey,
      from,
      to: recipientEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    if (!sendResult.ok) {
      const errorMessage = sendResult.error?.message ||
        "Failed to send notification reminder email.";
      const delivery = await insertReminderCommunicationDelivery(
        supabase,
        event,
        content,
        {
          status: "failed",
          errorMessage,
        },
      );
      await markReminderEventFailed(
        supabase,
        event,
        errorMessage,
        delivery?.id || "",
      );
      results.push({
        eventId: event.id,
        automationKey,
        ok: false,
        status: sendResult.status,
        error: errorMessage,
      });
      continue;
    }

    const providerMessageId = normalizeText(sendResult.data?.id);
    const delivery = await insertReminderCommunicationDelivery(
      supabase,
      event,
      content,
      {
        status: "sent",
        providerMessageId,
      },
    );
    await markReminderEventSent(
      supabase,
      event,
      delivery?.id || "",
      providerMessageId,
    );
    results.push({
      eventId: event.id,
      automationKey,
      ok: true,
      recipientEmail,
      providerMessageId,
      deliveryId: delivery?.id || null,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "notification_reminder_dispatch",
    dryRun,
    queueDue,
    queueResult,
    staleResetCount,
    claimedCount: events.length,
    dispatchedCount: results.filter((item) => item.ok === true).length,
    failedCount: results.filter((item) => item.ok === false).length,
    results,
  });
}
