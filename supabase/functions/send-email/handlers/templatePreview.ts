import {
  buildAppointmentEmailHtml,
  buildAppointmentEmailText,
  buildAppointmentSubject,
} from "../content/appointment.ts";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  buildKingstonsValuationDownloadEmailHtml,
  buildKingstonsValuationDownloadEmailText,
  buildKingstonsValuationDownloadSubject,
} from "../content/kingstonsValuationDownload.ts";
import {
  buildBuyerViewingAvailabilityRequestEmailHtml,
  buildBuyerViewingAvailabilityRequestEmailText,
} from "../content/viewingAvailabilityRequest.ts";
import { resolveEmailBranding } from "../services/emailBranding.ts";
import type { SendLeadAcknowledgementPayload } from "../types.ts";
import { buildLeadAcknowledgementEmailText } from "../content/leadAcknowledgement.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[-\s]+/g, "_");
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function sampleBrandingDefaults(payload: Record<string, unknown>) {
  return {
    organisationName: firstText(
      payload.organisationName,
      payload.organisation_name,
      "Kingstons Real Estate",
    ),
    logoUrl: firstText(
      payload.organisationLogoUrl,
      payload.organisation_logo_url,
      "https://app.arch9.co.za/brand/kingstons-logo-cover.png",
    ),
    logoDarkUrl: firstText(
      payload.organisationLogoDarkUrl,
      payload.organisation_logo_dark_url,
      "https://app.arch9.co.za/brand/kingstons-logo-cover.png",
    ),
    supportEmail: firstText(payload.supportEmail, payload.support_email),
    supportPhone: firstText(payload.supportPhone, payload.support_phone),
    primaryColor: firstText(
      payload.organisationBrandPrimaryColor,
      payload.organisation_brand_primary_color,
      "#052b2b",
    ),
    secondaryColor: firstText(
      payload.organisationBrandSecondaryColor,
      payload.organisation_brand_secondary_color,
      "#d49a18",
    ),
    fromName: firstText(payload.fromName, payload.from_name),
  };
}

function buildLeadAcknowledgementPreview({
  payload,
  branding,
}: {
  payload: Record<string, unknown>;
  branding: Awaited<ReturnType<typeof resolveEmailBranding>>;
}) {
  const content = {
    recipientName: firstText(payload.recipientName, payload.recipient_name, "Alex"),
    organisationName: branding.organisationName,
    organisationLogoUrl: branding.logoUrl,
    organisationTagline: firstText(payload.organisationTagline, payload.organisation_tagline),
    organisationPhone: branding.supportPhone,
    organisationEmail: branding.supportEmail,
    organisationWebsite: firstText(payload.organisationWebsite, payload.organisation_website),
    organisationBrandPrimaryColor: branding.primaryColor,
    organisationBrandSecondaryColor: branding.secondaryColor,
    enquiryReceivedAt: firstText(payload.enquiryReceivedAt, payload.enquiry_received_at, new Date().toISOString()),
    timezone: firstText(payload.timezone, "Africa/Johannesburg"),
    source: firstText(payload.source, "Property24"),
    originalMessage: firstText(payload.originalMessage, payload.original_message, "I'm interested in this property, please contact me."),
    agentName: firstText(payload.agentName, payload.agent_name, "Alexander Landman"),
    agentFirstName: firstText(payload.agentFirstName, payload.agent_first_name, "Alexander"),
    agentEmail: firstText(payload.agentEmail, payload.agent_email, "alex.kingstons.training@arch9.test"),
    agentPhone: firstText(payload.agentPhone, payload.agent_phone, "0676125009"),
    agentJobTitle: firstText(payload.agentJobTitle, payload.agent_job_title, "Property Professional"),
    agentBio: firstText(payload.agentBio, payload.agent_bio),
    agentAvatarUrl: firstText(payload.agentAvatarUrl, payload.agent_avatar_url),
    responseExpectation: firstText(payload.responseExpectation, payload.response_expectation),
    customResponseText: firstText(payload.customResponseText, payload.custom_response_text),
  };
  const agentName = content.agentName || "your property practitioner";
  const agentFirstName = content.agentFirstName ||
    agentName.split(/\s+/).filter(Boolean)[0] ||
    "the agent";
  const responseExpectation = content.customResponseText ||
    content.responseExpectation ||
    `${agentFirstName} will review your enquiry and contact you shortly.`;
  const contentHtml = [
    renderBridgeIntroParagraphs([
      "Thank you for your interest in one of our properties. We have received your enquiry and our team will be in touch with you shortly.",
      "Buying a home is a big decision, and we are here to make the process as smooth and straightforward as possible.",
      responseExpectation,
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Agent", value: agentName },
        { label: "Agent Email", value: content.agentEmail },
        { label: "Agent Phone", value: content.agentPhone },
        { label: "Source", value: content.source },
        { label: "Message", value: content.originalMessage },
      ],
      "Enquiry Details",
    ),
    content.agentEmail
      ? renderBridgeCta(`Email ${agentFirstName}`, `mailto:${content.agentEmail}`, {
        primaryColor: branding.primaryColor,
      })
      : "",
  ].join("");
  return {
    subject: "Thanks for your property enquiry",
    html: renderBridgeEmailLayout({
      preheader: "We have received your property enquiry.",
      title: "Thanks For Your Enquiry",
      greeting: `Hi ${content.recipientName || "there"},`,
      contentHtml,
      securityBody:
        "Your enquiry details are shared only with the property team handling your request.",
      helpBody:
        "Need help? Reply to this email or contact the listed property practitioner directly.",
      organisationName: branding.organisationName,
      supportEmail: branding.supportEmail,
      supportPhone: branding.supportPhone,
      branding,
    }),
    text: buildLeadAcknowledgementEmailText(
      content as SendLeadAcknowledgementPayload,
    ),
  };
}

