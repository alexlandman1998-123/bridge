import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  type EmailBranding,
  resolveAudienceEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import {
  homeSeekersSellerDetails,
  isHomeSeekersSellerEnquiry,
  sendHomeSeekersSellerEnquiryEmails,
} from "./homeSeekersSellerEnquiry.ts";
import type { SendLeadOperationsNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { createClient } from "supabase";

const EVENT_LABELS: Record<string, { title: string; subject: string }> = {
  tenant_qualification_submitted: {
    title: "Tenant Qualification Received",
    subject: "Tenant qualification and viewing request received",
  },
  new_enquiry_assigned_agent: {
    title: "A new lead just landed",
    subject: "A new lead just landed",
  },
  new_enquiry_unassigned_manager: {
    title: "New Unassigned Enquiry",
    subject: "New enquiry needs assignment",
  },
  new_website_enquiry_principal: {
    title: "New Website Enquiry",
    subject: "New website enquiry received",
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
  buyer_viewing_times_submitted_agent: {
    title: "Buyer Viewing Times Submitted",
    subject: "Buyer submitted viewing times",
  },
  seller_viewing_response_submitted_agent: {
    title: "Seller Viewing Response Submitted",
    subject: "Seller submitted viewing access",
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

function normalizeListText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join(
      "\n",
    );
  }
  return normalizeText(value);
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
    return `${leadName ? `${leadName} is your new lead.` : "You have a new lead."} Their details are ready below. Take a look and say hello.`;
  }
  if (eventKind === "new_enquiry_unassigned_manager") {
    return `${
      leadName || "A new lead"
    } came in without an assigned owner. Please assign it to an agent.`;
  }
  if (eventKind === "new_website_enquiry_principal") {
    return `${
      leadName || "A new lead"
    } submitted a website enquiry. Review the details and make sure the lead is followed up.`;
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
  if (eventKind === "buyer_viewing_times_submitted_agent") {
    return `${
      leadName || "A buyer"
    } submitted three preferred viewing times. Review the options and send the best times to the seller for access confirmation.`;
  }
  if (eventKind === "seller_viewing_response_submitted_agent") {
    return `${
      leadName || "A seller"
    } submitted viewing access details. Review the availability and confirm the viewing with the buyer.`;
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
  propertyAddress,
  propertyPrice,
  enquiryType,
  enquiryIntent,
  enquiryMessage,
  availabilityWindows,
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
  propertyAddress?: string;
  propertyPrice?: string;
  enquiryType?: string;
  enquiryIntent?: string;
  enquiryMessage?: string;
  availabilityWindows?: string;
  budgetLabel?: string;
  assignedAgentName?: string;
  assignedAgentEmail?: string;
  previousAgentName?: string;
  previousAgentEmail?: string;
  reason?: string;
  branding: EmailBranding;
}) {
  const isNewAssignedLead = eventKind === "new_enquiry_assigned_agent";
  const greetingName = isNewAssignedLead
    ? (recipientName.includes("@") ? "there" : normalizeText(recipientName).split(/\s+/)[0] || "there")
    : recipientName || "there";
  const fields = [
    { label: "Lead", value: leadName || "" },
    { label: "Email", value: leadEmail || "" },
    { label: "Phone", value: leadPhone || "" },
    { label: "Source", value: leadSource || "" },
    { label: "Category", value: leadCategory || "" },
    { label: "Status", value: leadStatus || "" },
    { label: "Property", value: propertyLabel || "" },
    { label: "Property Address", value: propertyAddress || "" },
    { label: "Asking Price", value: propertyPrice || "" },
    { label: "Enquiry Type", value: enquiryType || "" },
    { label: "Enquiry Intent", value: enquiryIntent || "" },
    { label: "Message", value: enquiryMessage || "" },
    { label: "Client Availability", value: availabilityWindows || "" },
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
    greeting: `Hi ${greetingName},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(fields, isNewAssignedLead ? "Your new lead" : "Lead Summary"),
      renderBridgeCta("Open Lead", actionLink || "", {
        primaryColor: branding.primaryColor,
      }),
    ].join(""),
    securityBody:
      "Lead details are shared only with authorised people in the account.",
    helpBody: eventKind === "new_enquiry_unassigned_manager" ||
        eventKind === "lead_unassigned"
      ? "Assign the lead to an owner so follow-up can start."
      : isNewAssignedLead
      ? "A quick hello is a good place to start. Open the lead, make contact and record your next step."
      : "Open the lead to review the enquiry and continue the next action.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  const text = [
    `Hi ${greetingName},`,
    "",
    message,
    leadName ? `Lead: ${leadName}` : "",
    leadEmail ? `Email: ${leadEmail}` : "",
    leadPhone ? `Phone: ${leadPhone}` : "",
    leadSource ? `Source: ${leadSource}` : "",
    propertyLabel ? `Property: ${propertyLabel}` : "",
    propertyAddress ? `Property address: ${propertyAddress}` : "",
    propertyPrice ? `Asking price: ${propertyPrice}` : "",
    enquiryType ? `Enquiry type: ${enquiryType}` : "",
    enquiryIntent ? `Enquiry intent: ${enquiryIntent}` : "",
    enquiryMessage ? `Message: ${enquiryMessage}` : "",
    availabilityWindows ? `Client availability:\n${availabilityWindows}` : "",
    budgetLabel ? `Budget: ${budgetLabel}` : "",
    assignedAgentName || assignedAgentEmail
      ? `Assigned agent: ${assignedAgentName || assignedAgentEmail}`
      : "",
    previousAgentName || previousAgentEmail
      ? `Previous agent: ${previousAgentName || previousAgentEmail}`
      : "",
    reason ? `Reason: ${reason}` : "",
    actionLink ? `Open lead: ${actionLink}` : "",
    isNewAssignedLead ? "A quick hello is a good place to start. Make contact and record your next step." : "",
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
  const from = await resolveAudienceEmailSender({
    audience: "internal",
    branding,
    platformSender: normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
      normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <no-reply@arch9.co.za>",
  });

  const leadCategory = firstText(
    payload.leadCategory,
    payload.lead_category,
    metadata.leadCategory,
  );
  if (
    envEnabled(Deno.env.get("HOME_SEEKERS_SELLER_EMAILS_ENABLED"), false) &&
    isHomeSeekersSellerEnquiry({ eventKind, organisationId, leadCategory })
  ) {
    const sellerEmail = firstText(
      payload.leadEmail,
      payload.lead_email,
      metadata.leadEmail,
    );
    const leadId = firstText(payload.leadId, payload.lead_id);
    const url = normalizeText(Deno.env.get("SUPABASE_URL"));
    const key = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    let clientIntroManaged = false;
    if (url && key && leadId) {
      const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
      const status = await client.rpc("lead_client_intro_status",{p_organisation_id:organisationId,p_lead_id:leadId});
      if (status.error) return jsonResponse(503,{error:"The client intro queue could not be verified. Please retry."});
      clientIntroManaged = Boolean(status.data);
    }
    const result = await sendHomeSeekersSellerEnquiryEmails({
      apiKey: resendApiKey,
      configuredSender:
        normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
        normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) || from,
      agencyTo: recipientEmail,
      sellerTo: sellerEmail,
      sendSeller: !clientIntroManaged,
      details: homeSeekersSellerDetails({
        sellerName: leadName,
        sellerEmail,
        sellerPhone: firstText(
          payload.leadPhone,
          payload.lead_phone,
          metadata.leadPhone,
        ),
        propertyAddress: firstText(
          payload.propertyAddress,
          payload.property_address,
          metadata.propertyAddress,
        ),
        enquiryMessage: firstText(
          payload.enquiryMessage,
          payload.enquiry_message,
          metadata.enquiryMessage,
        ),
        leadUrl: actionLink,
      }),
      idempotencyKey: firstText(
        payload.idempotencyKey,
        payload.idempotency_key,
        `home-seekers-seller:${leadId}:${recipientEmail}`,
      ),
    });
    if (!result.ok) {
      return jsonResponse(502, {
        error: "Home Seekers seller email delivery failed.",
        stage: result.stage,
        details: result.error,
      });
    }
    return jsonResponse(200, {
      ok: true,
      type: eventKind,
      sent: true,
      leadId,
      recipientEmail,
      sellerRecipientEmail: sellerEmail || null,
      sellerSkipped: "sellerSkipped" in result ? result.sellerSkipped : null,
      provider: "resend",
      providerResponse: result.agencyResponse,
      sellerProviderResponse: "sellerResponse" in result
        ? result.sellerResponse
        : null,
    });
  }

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
    propertyAddress: firstText(
      payload.propertyAddress,
      payload.property_address,
      metadata.propertyAddress,
    ),
    propertyPrice: firstText(
      payload.propertyPrice,
      payload.property_price,
      metadata.propertyPrice,
    ),
    enquiryType: firstText(
      payload.enquiryType,
      payload.enquiry_type,
      metadata.enquiryType,
    ),
    enquiryIntent: firstText(
      payload.enquiryIntent,
      payload.enquiry_intent,
      metadata.enquiryIntent,
    ),
    enquiryMessage: firstText(
      payload.enquiryMessage,
      payload.enquiry_message,
      metadata.enquiryMessage,
    ),
    availabilityWindows: normalizeListText(
      payload.availabilityWindows ||
        payload.availability_windows ||
        metadata.availabilityWindows,
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
    idempotencyKey:
      normalizeText(payload.idempotencyKey || payload.idempotency_key) ||
      undefined,
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
