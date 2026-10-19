import type { LeadEnquiryKind } from "../services/leadAcknowledgementContext.ts";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function limitText(value: unknown, maxLength: number) {
  const text = cleanText(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function initials(value: unknown) {
  const parts = cleanText(value).split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "A9";
}

function sourceLabel(value: unknown) {
  const key = cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const labels: Record<string, string> = {
    property24: "Property24",
    private_property: "Private Property",
    privateproperty: "Private Property",
    website: "Website",
    email: "Email",
    manual: "Direct enquiry",
    direct_enquiry: "Direct enquiry",
  };
  return labels[key] || cleanText(value) || "Email";
}

function normalizeColor(value: unknown, fallback: string) {
  const text = cleanText(value);
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function formatDateTime(value: unknown, timezone: unknown) {
  const date = new Date(cleanText(value));
  if (Number.isNaN(date.getTime())) return "";
  const timeZone = cleanText(timezone) || "Africa/Johannesburg";
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      timeZone,
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
}

function telHref(value: unknown) {
  const text = cleanText(value);
  if (!text) return "";
  const normalized = text.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

function responseText(expectation: unknown, customText: unknown, agentName: string) {
  const custom = cleanText(customText);
  if (cleanText(expectation) === "custom" && custom) return custom;
  if (cleanText(expectation) === "within_business_day") {
    return `${agentName || "The agent"} will review your enquiry and get in touch with you as soon as possible, usually within the next business day.`;
  }
  if (cleanText(expectation) === "within_two_hours") {
    return `${agentName || "The agent"} will review your enquiry and get in touch with you as soon as possible.`;
  }
  return `${agentName || "Our team"} will review your enquiry and contact you as soon as possible.`;
}

export type LeadAcknowledgementContentInput = {
  enquiryKind?: LeadEnquiryKind;
  recipientName?: string;
  organisationName?: string;
  organisationLogoUrl?: string;
  organisationTagline?: string;
  organisationPhone?: string;
  organisationEmail?: string;
  organisationWebsite?: string;
  organisationBrandPrimaryColor?: string;
  organisationBrandSecondaryColor?: string;
  enquiryReceivedAt?: string;
  timezone?: string;
  source?: string;
  originalMessage?: string;
  agentName?: string;
  agentFirstName?: string;
  agentEmail?: string;
  agentPhone?: string;
  agentJobTitle?: string;
  agentBio?: string;
  agentAvatarUrl?: string;
  viewingAvailabilityUrl?: string;
  responseExpectation?: string;
  customResponseText?: string;
};

function enquiryCopy(kind: LeadEnquiryKind = "general") {
  if (kind === "seller") return {
    heading: "Let's talk about selling your property",
    details: "Tell us about your property and when you would like to discuss a valuation. We will help you plan your next steps.",
    introduction: "Selling your property is an important decision. We are here to help with a valuation, marketing advice and the selling process.",
  };
  if (kind === "rental") return {
    heading: "Your next rental home starts here",
    details: "Complete your tenant qualification: monthly rental budget, preferred area, move-in date, employment, deposit, screening consent, household and pets. Share your preferred viewing times in the same short form.",
    introduction: "Finding a rental home is an important decision. We are here to help you arrange a viewing, understand the rental requirements and discuss the next steps.",
  };
  if (kind === "landlord") return {
    heading: "Discuss letting your property",
    details: "Tell us when you would like to discuss your property. We’ll confirm its availability, expected monthly rent, and your letting or management requirements.",
    introduction: "We are here to help you let your property and discuss the rental process and management options.",
  };
  if (kind === "sale") return {
    heading: "Let’s make your next move feel right",
    details: "Share your budget, favourite areas and what matters most in your next home, then suggest three viewing times that suit you. Your agent will review your answers and get back to you to arrange the next step. These are requested times; your viewing is confirmed once we agree the details with you.",
    introduction: "Buying a home is a big decision, and it starts with getting to know you. Whether you’ve found a place you love or you’re still exploring, we’re here to help you find the right fit.",
  };
  return {
    heading: "Discuss your property enquiry",
    details: "Tell us what you need help with and when you would like to speak to your property practitioner.",
    introduction: "Whether you would like to ask a question or receive more information, we will be happy to assist with your property enquiry.",
  };
}

export function buildLeadAcknowledgementSubject(kind?: LeadEnquiryKind) {
  if (kind === "seller") return "Thanks for getting in touch about selling your property";
  return "Thanks for your property enquiry";
}

function receiptIntroduction(kind?: LeadEnquiryKind) {
  return kind === "sale" ? "Thanks for reaching out. We’re glad you’re here, and we’re looking forward to helping you with your property search."
    : kind === "seller" ? "Thank you for getting in touch about selling your property. We have received your enquiry and our team will be in touch with you shortly."
    : kind === "landlord" ? "Thank you for getting in touch about letting your property. We have received your enquiry and our team will be in touch with you shortly."
    : "Thank you for your property enquiry. We have received it and our team will be in touch with you shortly.";
}

export function buildLeadAcknowledgementEmailHtml(input: LeadAcknowledgementContentInput) {
  const copy = enquiryCopy(input.enquiryKind);
  const isTenant = input.enquiryKind === "rental";
  const isBuyer = input.enquiryKind === "sale";
  const primary = normalizeColor(input.organisationBrandPrimaryColor, "#07152f");
  const accent = normalizeColor(input.organisationBrandSecondaryColor, "#b48a42");
  const organisationName = cleanText(input.organisationName) || "Arch9";
  const recipientFirstName = cleanText(input.recipientName).split(/\s+/)[0] || "there";
  const agentName = cleanText(input.agentName) || `${organisationName} team`;
  const agentFirstName = cleanText(input.agentFirstName) || agentName.split(/\s+/)[0] || "the agent";
  const agentJobTitle = cleanText(input.agentJobTitle) || "Property Practitioner";
  const agentBio = limitText(
    input.agentBio ||
      (input.agentName ? (input.enquiryKind === "sale" ? `Meet ${agentName} from ${organisationName}. Ask about the property, talk through your wish list, or let us know where you need a hand.` : `${agentName} is a property practitioner at ${organisationName} and will assist you with your enquiry.`) : `Our team will help with your enquiry and connect you with the right property practitioner.`),
    250,
  );
  const message = limitText(input.originalMessage, 500);
  const receivedAt = formatDateTime(input.enquiryReceivedAt, input.timezone);
  const nextText = responseText(input.responseExpectation, input.customResponseText, agentFirstName);
  const phoneHref = telHref(input.agentPhone);
  const emailHref = cleanText(input.agentEmail) ? `mailto:${cleanText(input.agentEmail)}` : "";
  const viewingHref = cleanText(input.viewingAvailabilityUrl) || (isBuyer ? "" : emailHref);

  const headerBrand = input.organisationLogoUrl
    ? `<img src="${escapeHtml(input.organisationLogoUrl)}" alt="${escapeHtml(organisationName)}" width="190" style="display:block;max-width:190px;width:100%;height:auto;margin:0 auto;border:0;" />`
    : `<div style="font-size:24px;line-height:1.15;font-weight:800;letter-spacing:1px;color:#ffffff;">${escapeHtml(organisationName)}</div>`;
  const agentAvatar = input.agentAvatarUrl
    ? `<img src="${escapeHtml(input.agentAvatarUrl)}" alt="${escapeHtml(agentName)}" width="104" height="104" style="display:block;width:104px;height:104px;border-radius:52px;object-fit:cover;border:0;" />`
    : `<div style="width:104px;height:104px;border-radius:52px;background:#edf1f7;color:${primary};font-size:28px;font-weight:800;line-height:104px;text-align:center;">${escapeHtml(initials(agentName))}</div>`;

  const actionRow = `            <tr>
              <td style="padding:8px 4px 22px;">
                <div style="padding:22px 24px;border:1px solid ${accent};border-radius:${isTenant ? '20px' : '12px'};background:${isTenant ? '#edf7f4' : '#fffaf1'};">
                  ${isTenant ? `<p style="margin:0 0 12px;font-size:12px;letter-spacing:2px;font-weight:800;color:${primary};">RENTAL ENQUIRY · TENANT QUALIFICATION</p><p style="margin:0 0 12px;color:${primary};font-size:13px;">01 Rental requirements &nbsp; 02 Household &nbsp; 03 Viewing times</p>` : ''}
                  <h2 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:${primary};">${escapeHtml(copy.heading)}</h2>
                  <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#111827;">${escapeHtml(copy.details)}</p>
                  ${viewingHref ? `<a href="${escapeHtml(viewingHref)}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;border-radius:7px;padding:12px 18px;font-size:14px;font-weight:700;">${isTenant && input.viewingAvailabilityUrl ? "Complete tenant qualification" : input.enquiryKind === "seller" ? "Discuss your property" : input.enquiryKind === "landlord" || !input.enquiryKind || input.enquiryKind === "general" || isTenant ? "Contact your agent" : "Tell us what you’re looking for"}</a>` : ""}
                </div>
              </td>
            </tr>`;
  const receiptRow = `            <tr>
              <td style="padding:18px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f5f7fb;border-radius:8px;">
                  <tr>
                    <td style="padding:22px 24px;">
                      <h2 style="margin:0 0 16px;font-size:18px;line-height:1.3;color:${primary};">Your enquiry details</h2>
                      ${receivedAt ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#111827;"><strong>Date of enquiry:</strong> ${escapeHtml(receivedAt)}</p>` : ""}
                      <p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#111827;"><strong>Source:</strong> ${escapeHtml(sourceLabel(input.source))}</p>
                      ${message ? `<p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#111827;"><strong>Your message:</strong><br><span style="font-style:italic;">&ldquo;${escapeHtml(message)}&rdquo;</span></p>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(buildLeadAcknowledgementSubject(input.enquiryKind))}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">We have received your property enquiry.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#ffffff;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:660px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
            <tr>
              <td align="center" valign="middle" bgcolor="#07152f" style="padding:28px 24px;background-color:#07152f;background-image:linear-gradient(#07152f,#07152f);text-align:center;">
                ${headerBrand}
                ${input.organisationTagline ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#ffffff;">${escapeHtml(input.organisationTagline)}</p>` : ""}
              </td>
            </tr>
            ${!isBuyer ? actionRow : ""}
            <tr>
              <td style="padding:30px 4px 10px;">
                <h1 style="margin:0 0 14px;font-size:30px;line-height:1.15;color:${primary};font-weight:800;">${isBuyer ? "Your next chapter starts here" : "Thanks for your enquiry!"}</h1>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#111827;">Hi ${escapeHtml(recipientFirstName)},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#111827;">${escapeHtml(receiptIntroduction(input.enquiryKind))}</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#111827;">${escapeHtml(copy.introduction)}</p>
                <p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">${input.agentName ? (isBuyer ? escapeHtml(`${agentFirstName} will be your point of contact, from your first questions to finding a place that feels like home.`) : "Your enquiry has been sent to the property practitioner best placed to assist you.") : "Our team will connect you with the property practitioner best placed to assist you."}</p>
              </td>
            </tr>
            ${!isBuyer ? receiptRow : ""}
            <tr>
              <td style="padding:8px 4px 18px;">
                <h2 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${primary};">${input.agentName ? "Your agent" : "Your enquiry team"}</h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td width="124" style="vertical-align:top;padding:0 20px 12px 0;">${agentAvatar}</td>
                    <td style="vertical-align:top;padding:0 0 12px;">
                      <h3 style="margin:0 0 4px;font-size:21px;line-height:1.25;color:${primary};">${escapeHtml(agentName)}</h3>
                      <p style="margin:0 0 14px;font-size:15px;line-height:1.35;color:${accent};font-weight:700;">${escapeHtml(agentJobTitle)}</p>
                      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#111827;">${escapeHtml(agentBio)}</p>
                      ${input.agentPhone ? `<p style="margin:0 0 6px;font-size:15px;line-height:1.5;color:#111827;"><strong>Phone:</strong> <a href="${escapeHtml(phoneHref)}" style="color:${primary};text-decoration:none;">${escapeHtml(input.agentPhone)}</a></p>` : ""}
                      ${input.agentEmail ? `<p style="margin:0;font-size:15px;line-height:1.5;color:#111827;"><strong>Email:</strong> <a href="${escapeHtml(emailHref)}" style="color:${primary};text-decoration:none;">${escapeHtml(input.agentEmail)}</a></p>` : ""}
                    </td>
                  </tr>
                </table>
                ${!isBuyer && (emailHref || phoneHref) ? `<div style="margin-top:6px;">${emailHref ? `<a href="${escapeHtml(emailHref)}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;border-radius:6px;padding:11px 16px;font-size:14px;font-weight:700;margin:0 8px 8px 0;">Email ${escapeHtml(agentFirstName)}</a>` : ""}${phoneHref ? `<a href="${escapeHtml(phoneHref)}" style="display:inline-block;border:1px solid ${accent};color:${primary};text-decoration:none;border-radius:6px;padding:10px 15px;font-size:14px;font-weight:700;margin:0 8px 8px 0;">Call ${escapeHtml(agentFirstName)}</a>` : ""}</div>` : ""}
              </td>
            </tr>
            ${isBuyer ? actionRow + receiptRow : ""}
            <tr>
              <td style="padding:8px 4px 20px;">
                <h2 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:${primary};">What happens next?</h2>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#111827;">${escapeHtml(nextText)}</p>
                ${(input.agentEmail || input.agentPhone) ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.65;color:#111827;">If your enquiry is urgent, you are welcome to contact ${escapeHtml(agentFirstName)} directly using the details above.</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 0 0;border-top:2px solid ${accent};">
                <p style="margin:0 0 6px;font-size:14px;line-height:1.55;color:${primary};font-weight:700;">${escapeHtml(organisationName)}</p>
                <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#374151;">
                  ${[input.organisationPhone, input.organisationEmail, input.organisationWebsite].map(escapeHtml).filter(Boolean).join(" &nbsp; | &nbsp; ")}
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">This is an automated acknowledgement confirming that your enquiry has been received. Powered by Arch9.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildLeadAcknowledgementEmailText(input: LeadAcknowledgementContentInput) {
  const copy = enquiryCopy(input.enquiryKind);
  const organisationName = cleanText(input.organisationName) || "Arch9";
  const recipientFirstName = cleanText(input.recipientName).split(/\s+/)[0] || "there";
  const agentName = cleanText(input.agentName) || `${organisationName} team`;
  const agentFirstName = cleanText(input.agentFirstName) || agentName.split(/\s+/)[0] || "the agent";
  const agentBio = limitText(
    input.agentBio ||
      (input.agentName ? (input.enquiryKind === "sale" ? `Meet ${agentName} from ${organisationName}. Ask about the property, talk through your wish list, or let us know where you need a hand.` : `${agentName} is a property practitioner at ${organisationName} and will assist you with your enquiry.`) : `Our team will help with your enquiry and connect you with the right property practitioner.`),
    250,
  );
  const message = limitText(input.originalMessage, 500);
  const nextText = responseText(input.responseExpectation, input.customResponseText, agentFirstName);

  return [
    input.enquiryKind === "sale" ? "Your next chapter starts here" : "Thanks for your enquiry!",
    "",
    `Hi ${recipientFirstName},`,
    "",
    receiptIntroduction(input.enquiryKind),
    "",
    copy.introduction,
    "",
    ...(input.enquiryKind !== "sale" ? [
    copy.heading,
    copy.details,
    input.viewingAvailabilityUrl ? `${input.enquiryKind === 'rental' ? 'Complete tenant qualification' : input.enquiryKind === 'seller' ? 'Discuss your property' : 'Contact your agent'}: ${input.viewingAvailabilityUrl}` : null,
    "",
    ] : []),
    ...(input.enquiryKind !== "sale" ? [
    "Your enquiry details",
    input.enquiryReceivedAt ? `Date of enquiry: ${formatDateTime(input.enquiryReceivedAt, input.timezone)}` : null,
    `Source: ${sourceLabel(input.source)}`,
    message ? `Your message: "${message}"` : null,
    "",
    ] : []),
    input.agentName ? "Your agent" : "Your enquiry team",
    agentName,
    cleanText(input.agentJobTitle) || "Property Practitioner",
    agentBio,
    input.agentPhone ? `Phone: ${cleanText(input.agentPhone)}` : null,
    input.agentEmail ? `Email: ${cleanText(input.agentEmail)}` : null,
    "",
    ...(input.enquiryKind === "sale" ? [
    copy.heading,
    copy.details,
    input.viewingAvailabilityUrl ? `Tell us what you’re looking for: ${input.viewingAvailabilityUrl}` : null,
    "",
    ] : []),
    ...(input.enquiryKind === "sale" ? [
    "Your enquiry details",
    input.enquiryReceivedAt ? `Date of enquiry: ${formatDateTime(input.enquiryReceivedAt, input.timezone)}` : null,
    `Source: ${sourceLabel(input.source)}`,
    message ? `Your message: "${message}"` : null,
    "",
    ] : []),
    "What happens next?",
    nextText,
    "",
    `${organisationName}`,
    input.organisationPhone ? `Phone: ${cleanText(input.organisationPhone)}` : null,
    input.organisationEmail ? `Email: ${cleanText(input.organisationEmail)}` : null,
    input.organisationWebsite ? `Website: ${cleanText(input.organisationWebsite)}` : null,
    "",
    "This is an automated acknowledgement confirming that your enquiry has been received. Powered by Arch9.",
  ].filter(Boolean).join("\n");
}
