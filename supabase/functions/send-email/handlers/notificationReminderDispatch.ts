import { createClient } from "supabase";
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
import type { SendNotificationReminderDispatchPayload } from "../types.ts";
import { assessControlledTestRecipient } from "../utils/controlledTestRecipient.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const REMINDER_AUTOMATION_KEYS = [
  "buyer_onboarding_reminder",
  "seller_onboarding_reminder",
  "seller_document_request_reminder",
  "attorney_invite_reminder",
  "bond_originator_invite_reminder",
  "agent_invite_reminder",
  "lead_first_response_sla_reminder",
  "lead_first_response_sla_escalation",
  "lead_follow_up_due_reminder",
  "lead_follow_up_missed_escalation",
  "lead_dormant_reactivation",
  "lead_no_response_nurture",
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

  const sellerWorkspaceToken = coalesceText(
    payload.sellerWorkspaceToken,
    payload.seller_workspace_token,
    sourceMetadata.sellerWorkspaceToken,
    sourceMetadata.seller_workspace_token,
    onboardingToken,
  );
  if (
    sellerWorkspaceToken && automationKey === "seller_document_request_reminder"
  ) {
    return `${appBaseUrl}/client/${
      encodeURIComponent(sellerWorkspaceToken)
    }/selling/documents`;
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

  const leadId = coalesceText(
    event.lead_id,
    payload.leadId,
    payload.lead_id,
    sourceMetadata.leadId,
    sourceMetadata.lead_id,
  );
  const recipientRole = normalizeText(event.recipient_role).toLowerCase();
  if (leadId && recipientRole !== "lead") {
    return `${appBaseUrl}/agency/leads/${encodeURIComponent(leadId)}`;
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

  if (automationKey === "seller_document_request_reminder") {
    return "seller document request";
  }
  if (automationKey === "attorney_invite_reminder") {
    return "attorney invite";
  }
  if (automationKey === "bond_originator_invite_reminder") {
    return "bond originator invite";
  }
  if (automationKey === "lead_first_response_sla_reminder") {
    return "lead first response SLA";
  }
  if (automationKey === "lead_first_response_sla_escalation") {
    return "lead SLA escalation";
  }
  if (automationKey === "lead_follow_up_due_reminder") {
    return "lead follow-up";
  }
  if (automationKey === "lead_follow_up_missed_escalation") {
    return "missed lead follow-up";
  }
  if (automationKey === "lead_dormant_reactivation") {
    return "dormant lead";
  }
  if (automationKey === "lead_no_response_nurture") {
    return "lead update";
  }
  return "workspace invite";
}

function leadReminderSummaryFields(
  payload: Record<string, unknown>,
  sourceMetadata: Record<string, unknown>,
) {
  return [
    {
      label: "Lead",
      value: coalesceText(
        payload.leadName,
        payload.lead_name,
        sourceMetadata.leadName,
      ),
    },
    {
      label: "Email",
      value: coalesceText(
        payload.leadEmail,
        payload.lead_email,
        sourceMetadata.leadEmail,
      ),
    },
    {
      label: "Phone",
      value: coalesceText(
        payload.leadPhone,
        payload.lead_phone,
        sourceMetadata.leadPhone,
      ),
    },
    {
      label: "Source",
      value: coalesceText(
        payload.leadSource,
        payload.lead_source,
        sourceMetadata.leadSource,
      ),
    },
    {
      label: "Status",
      value: coalesceText(
        payload.leadStatus,
        payload.lead_status,
        sourceMetadata.leadStatus,
      ),
    },
    {
      label: "Task",
      value: coalesceText(
        payload.taskTitle,
        payload.task_title,
        sourceMetadata.taskTitle,
      ),
    },
    {
      label: "Due",
      value: coalesceText(
        payload.dueDate,
        payload.due_date,
        payload.slaDueAt,
        payload.sla_due_at,
      ),
    },
    {
      label: "Quiet days",
      value: coalesceText(payload.quietDays, payload.quiet_days),
    },
  ].filter((field) => field.value);
}

function isLeadReminderAutomationKey(automationKey: string) {
  return [
    "lead_first_response_sla_reminder",
    "lead_first_response_sla_escalation",
    "lead_follow_up_due_reminder",
    "lead_follow_up_missed_escalation",
    "lead_dormant_reactivation",
    "lead_no_response_nurture",
  ].includes(automationKey);
}

function isLeadTaskAutomationKey(automationKey: string) {
  return [
    "lead_follow_up_due_reminder",
    "lead_follow_up_missed_escalation",
  ].includes(automationKey);
}

function taskStatusIsClosed(value: unknown) {
  return ["completed", "complete", "done", "cancelled", "canceled", "closed"]
    .includes(normalizeText(value).toLowerCase());
}

function leadStatusIsClosed(value: unknown) {
  return [
    "closed",
    "lost",
    "converted",
    "archived",
    "deleted",
    "cancelled",
    "canceled",
  ]
    .includes(normalizeText(value).toLowerCase());
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
    payload.recipientName,
    payload.recipient_name,
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
  const leadName = coalesceText(
    payload.leadName,
    payload.lead_name,
    "This lead",
  );
  const leadFields = leadReminderSummaryFields(payload, sourceMetadata);

  if (automationKey === "lead_first_response_sla_reminder") {
    return {
      title: "First response SLA due soon",
      ctaLabel: "Open Lead",
      greeting,
      organisationName,
      intro: [
        `${leadName} is still waiting for first contact and is approaching the first-response SLA.`,
        "Open the lead, make contact, and record the outcome so the account stays inside its service commitment.",
      ],
      summaryTitle: "Lead SLA",
      summaryFields: leadFields,
      fallback:
        "If the secure button is not available, open the lead from your agency workspace.",
      security:
        "Lead details are shared only with authorised people in the account.",
    };
  }

  if (automationKey === "lead_first_response_sla_escalation") {
    return {
      title: "Lead first response SLA missed",
      ctaLabel: "Open Lead",
      greeting,
      organisationName,
      intro: [
        `${leadName} has passed the first-response SLA without first contact being recorded.`,
        "Please review ownership, unblock the agent, or reassign the lead so the client is contacted.",
      ],
      summaryTitle: "SLA Breach",
      summaryFields: leadFields,
      fallback:
        "If the secure button is not available, open the lead from your agency workspace.",
      security:
        "This escalation is sent only to authorised managers and account administrators.",
    };
  }

  if (automationKey === "lead_follow_up_due_reminder") {
    return {
      title: "Lead follow-up due",
      ctaLabel: "Open Lead",
      greeting,
      organisationName,
      intro: [
        `${leadName} has a follow-up due now.`,
        "Complete the task or record the next outcome so the lead does not go quiet.",
      ],
      summaryTitle: "Follow-Up",
      summaryFields: leadFields,
      fallback:
        "If the secure button is not available, open the lead from your agency workspace.",
      security:
        "Lead follow-up details are shared only with authorised people in the account.",
    };
  }

  if (automationKey === "lead_follow_up_missed_escalation") {
    return {
      title: "Lead follow-up missed",
      ctaLabel: "Open Lead",
      greeting,
      organisationName,
      intro: [
        `${leadName} has an overdue follow-up task that has not been completed.`,
        "Please review the task, confirm ownership, and make sure the next client action is covered.",
      ],
      summaryTitle: "Missed Follow-Up",
      summaryFields: leadFields,
      fallback:
        "If the secure button is not available, open the lead from your agency workspace.",
      security:
        "This escalation is sent only to authorised managers and account administrators.",
    };
  }

  if (automationKey === "lead_dormant_reactivation") {
    return {
      title: "Dormant lead needs reactivation",
      ctaLabel: "Open Lead",
      greeting,
      organisationName,
      intro: [
        `${leadName} has had no recorded activity for the configured dormant-lead window.`,
        "Review the lead, decide whether to reactivate, nurture, reassign, or close it with a clear outcome.",
      ],
      summaryTitle: "Dormant Lead",
      summaryFields: leadFields,
      fallback:
        "If the secure button is not available, open the lead from your agency workspace.",
      security:
        "Dormant lead notifications are shared only with authorised people in the account.",
    };
  }

  if (automationKey === "lead_no_response_nurture") {
    return {
      title: "We are still working on your enquiry",
      ctaLabel: "Contact The Team",
      greeting,
      organisationName,
      intro: [
        "Your enquiry has been received and is still with the property team.",
        "If your needs have changed or you want to add detail, you can reply to this email and the team will pick it up.",
      ],
      summaryTitle: "Enquiry Update",
      summaryFields: leadFields.filter((field) =>
        ["Lead", "Source", "Status"].includes(field.label)
      ),
      fallback:
        "Reply to this email if you want to add anything to your enquiry.",
      security:
        "This message relates only to the enquiry you submitted to the agency.",
    };
  }

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
      title: "A quick nudge to finish seller onboarding",
      ctaLabel: "Complete Seller Onboarding",
      greeting,
      organisationName,
      intro: [
        "This is a gentle reminder that your seller onboarding is still waiting.",
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

  if (automationKey === "seller_document_request_reminder") {
    const documentName = coalesceText(
      payload.requirementName,
      payload.requirement_name,
      sourceMetadata.requirementName,
      "Requested seller document",
    );
    const isReupload = payload.isReupload === true ||
      payload.is_reupload === true;
    return {
      title: isReupload
        ? "Please replace a seller document"
        : "We still need one seller document",
      ctaLabel: isReupload ? "Replace Document" : "Upload Document",
      greeting,
      organisationName,
      intro: [
        isReupload
          ? `The ${documentName} you sent could not be accepted, so we need a replacement.`
          : `${documentName} is still needed to keep your property file moving.`,
        "Upload it securely in your seller portal. Your agent will be notified as soon as it lands.",
      ],
      summaryTitle: "Document Request",
      summaryFields: [
        { label: "Document", value: documentName },
        { label: "Reminder", value: reminderLabel },
        {
          label: "Due date",
          value: coalesceText(payload.dueDate, payload.due_date),
        },
      ],
      fallback:
        "If the secure button is not available, contact your agent and ask them to resend your seller portal link.",
      security:
        "For bank details or other sensitive documents, use the secure seller portal rather than replying with an attachment.",
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

export function buildReminderEmail(
  event: ReminderEventRow,
  req: Request,
  branding: EmailBranding,
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
    actionLink
      ? renderBridgeCta(template.ctaLabel, actionLink, {
        primaryColor: branding.primaryColor,
      })
      : "",
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
    organisationName: branding.organisationName || template.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
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

async function markReminderEventSkipped(
  supabase: any,
  event: ReminderEventRow,
  reason: string,
) {
  const metadata = asRecord(event.metadata_json);
  return await supabase
    .from("notification_events")
    .update({
      status: "skipped",
      error_message: null,
      last_dispatch_error: null,
      metadata_json: {
        ...metadata,
        phase: "phase_4_reminder_dispatch",
        skippedAt: new Date().toISOString(),
        skippedReason: reason,
      },
    })
    .eq("id", event.id)
    .select("id, status")
    .single();
}

async function leadReminderStopReason(
  supabase: any,
  event: ReminderEventRow,
  automationKey: string,
) {
  if (!isLeadReminderAutomationKey(automationKey)) return "";
  const payload = asRecord(event.payload_json);

  const leadId = normalizeUuid(
    event.lead_id || payload.leadId || payload.lead_id,
  );
  if (leadId) {
    const currentLead = await supabase
      .from("leads")
      .select("first_contacted_at, status, stage")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (!currentLead.error && currentLead.data) {
      if (
        leadStatusIsClosed(currentLead.data.status) ||
        leadStatusIsClosed(currentLead.data.stage)
      ) {
        return "lead_no_longer_open";
      }
      if (
        [
          "lead_first_response_sla_reminder",
          "lead_first_response_sla_escalation",
          "lead_no_response_nurture",
        ].includes(automationKey) && currentLead.data.first_contacted_at
      ) {
        return "lead_first_contact_already_logged";
      }
    }
  }

  if (isLeadTaskAutomationKey(automationKey)) {
    const taskId = normalizeUuid(payload.taskId || payload.task_id);
    if (!taskId) return "";
    const currentTask = await supabase
      .from("tasks")
      .select("status")
      .eq("task_id", taskId)
      .maybeSingle();
    if (
      !currentTask.error && currentTask.data &&
      taskStatusIsClosed(currentTask.data.status)
    ) {
      return "lead_task_no_longer_open";
    }
  }

  return "";
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

function isMissingRpc(error: unknown, rpcName: string) {
  const record = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const code = normalizeText(record.code).toUpperCase();
  const message = normalizeText(record.message).toLowerCase();
  return code === "42883" ||
    message.includes(normalizeText(rpcName).toLowerCase());
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
  const sellerDocuments = await supabase.rpc(
    "bridge_queue_seller_document_follow_ups_p0_3",
    {
      p_limit: queueLimit,
      p_now: now,
      p_dry_run: dryRun,
      p_listing_id: null,
    },
  );
  const sellerDocumentsUnavailable = isMissingRpc(
    sellerDocuments.error,
    "bridge_queue_seller_document_follow_ups_p0_3",
  );
  if (sellerDocuments.error && !sellerDocumentsUnavailable) {
    return sellerDocuments;
  }

  const sellerDocumentReviewSla = await supabase.rpc(
    "bridge_refresh_seller_document_review_sla_p1_9",
    {
      p_limit: queueLimit,
      p_now: now,
      p_dry_run: dryRun,
      p_organisation_id: null,
      p_listing_id: null,
    },
  );
  const sellerDocumentReviewSlaUnavailable = isMissingRpc(
    sellerDocumentReviewSla.error,
    "bridge_refresh_seller_document_review_sla_p1_9",
  );
  if (
    sellerDocumentReviewSla.error && !sellerDocumentReviewSlaUnavailable
  ) {
    return sellerDocumentReviewSla;
  }

  const leadFollowUpSla = await supabase.rpc(
    "bridge_queue_lead_follow_up_sla_events_phase3",
    {
      p_limit: queueLimit,
      p_now: now,
      p_dry_run: dryRun,
    },
  );
  const leadFollowUpSlaUnavailable = isMissingRpc(
    leadFollowUpSla.error,
    "bridge_queue_lead_follow_up_sla_events_phase3",
  );
  if (leadFollowUpSla.error && !leadFollowUpSlaUnavailable) {
    return leadFollowUpSla;
  }

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
    return {
      ...phase6,
      data: {
        ...(asRecord(phase6.data)),
        sellerDocumentFollowUps: sellerDocuments.error
          ? null
          : sellerDocuments.data,
        sellerDocumentReviewSla: sellerDocumentReviewSla.error
          ? null
          : sellerDocumentReviewSla.data,
        leadFollowUpSla: leadFollowUpSlaUnavailable
          ? null
          : leadFollowUpSla.data,
      },
    };
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
      sellerDocumentReviewSla: sellerDocumentReviewSla.error
        ? null
        : sellerDocumentReviewSla.data,
      leadFollowUpSla: leadFollowUpSlaUnavailable ? null : leadFollowUpSla.data,
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

    const sellerDocumentReleaseHeartbeat = await supabase.rpc(
      "bridge_record_seller_document_automation_heartbeat_p1_10",
      {
        p_source: "notification_reminder_dispatch",
        p_dry_run: dryRun,
        p_status: "completed",
        p_payload: asRecord(queued.data),
      },
    );
    const heartbeatUnavailable = isMissingRpc(
      sellerDocumentReleaseHeartbeat.error,
      "bridge_record_seller_document_automation_heartbeat_p1_10",
    );
    if (sellerDocumentReleaseHeartbeat.error && !heartbeatUnavailable) {
      return jsonResponse(500, {
        error: "Seller document automation heartbeat could not be recorded.",
        details: sellerDocumentReleaseHeartbeat.error,
      });
    }
    queueResult = {
      ...asRecord(queueResult),
      sellerDocumentReleaseHeartbeat: heartbeatUnavailable
        ? null
        : sellerDocumentReleaseHeartbeat.data,
    };
  }

  if (!dryRun) {
    await applyNotificationQueueControls(supabase, {
      limit,
      now: normalizeText(payload.now),
      eventId,
    });
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
  const results = [];

  for (const event of events) {
    const automationKey = normalizeText(event.automation_key);
    if (!isReminderAutomationKey(automationKey)) {
      continue;
    }

    const recipientEmail = normalizeText(event.recipient_email).toLowerCase();
    const template = resolveTemplate(event, resolveActionLink(event, req));
    const branding = await resolveEmailBranding({
      supabase,
      payload: {
        ...asRecord(event.payload_json),
        ...asRecord(event.metadata_json),
      },
      organisationId: normalizeUuid(event.organisation_id),
      defaults: {
        organisationName: template.organisationName || "Arch9",
      },
    });
    const from = formatEmailSender(
      normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
        "Arch9 <no-reply@arch9.co.za>",
      branding.fromName || branding.organisationName,
    );
    const content = buildReminderEmail(event, req, branding);
    const recipientSafety = assessControlledTestRecipient({
      email: recipientEmail,
      recipientName: asRecord(event.payload_json).recipientName,
      metadata: event.metadata_json,
    });

    if (dryRun) {
      results.push({
        eventId: event.id,
        automationKey,
        recipientEmail,
        subject: content.subject,
        dryRun: true,
        suppressed: recipientSafety.suppressed,
        suppressionReason: recipientSafety.reason || null,
      });
      continue;
    }

    if (automationKey === "seller_document_request_reminder") {
      const currentEvent = await supabase
        .from("notification_events")
        .select("status")
        .eq("id", event.id)
        .maybeSingle();
      if (currentEvent.error || currentEvent.data?.status !== "processing") {
        results.push({
          eventId: event.id,
          automationKey,
          ok: true,
          skipped: true,
          reason: currentEvent.error
            ? "stop_condition_check_failed"
            : "document_request_no_longer_open",
        });
        continue;
      }
    }

    const stopReason = await leadReminderStopReason(
      supabase,
      event,
      automationKey,
    );
    if (stopReason) {
      await markReminderEventSkipped(supabase, event, stopReason);
      results.push({
        eventId: event.id,
        automationKey,
        ok: true,
        skipped: true,
        reason: stopReason,
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

    if (recipientSafety.suppressed) {
      await markReminderEventSkipped(
        supabase,
        event,
        recipientSafety.reason || "controlled_test_recipient_suppressed",
      );
      results.push({
        eventId: event.id,
        automationKey,
        ok: true,
        skipped: true,
        reason: recipientSafety.reason,
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
