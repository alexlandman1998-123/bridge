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
import type { SendLeadOperationsNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

const EVENT_LABELS: Record<string, { title: string; subject: string }> = {
  new_enquiry_assigned_agent: {
    title: "New Enquiry Assigned",
    subject: "New enquiry assigned to you",
  },
  new_enquiry_unassigned_manager: {
    title: "New Unassigned Enquiry",
    subject: "New enquiry needs assignment",
  },
  lead_assigned: {
    title: "Lead Assigned",
    subject: "Lead assigned to you",
  },
  lead_reassigned: {
    title: "Lead Reassigned",
    subject: "Lead reassigned",
  },
  lead_unassigned: {
    title: "Lead Unassigned",
    subject: "Lead returned to the queue",
  },
  lead_claimed_confirmation: {
    title: "Lead Claimed",
    subject: "Lead claimed",
  },
};

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

function normalizeEventKind(payload: SendLeadOperationsNotificationPayload) {
  const explicit = firstText(payload.eventKind, payload.event_kind);
  const type = normalizeText(payload.type);
  const eventKind = explicit || type;
  return EVENT_LABELS[eventKind] ? eventKind : "lead_assigned";
}

function defaultMessage({
  eventKind,
  leadName,
  assignedAgentName,
  previousAgentName,
  reason,
}: {
  eventKind: string;
  leadName: string;
  assignedAgentName: string;
  previousAgentName: string;
  reason: string;
}) {
  if (eventKind === "new_enquiry_assigned_agent") {
    return `${
      leadName || "A new lead"
    } has been assigned to you. Please review the enquiry and make first contact.`;
  }
  if (eventKind === "new_enquiry_unassigned_manager") {
    return `${
      leadName || "A new lead"
    } came in without an assigned owner. Please assign it to an agent.`;
  }
  if (eventKind === "lead_reassigned") {
    return `${leadName || "A lead"} was reassigned${
      assignedAgentName ? ` to ${assignedAgentName}` : ""
    }${previousAgentName ? ` from ${previousAgentName}` : ""}.`;
  }
  if (eventKind === "lead_unassigned") {
    return `${leadName || "A lead"} was returned to the unassigned queue${
      reason ? `: ${reason}` : "."
    }`;
  }
  if (eventKind === "lead_claimed_confirmation") {
    return `${leadName || "A lead"} has been claimed${
      assignedAgentName ? ` by ${assignedAgentName}` : ""
    }.`;
  }
  return `${
    leadName || "A lead"
  } has been assigned to you. Please review the lead and continue the next action.`;
}

export function buildLeadOperationsNotificationEmail({
  eventKind,
  recipientName,
  title,
  message,
  actionLink,
  leadName,
  leadEmail,
  leadPhone,
  leadSource,
  leadCategory,
  leadStatus,
  propertyLabel,
  budgetLabel,
  assignedAgentName,
  assignedAgentEmail,
  previousAgentName,
  previousAgentEmail,
  reason,
  branding,
}: {
  eventKind: string;
  recipientName: string;
  title: string;
  message: string;
  actionLink?: string;
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  leadSource?: string;
  leadCategory?: string;
  leadStatus?: string;
  propertyLabel?: string;
  budgetLabel?: string;
  assignedAgentName?: string;
  assignedAgentEmail?: string;
  previousAgentName?: string;
  previousAgentEmail?: string;
  reason?: string;
  branding: EmailBranding;
}) {
  const fields = [
    { label: "Lead", value: leadName || "" },
    { label: "Email", value: leadEmail || "" },
    { label: "Phone", value: leadPhone || "" },
    { label: "Source", value: leadSource || "" },
    { label: "Category", value: leadCategory || "" },
    { label: "Status", value: leadStatus || "" },
    { label: "Property", value: propertyLabel || "" },
    { label: "Budget", value: budgetLabel || "" },
    {
      label: "Assigned Agent",
      value: assignedAgentName || assignedAgentEmail || "",
    },
    {
      label: "Previous Agent",
      value: previousAgentName || previousAgentEmail || "",
    },
    { label: "Reason", value: reason || "" },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName || "there"},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(fields, "Lead Summary"),
      renderBridgeCta("Open Lead", actionLink || "", {
        primaryColor: branding.primaryColor,
      }),
    ].join(""),
    securityBody:
      "Lead details are shared only with authorised people in the account.",
    helpBody: eventKind === "new_enquiry_unassigned_manager" ||
        eventKind === "lead_unassigned"
      ? "Assign the lead to an owner so follow-up can start."
      : "Open the lead to review the enquiry and continue the next action.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  const text = [
    `Hi ${recipientName || "there"},`,
    "",
    message,
    leadName ? `Lead: ${leadName}` : "",
    leadEmail ? `Email: ${leadEmail}` : "",
    leadPhone ? `Phone: ${leadPhone}` : "",
    leadSource ? `Source: ${leadSource}` : "",
    propertyLabel ? `Property: ${propertyLabel}` : "",
    budgetLabel ? `Budget: ${budgetLabel}` : "",
    assignedAgentName || assignedAgentEmail
      ? `Assigned agent: ${assignedAgentName || assignedAgentEmail}`
      : "",
    previousAgentName || previousAgentEmail
      ? `Previous agent: ${previousAgentName || previousAgentEmail}`
      : "",
    reason ? `Reason: ${reason}` : "",
    actionLink ? `Open lead: ${actionLink}` : "",
  ].filter(Boolean).join("\n");

  return { html, text };
}