export async function handleTemplatePreviewEmail(payload: Record<string, unknown>) {
  const templateKey = normalizeKey(
    payload.templateKey || payload.template_key || payload.previewTemplate ||
      payload.preview_template || payload.emailTemplateType ||
      payload.email_template_type,
  );
  const branding = await resolveEmailBranding({
    payload,
    organisationId: firstText(payload.organisationId, payload.organisation_id),
    defaults: sampleBrandingDefaults(payload),
  });
  const property = {
    title: firstText(payload.propertyTitle, "19 Aspen Creek, Benoni North AH"),
    price: firstText(payload.propertyPrice, "R 765 000"),
    area: firstText(payload.propertyArea, "Benoni North AH"),
    match: "New enquiry",
    imageUrl: firstText(
      payload.propertyImageUrl,
      payload.property_image_url,
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1000&q=80",
    ),
    link: "https://app.arch9.co.za/listings/demo-property",
  };

  let preview;
  if ([
    "buyer_viewing_availability_request",
    "buyer_viewing_request",
    "viewing_availability_request",
  ].includes(templateKey)) {
    const content = {
      buyerName: firstText(payload.buyerName, payload.recipientName, "Alex"),
      agentName: firstText(payload.agentName, "Alexander Landman"),
      properties: [property],
      note: firstText(payload.note),
      organisationName: branding.organisationName,
      supportEmail: branding.supportEmail,
      supportPhone: branding.supportPhone,
      actionLink: firstText(
        payload.actionLink,
        "https://app.arch9.co.za/viewing-preferences/demo-token",
      ),
      agentCardUrl: firstText(
        payload.agentCardUrl,
        payload.agent_card_url,
        "https://app.arch9.co.za/card/alexander-landman",
      ),
      branding,
    };
    preview = {
      subject: "Choose your preferred viewing times",
      html: buildBuyerViewingAvailabilityRequestEmailHtml(content),
      text: buildBuyerViewingAvailabilityRequestEmailText(content),
    };
  } else if ([
    "lead_acknowledgement",
    "lead_acknowledgement_email",
    "property_enquiry_acknowledgement",
  ].includes(templateKey)) {
    preview = buildLeadAcknowledgementPreview({ payload, branding });
  } else if ([
    "kingstons_valuation_download",
    "valuation_download",
    "valuation_report_download",
  ].includes(templateKey)) {
    const content = {
      recipientName: firstText(payload.recipientName, "Alex"),
      propertyLabel: property.title,
      agentName: firstText(payload.agentName, "Alexander Landman"),
      agentRole: firstText(payload.agentRole, "Agent"),
      valuationDownloadUrl: firstText(
        payload.valuationDownloadUrl,
        "https://app.arch9.co.za/downloads/demo-valuation.pdf",
      ),
      valuationFileName: firstText(
        payload.valuationFileName,
        "Kingstons valuation - 19 Aspen Creek.pdf",
      ),
      organisationName: branding.organisationName,
      supportEmail: branding.supportEmail,
      supportPhone: branding.supportPhone,
      branding,
    };
    preview = {
      subject: buildKingstonsValuationDownloadSubject(),
      html: buildKingstonsValuationDownloadEmailHtml(content),
      text: buildKingstonsValuationDownloadEmailText(content),
    };
  } else if ([
    "kingstons_valuation_appointment",
    "appointment_confirmation_required",
    "valuation_appointment",
  ].includes(templateKey)) {
    const content = {
      eventType: "appointment_confirmation_required",
      recipientName: firstText(payload.recipientName, "Alex"),
      appointmentType: "seller_valuation",
      appointmentTitle: "Kingstons Valuation Request",
      appointmentDate: "2026-08-13",
      appointmentTime: "14:30",
      relatedListing: property.title,
      location: property.title,
      status: "Pending confirmation",
      notes: "Your valuation appointment is ready for confirmation.",
      actionLink: "https://app.arch9.co.za/appointments/demo-rsvp",
      acceptLink: "https://app.arch9.co.za/appointments/demo-rsvp?status=accepted",
      declineLink: "https://app.arch9.co.za/appointments/demo-rsvp?status=declined",
      rescheduleLink: "https://app.arch9.co.za/appointments/demo-rsvp?status=reschedule",
      participantRole: "seller",
      agentName: firstText(payload.agentName, "Alexander Landman"),
      agentRole: "Agent - Kingstons Real Estate",
      agentBio:
        "Alexander will meet you at the property and guide you through the valuation and next steps.",
      organisationName: branding.organisationName,
      supportEmail: branding.supportEmail,
      supportPhone: branding.supportPhone,
      attachCalendarInvite: true,
      branding,
      emailTemplateKey: "kingstons_valuation",
    };
    preview = {
      subject: buildAppointmentSubject(
        content.eventType,
        content.appointmentType,
        {
          participantRole: content.participantRole,
          appointmentTitle: content.appointmentTitle,
          organisationName: branding.organisationName,
          emailTemplateKey: content.emailTemplateKey,
        },
      ),
      html: buildAppointmentEmailHtml(content),
      text: buildAppointmentEmailText(content),
    };
  } else {
    return jsonResponse(400, {
      error: "Unsupported preview template.",
      receivedTemplate: templateKey,
      supportedTemplates: [
        "buyer_viewing_availability_request",
        "lead_acknowledgement",
        "kingstons_valuation_appointment",
        "kingstons_valuation_download",
      ],
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "template_preview",
    templateKey,
    subject: preview.subject,
    html: preview.html,
    text: preview.text,
    generatedAt: new Date().toISOString(),
  });
}
