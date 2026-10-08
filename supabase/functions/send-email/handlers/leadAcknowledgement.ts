import { createClient, type SupabaseClient } from "supabase";
import {
  type LeadEnquiryKind,
  resolveLeadEnquiryKind,
} from "../services/leadAcknowledgementContext.ts";
import { createTenantQualificationLink } from "../services/tenantQualificationLink.ts";
import type { SendLeadAcknowledgementPayload } from "../types.ts";
import {
  buildLeadAcknowledgementEmailHtml,
  buildLeadAcknowledgementEmailText,
  buildLeadAcknowledgementSubject,
} from "../content/leadAcknowledgement.ts";
import {
  resolveAudienceEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function normalizeEmail(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/i.test(text) ? text : "";
}

export async function renderLeadAcknowledgementEnvelope(
  payload: SendLeadAcknowledgementPayload,
  supabase: SupabaseClient | undefined,
  savedKind?: LeadEnquiryKind,
) {
  const to = normalizeEmail(payload.to);
  if (!to) {
    throw new Error("A valid intro recipient is required.");
  }

  const centralSender =
    normalizeText(Deno.env.get("RESEND_LEAD_ACK_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";
  const replyTo = normalizeEmail(payload.replyTo || payload.reply_to);
  const subject = normalizeText(payload.subject) ||
    buildLeadAcknowledgementSubject(savedKind);

  const content = {
    recipientName: normalizeText(
      payload.recipientName || payload.recipient_name,
    ),
    organisationName: normalizeText(
      payload.organisationName || payload.organisation_name,
    ),
    organisationLogoUrl: normalizeText(
      payload.organisationLogoUrl || payload.organisation_logo_url,
    ),
    organisationTagline: normalizeText(
      payload.organisationTagline || payload.organisation_tagline,
    ),
    organisationPhone: normalizeText(
      payload.organisationPhone || payload.organisation_phone,
    ),
    organisationEmail: normalizeText(
      payload.organisationEmail || payload.organisation_email,
    ),
    organisationWebsite: normalizeText(
      payload.organisationWebsite || payload.organisation_website,
    ),
    organisationBrandPrimaryColor: normalizeText(
      payload.organisationBrandPrimaryColor ||
        payload.organisation_brand_primary_color,
    ),
    organisationBrandSecondaryColor: normalizeText(
      payload.organisationBrandSecondaryColor ||
        payload.organisation_brand_secondary_color,
    ),
    enquiryReceivedAt: normalizeText(
      payload.enquiryReceivedAt || payload.enquiry_received_at,
    ),
    timezone: normalizeText(payload.timezone),
    source: normalizeText(payload.source),
    originalMessage: normalizeText(
      payload.originalMessage || payload.original_message,
    ),
    agentName: normalizeText(payload.agentName || payload.agent_name),
    agentFirstName: normalizeText(
      payload.agentFirstName || payload.agent_first_name,
    ),
    agentEmail: normalizeEmail(payload.agentEmail || payload.agent_email),
    agentPhone: normalizeText(payload.agentPhone || payload.agent_phone),
    agentJobTitle: normalizeText(
      payload.agentJobTitle || payload.agent_job_title,
    ),
    agentBio: normalizeText(payload.agentBio || payload.agent_bio),
    agentAvatarUrl: normalizeText(
      payload.agentAvatarUrl || payload.agent_avatar_url,
    ),
    viewingAvailabilityUrl: normalizeText(
      payload.viewingAvailabilityUrl || payload.viewing_availability_url,
    ),
    responseExpectation: normalizeText(
      payload.responseExpectation || payload.response_expectation,
    ),
    customResponseText: normalizeText(
      payload.customResponseText || payload.custom_response_text,
    ),
  };
  const branding = await resolveEmailBranding({
    supabase,
    payload: payload as Record<string, unknown>,
    organisationId: normalizeText(
      payload.organisationId || payload.organisation_id,
    ),
    defaults: {
      organisationName: content.organisationName || "Arch9",
      logoUrl: content.organisationLogoUrl,
      tagline: content.organisationTagline,
      supportEmail: content.organisationEmail,
      supportPhone: content.organisationPhone,
      website: content.organisationWebsite,
      primaryColor: content.organisationBrandPrimaryColor,
      secondaryColor: content.organisationBrandSecondaryColor,
      fromName: normalizeText(payload.fromName || payload.from_name),
      replyTo,
    },
  });
  const agentName = content.agentName || "your property practitioner";
  const agentFirstName = content.agentFirstName ||
    agentName.split(/\s+/).filter(Boolean)[0] ||
    "the agent";
  const responseExpectation = content.customResponseText ||
    content.responseExpectation ||
    `${agentFirstName} will review your enquiry and contact you shortly.`;
  const enquiryKind = savedKind || await resolveLeadEnquiryKind(
    supabase,
    normalizeText(payload.organisationId || payload.organisation_id),
    normalizeText(payload.leadId || payload.lead_id),
  );
  if (enquiryKind === "rental") {
    try {
      content.viewingAvailabilityUrl = await createTenantQualificationLink(
        supabase,
        {
          organisationId: normalizeText(
            payload.organisationId || payload.organisation_id,
          ),
          leadId: normalizeText(payload.leadId || payload.lead_id),
          to,
          recipientName: content.recipientName,
          organisationName: branding.organisationName,
          agentName: content.agentName,
          agentEmail: content.agentEmail,
        },
      );
    } catch {
      throw new Error("Unable to create the tenant qualification link.");
    }
  }
  const html = buildLeadAcknowledgementEmailHtml({
    enquiryKind,
    ...content,
    organisationName: branding.organisationName,
    organisationLogoUrl: branding.logoDarkUrl || branding.logoLightUrl ||
      branding.logoUrl || branding.logoIconUrl,
    organisationTagline: branding.tagline,
    organisationPhone: branding.supportPhone,
    organisationEmail: branding.supportEmail,
    organisationWebsite: branding.website,
    organisationBrandPrimaryColor: branding.primaryColor,
    organisationBrandSecondaryColor: branding.secondaryColor,
    responseExpectation,
  });
  const sender = await resolveAudienceEmailSender({
    audience: "client",
    branding,
    platformSender: centralSender,
    supabase,
  });

  return {
    from: sender,
    to,
    bcc: content.agentEmail || undefined,
    subject,
    html,
    text: buildLeadAcknowledgementEmailText({
      ...content,
      enquiryKind,
      organisationName: branding.organisationName,
      organisationPhone: branding.supportPhone,
      organisationEmail: branding.supportEmail,
      organisationWebsite: branding.website,
    }),
    replyTo: replyTo || content.agentEmail || branding.replyTo ||
      branding.supportEmail || undefined,
  };
}

export async function handleLeadAcknowledgementEmail(
  payload: SendLeadAcknowledgementPayload,
) {
  const apiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!apiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }
  if (!normalizeEmail(payload.to)) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }
  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const key = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const client = url && key
    ? createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : undefined;
  let envelope: Awaited<ReturnType<typeof renderLeadAcknowledgementEnvelope>>;
  try {
    envelope = await renderLeadAcknowledgementEnvelope(payload, client);
  } catch {
    return jsonResponse(503, {
      error: "Unable to prepare the lead intro email. Please retry.",
    });
  }
  const result = await sendViaResendApi({
    apiKey,
    ...envelope,
    idempotencyKey:
      normalizeText(payload.idempotencyKey || payload.idempotency_key) ||
      undefined,
  });
  if (
    !result.ok || typeof result.data?.id !== "string" || !result.data.id.trim()
  ) {
    return jsonResponse(502, {
      error: "The email provider has not confirmed acceptance.",
    });
  }
  return jsonResponse(200, {
    ok: true,
    sent: true,
    type: "lead_acknowledgement",
    emailId: result.data.id,
    providerMessageId: result.data.id,
  });
}