export async function handleLeadOperationsNotificationEmail(
  payload: SendLeadOperationsNotificationPayload,
) {
  const emailsEnabled = envEnabled(
    Deno.env.get("LEAD_OPERATIONS_EMAILS_ENABLED"),
    true,
  );
  const recipientEmail = normalizeText(payload.to).toLowerCase();
  const eventKind = normalizeEventKind(payload);
  const labels = EVENT_LABELS[eventKind];

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: eventKind,
      sent: false,
      suppressed: true,
      reason: "lead_operations_emails_disabled",
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
  const organisationId = firstText(
    payload.organisationId,
    payload.organisation_id,
    metadata.organisationId,
    metadata.organisation_id,
  );
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    organisationId,
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
  const leadName = firstText(
    payload.leadName,
    payload.lead_name,
    metadata.leadName,
  );
  const assignedAgentName = firstText(
    payload.assignedAgentName,
    payload.assigned_agent_name,
    metadata.assignedAgentName,
  );
  const previousAgentName = firstText(
    payload.previousAgentName,
    payload.previous_agent_name,
    metadata.previousAgentName,
  );
  const reason = firstText(payload.reason, metadata.reason);
  const message = normalizeText(payload.message) ||
    defaultMessage({
      eventKind,
      leadName,
      assignedAgentName,
      previousAgentName,
      reason,
    });
  const subject = normalizeText(payload.subject) || labels.subject;
  const title = normalizeText(payload.title) || labels.title;
  const recipientName =
    firstText(payload.recipientName, payload.recipient_name) || "there";
  const actionLink = firstText(
    payload.actionLink,
    payload.action_link,
    metadata.actionLink,
    metadata.action_link,
  );
  const from = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <no-reply@arch9.co.za>",
    branding.fromName || branding.organisationName,
  );

  const { html, text } = buildLeadOperationsNotificationEmail({
    eventKind,
    recipientName,
    title,
    message,
    actionLink,
    leadName,
    leadEmail: firstText(
      payload.leadEmail,
      payload.lead_email,
      metadata.leadEmail,
    ),
    leadPhone: firstText(
      payload.leadPhone,
      payload.lead_phone,
      metadata.leadPhone,
    ),
    leadSource: firstText(
      payload.leadSource,
      payload.lead_source,
      metadata.leadSource,
    ),
    leadCategory: firstText(
      payload.leadCategory,
      payload.lead_category,
      metadata.leadCategory,
    ),
    leadStatus: firstText(
      payload.leadStatus,
      payload.lead_status,
      metadata.leadStatus,
    ),
    propertyLabel: firstText(
      payload.propertyLabel,
      payload.property_label,
      metadata.propertyLabel,
    ),
    budgetLabel: firstText(
      payload.budgetLabel,
      payload.budget_label,
      metadata.budgetLabel,
    ),
    assignedAgentName,
    assignedAgentEmail: firstText(
      payload.assignedAgentEmail,
      payload.assigned_agent_email,
      metadata.assignedAgentEmail,
    ),
    previousAgentName,
    previousAgentEmail: firstText(
      payload.previousAgentEmail,
      payload.previous_agent_email,
      metadata.previousAgentEmail,
    ),
    reason,
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
      error: "Resend rejected the lead operations email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: eventKind,
    sent: true,
    leadId: firstText(payload.leadId, payload.lead_id),
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
