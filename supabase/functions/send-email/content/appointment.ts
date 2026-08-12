import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";
import { normalizeBrandColor } from "../services/emailBranding.ts";

function pickText(value: string | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function eventTitle(eventType: string) {
  const mapping: Record<string, string> = {
    appointment_scheduled: "Appointment Requested",
    appointment_confirmed: "Appointment Accepted",
    appointment_updated: "Appointment Updated",
    appointment_cancelled: "Appointment Cancelled",
    appointment_rescheduled: "Appointment Rescheduled",
    appointment_confirmation_required: "Appointment Requested",
    appointment_reminder: "Appointment Reminder",
    appointment_documents_required: "Documents Needed Before Your Appointment",
  };
  return mapping[eventType] || "Appointment Update";
}

function isSellerParticipant(participantRole?: string) {
  return String(participantRole || "").trim().toLowerCase().includes("seller");
}

function humanizeAppointmentType(value?: string) {
  const normalized = pickText(value, "");
  if (!normalized) return "";
  if (!/[_-]/.test(normalized)) return normalized;
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function isKingstonsOrganisation(organisationName?: string) {
  return pickText(organisationName, "").toLowerCase().includes("kingstons");
}

function isKingstonsValuationThemeKey(value?: string) {
  const normalized = normalizeAppointmentTypeKey(value);
  return normalized.includes("kingstons") && normalized.includes("valuation");
}

function normalizeAppointmentTypeKey(value?: string) {
  return pickText(value, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s-]+/g, "_");
}

function isValuationAppointment(
  appointmentType?: string,
  appointmentTitle?: string,
) {
  const normalizedValues = [appointmentType, appointmentTitle]
    .map((value) => normalizeAppointmentTypeKey(value))
    .filter(Boolean);
  return normalizedValues.some((value) =>
    value === "seller_valuation" ||
    value === "valuation_appointment" ||
    value === "valuation_presentation"
  );
}

function isValuationPresentation(
  appointmentType?: string,
  _appointmentTitle?: string,
) {
  return normalizeAppointmentTypeKey(appointmentType) ===
    "valuation_presentation";
}

function isKingstonsValuationTheme({
  eventType,
  appointmentType,
  appointmentTitle,
  participantRole,
  organisationName,
  emailTheme,
  emailTemplateKey,
}: {
  eventType: string;
  appointmentType?: string;
  appointmentTitle?: string;
  participantRole?: string;
  organisationName?: string;
  emailTheme?: string;
  emailTemplateKey?: string;
}) {
  const eventSupported = [
    "appointment_scheduled",
    "appointment_confirmed",
    "appointment_confirmation_required",
  ].includes(eventType);
  const explicitKingstonsTheme = isKingstonsValuationThemeKey(emailTheme) ||
    isKingstonsValuationThemeKey(emailTemplateKey);
  const kingstonsSellerTheme = isKingstonsOrganisation(organisationName) &&
    (!participantRole || isSellerParticipant(participantRole));
  return eventSupported &&
    isValuationAppointment(appointmentType, appointmentTitle) &&
    (explicitKingstonsTheme || kingstonsSellerTheme);
}

function buildKingstonsValuationInviteCopy({
  eventType,
  participantRole,
  agentName,
  agentRole,
  agentBio,
  organisationName,
  isPresentation,
}: {
  eventType: string;
  participantRole?: string;
  agentName?: string;
  agentRole?: string;
  agentBio?: string;
  organisationName?: string;
  isPresentation?: boolean;
}) {
  const sellerRecipient = isSellerParticipant(participantRole);
  const hostSentence = buildHostSentence({
    agentName,
    agentRole,
    organisationName,
  });
  const confirmationRequired =
    eventType === "appointment_confirmation_required";
  const title = isPresentation
    ? confirmationRequired
      ? "Kingstons Valuation Presentation Request"
      : eventType === "appointment_confirmed"
      ? "Kingstons Valuation Presentation Confirmed"
      : "Kingstons Valuation Presentation"
    : confirmationRequired
    ? "Kingstons Valuation Request"
    : eventType === "appointment_confirmed"
    ? "Kingstons Valuation Confirmed"
    : "Kingstons Valuation Appointment";

  return {
    title,
    intro: isPresentation
      ? [
        confirmationRequired
          ? "We are excited to present your formal valuation and talk through the strongest next step for your property."
          : "Your valuation presentation is now in our diary, and we are looking forward to walking you through the recommendation.",
        "This meeting is where we turn the valuation into a clear listing plan: pricing, positioning, timing, and the seller pack steps needed before launch.",
        hostSentence
          ? `Your presentation will be hosted by ${hostSentence}.`
          : `Your presentation will be looked after by the Kingstons team.`,
        confirmationRequired
          ? "Please RSVP below so we can lock in the meeting and prepare the right valuation pack for you."
          : "We’ll explain the recommendation, answer your questions, and guide you into the Seller Pack stage.",
      ]
      : [
        confirmationRequired
          ? "We are so excited to valuate your property with you."
          : "We are so excited to valuate your property with you, and your appointment is now in our diary.",
        "Your Kingstons valuation is the start of a clear, practical selling plan for your property.",
        hostSentence
          ? `Your appointment will be hosted by ${hostSentence}.`
          : `Your valuation will be looked after by the Kingstons team.`,
        confirmationRequired
          ? "Please RSVP below so we can lock in the visit and prepare properly before we arrive."
          : "We’ll walk you through the visit, explain the next steps, and keep the process clear from start to finish.",
      ],
    agentSummaryTitle: "This is your agent",
    agencySummaryTitle: "This is our agency",
    howItWorks: isPresentation
      ? [
        "We present the formal valuation and show how the recommendation was reached.",
        "We talk through price strategy, likely buyer response, timing, and how to position the property well.",
        "If you are ready to proceed, we guide you into the Seller Pack stage: valuation copy, seller portal link, and signed listing documents.",
      ]
      : [
        "We arrive at the property and walk through the home with you, room by room, at a calm and practical pace.",
        "We look at the value drivers buyers care about most: condition, improvements, position, demand, and comparable sales activity.",
        "We talk through the likely buyer profile, pricing strategy, and the strongest next step if you choose to list.",
      ],
    whatToExpect: isPresentation
      ? [
        "Have any pricing questions ready so we can talk through them properly.",
        "We will explain the Seller Pack requirements and how the seller portal helps collect documents securely.",
        confirmationRequired
          ? "Use the RSVP button below to confirm this time, decline it, or request a change."
          : "If the time no longer works, reply to this email and we will help adjust the booking.",
      ]
      : [
        sellerRecipient
          ? "Please make sure access is ready and let us know about any gate codes, pets, tenants, parking, or access notes before the visit."
          : "Please make sure access is ready and let us know about any gate codes, pets, tenants, parking, or access notes before the visit.",
        "Bring any questions, recent improvements, approved plans, or notes you want us to consider.",
        confirmationRequired
          ? "Use the RSVP button below to confirm this time, decline it, or request a change."
          : "If the time no longer works, reply to this email and we will help adjust the booking.",
      ],
    ctaLabel: confirmationRequired ? "RSVP to this time" : "View appointment",
    agentBio,
  };
}

function formatKingstonsDisplayDate(value?: string) {
  const text = pickText(value, "");
  if (!text) return "To be confirmed";
  const parsed = new Date(`${text.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatKingstonsTime(value?: string) {
  const text = pickText(value, "");
  if (!text) return "To be confirmed";
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : text;
}

function stripKingstonsLocationPrice(value?: string) {
  return pickText(value, "To be confirmed")
    .replace(/\s*[—-]\s*R\s*\d[\d\s,.]*(?:\.\d{2})?\s*$/i, "")
    .replace(/\s+R\s*\d[\d\s,.]*(?:\.\d{2})?\s*$/i, "")
    .trim() || "To be confirmed";
}

function buildKingstonsDisplayTitle({
  eventType,
  isPresentation,
}: {
  eventType: string;
  isPresentation?: boolean;
}) {
  const label = isPresentation ? "Valuation Presentation" : "Valuation";
  if (eventType === "appointment_confirmed") {
    return `Kingstons ${label} Confirmed`;
  }
  if (eventType === "appointment_scheduled") {
    return `Kingstons ${label} Appointment`;
  }
  return `Kingstons ${label} Request`;
}

const KINGSTONS_DARK_HEADER_LOGO_URL =
  "https://app.arch9.co.za/brand/kingstons-logo-cover.png";

function getHeaderBrandLogoUrl(
  branding?: BridgeEmailLayoutBranding,
  organisationName?: string,
) {
  const configuredLogo = pickText(
    branding?.logoDarkUrl ||
      branding?.logoUrl ||
      branding?.logoLightUrl ||
      branding?.logoIconUrl,
    "",
  );
  if (configuredLogo) return configuredLogo;
  if (isKingstonsOrganisation(organisationName || branding?.organisationName)) {
    return KINGSTONS_DARK_HEADER_LOGO_URL;
  }
  return "";
}

function getInitials(value?: string) {
  return pickText(value, "A")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "A";
}

function renderKingstonsTimelineStep({
  title,
  body,
  primaryColor,
}: {
  title: string;
  body: string;
  primaryColor: string;
}) {
  return `<tr>
    <td width="4" valign="top" style="padding: 3px 16px 20px 0;">
      <div style="width: 3px; min-height: 46px; background: ${primaryColor}; border-radius: 999px;"></div>
    </td>
    <td valign="top" style="padding: 0 0 20px; border-bottom: 1px solid #e7e7e7;">
      <p style="margin: 0 0 5px; color: #111827; font-size: 14px; line-height: 1.35; font-weight: 700;">${
    escapeHtml(title)
  }</p>
      <p style="margin: 0; color: #394555; font-size: 14px; line-height: 1.55; font-weight: 400;">${
    escapeHtml(body)
  }</p>
    </td>
  </tr>`;
}

function buildKingstonsNextSteps(isPresentation?: boolean) {
  return isPresentation
    ? [
      {
        icon: "✓",
        title: "Confirm your presentation",
        body: "Let us know whether the proposed date and time works for you.",
      },
      {
        icon: "◇",
        title: "Review the valuation",
        body:
          "Your agent will walk you through the formal valuation and market context.",
      },
      {
        icon: "→",
        title: "Discuss the strategy",
        body:
          "We will talk through pricing, positioning, launch timing, and buyer response.",
      },
      {
        icon: "•",
        title: "Seller pack next steps",
        body:
          "Your agent will guide you through the documents and listing readiness items.",
      },
    ]
    : [
      {
        icon: "✓",
        title: "Confirm your appointment",
        body: "Let us know whether the proposed date and time works for you.",
      },
      {
        icon: "⌂",
        title: "Property valuation",
        body:
          "Your agent will meet you at the property and assess everything required.",
      },
      {
        icon: "□",
        title: "Valuation prepared",
        body:
          "Your agent reviews the property and relevant market information.",
      },
      {
        icon: "→",
        title: "Review and next steps",
        body:
          "Your agent will present the valuation and discuss what happens from here.",
      },
    ];
}

function renderKingstonsAppointmentEmail({
  eventType,
  recipientName,
  typeLabel,
  appointmentDate,
  appointmentTime,
  relatedListing,
  location,
  meetingUrl,
  notes,
  actionLink,
  rescheduleLink,
  agentName,
  agentRole,
  agentBio,
  organisationName,
  supportEmail,
  supportPhone,
  branding,
  isPresentation,
}: {
  eventType: string;
  recipientName?: string;
  typeLabel: string;
  appointmentDate?: string;
  appointmentTime?: string;
  relatedListing?: string;
  location?: string;
  meetingUrl?: string;
  notes?: string;
  actionLink?: string;
  rescheduleLink?: string;
  agentName?: string;
  agentRole?: string;
  agentBio?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  branding?: BridgeEmailLayoutBranding;
  isPresentation?: boolean;
}) {
  const primaryColor = normalizeBrandColor(branding?.primaryColor, "#052b2b");
  const goldColor = normalizeBrandColor(branding?.secondaryColor, "#d49a18");
  const logoUrl = getHeaderBrandLogoUrl(branding, organisationName);
  const safeLogo = logoUrl ? escapeHtml(logoUrl) : "";
  const displayTitle = buildKingstonsDisplayTitle({
    eventType,
    isPresentation,
  });
  const displayDate = formatKingstonsDisplayDate(appointmentDate);
  const displayTime = formatKingstonsTime(appointmentTime);
  const displayLocation = stripKingstonsLocationPrice(
    meetingUrl || location || relatedListing,
  );
  const resolvedAgentName = pickText(agentName, "Your property professional");
  const resolvedAgentRole = pickText(agentRole, "Property Practitioner");
  const resolvedOrganisationName = pickText(organisationName, "Kingstons");
  const resolvedAgentBio = pickText(
    agentBio,
    isPresentation
      ? `${resolvedAgentName} will walk you through the valuation and explain the seller pack and listing next steps.`
      : `${resolvedAgentName} will meet you at the property and guide you through the valuation and the next steps.`,
  );
  const confirmLabel = eventType === "appointment_confirmed"
    ? "View appointment"
    : isPresentation
    ? "Confirm presentation"
    : "Confirm appointment";
  const intro = isPresentation
    ? "Your valuation presentation is ready for confirmation."
    : "Your valuation appointment is ready for confirmation.";
  const preMeet = isPresentation
    ? "There is not anything you need to prepare. If you have questions about pricing, timing, or the seller pack, keep them on hand and your agent will guide you through everything."
    : "There is not anything you need to prepare. If you have any details about recent improvements or renovations, feel free to have them on hand, but your agent will guide you through everything.";
  const steps = buildKingstonsNextSteps(isPresentation);
  const notesText = pickText(notes, preMeet);
  const safeActionLink = escapeHtml(actionLink || "");
  const safeRescheduleLink = escapeHtml(rescheduleLink || actionLink || "");
  const hiddenPreheader = `${displayTitle} for ${typeLabel}`;
  const agentInitials = getInitials(resolvedAgentName);

  return `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${
    escapeHtml(hiddenPreheader)
  }</div>
  <div style="margin: 0; padding: 18px 12px 32px; background: #f5f5f3;">
    <div style="max-width: 640px; margin: 0 auto; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a;">
      <div style="border-radius: 10px 10px 0 0; overflow: hidden; background: ${primaryColor};">
        <div style="min-height: 248px; padding: 26px 34px 38px; background: radial-gradient(circle at 84% 44%, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0) 42%), linear-gradient(135deg, #001f20 0%, ${primaryColor} 54%, #031414 100%);">
          <div style="text-align: center; margin: 0 0 30px;">
            ${
    safeLogo
      ? `<img src="${safeLogo}" alt="${
        escapeHtml(resolvedOrganisationName)
      }" style="display: inline-block; max-height: 52px; max-width: 220px; width: auto; height: auto; border: 0; object-fit: contain;" />`
      : ""
  }
          </div>
          <div style="max-width: 390px;">
            <h1 style="margin: 0; color: #ffffff; font-size: 30px; line-height: 1.16; font-weight: 750; letter-spacing: 0;">${
    escapeHtml(displayTitle)
  }</h1>
            <div style="width: 68px; height: 3px; background: ${goldColor}; margin: 22px 0 20px;"></div>
            <p style="margin: 0 0 8px; color: #ffffff; font-size: 16px; line-height: 1.4; font-weight: 650;">Hi ${
    escapeHtml(pickText(recipientName, "there"))
  },</p>
            <p style="margin: 0; color: rgba(255,255,255,0.92); font-size: 15px; line-height: 1.6; font-weight: 400;">${
    escapeHtml(intro)
  }</p>
          </div>
        </div>
      </div>

      <div style="background: #ffffff; padding: 0 28px 28px;">
        <div style="margin: -34px 0 22px; padding: 28px 30px 26px; background: #ffffff; border: 1px solid #e9e2d8; border-radius: 14px; box-shadow: 0 18px 38px rgba(15, 23, 42, 0.12);">
          <div style="padding: 0 0 20px; border-bottom: 1px solid #ece7df;">
            <p style="margin: 0 0 8px; color: #657180; font-size: 11px; line-height: 1.2; font-weight: 750; letter-spacing: 0.10em; text-transform: uppercase;">Your appointment</p>
            <p style="margin: 0; color: #070b16; font-size: 21px; line-height: 1.28; font-weight: 650; letter-spacing: 0;">${
    escapeHtml(displayDate)
  }</p>
          </div>
          <div style="padding: 20px 0; border-bottom: 1px solid #ece7df;">
            <p style="margin: 0 0 6px; color: #657180; font-size: 11px; line-height: 1.2; font-weight: 750; letter-spacing: 0.10em; text-transform: uppercase;">Time</p>
            <p style="margin: 0; color: #070b16; font-size: 20px; line-height: 1.25; font-weight: 650; letter-spacing: 0;">${
    escapeHtml(displayTime)
  }</p>
          </div>
          <div style="padding: 20px 0 2px;">
            <p style="margin: 0 0 6px; color: #657180; font-size: 11px; line-height: 1.2; font-weight: 750; letter-spacing: 0.10em; text-transform: uppercase;">Property</p>
            <p style="margin: 0 0 16px; color: #070b16; font-size: 18px; line-height: 1.38; font-weight: 650; letter-spacing: 0;">${
    escapeHtml(displayLocation)
  }</p>
            <span style="display: inline-block; padding: 7px 12px; border-radius: 999px; background: #eef0ee; color: #2f3741; font-size: 12px; line-height: 1.2; font-weight: 650;">${
    escapeHtml(typeLabel)
  }</span>
          </div>
          ${
    actionLink
      ? `<a href="${safeActionLink}" style="display: block; margin: 22px 0 16px; padding: 16px 24px; border-radius: 8px; background: linear-gradient(135deg, ${goldColor} 0%, #e2a821 50%, #c9840f 100%); color: #ffffff; font-size: 18px; line-height: 1.2; font-weight: 750; text-align: center; text-decoration: none;">${
        escapeHtml(confirmLabel)
      }</a>`
      : ""
  }
          ${
    rescheduleLink || actionLink
      ? `<p style="margin: 0; text-align: center;"><a href="${safeRescheduleLink}" style="color: #161616; font-size: 14px; line-height: 1.4; font-weight: 650; text-decoration: underline;">Request another time</a></p>`
      : ""
  }
        </div>

        <div style="margin: 0 0 18px; padding: 26px 30px; background: linear-gradient(90deg, #f4f8f5 0%, #eef5f2 100%); border: 1px solid #eef1ec; border-radius: 12px; text-align: center;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td valign="top" style="padding: 0;">
                <p style="margin: 0 0 10px; color: #00614f; font-size: 12px; line-height: 1.3; font-weight: 750; text-transform: uppercase; letter-spacing: 0.08em;">Your property professional</p>
                <div style="width: 92px; height: 92px; border-radius: 50%; background: ${primaryColor}; color: #ffffff; font-size: 26px; line-height: 92px; text-align: center; font-weight: 750; margin: 0 auto 16px;">${
    escapeHtml(agentInitials)
  }</div>
                <p style="margin: 0 0 6px; color: #050812; font-size: 23px; line-height: 1.16; font-weight: 750;">${
    escapeHtml(resolvedAgentName)
  }</p>
                <p style="margin: 0 0 14px; color: #394555; font-size: 14px; line-height: 1.45;">${
    escapeHtml(resolvedAgentRole)
  } <span style="color: #9aa2ad; padding: 0 8px;">|</span> ${
    escapeHtml(resolvedOrganisationName)
  }</p>
                <p style="margin: 0 auto; max-width: 360px; color: #263241; font-size: 14px; line-height: 1.6; font-weight: 400;">${
    escapeHtml(resolvedAgentBio)
  }</p>
              </td>
            </tr>
          </table>
        </div>

        <div style="margin: 0 0 18px; padding: 24px 28px 8px; background: #ffffff; border-radius: 12px; border: 1px solid #f0f0ef;">
          <p style="margin: 0 0 22px; color: #005e4e; font-size: 15px; line-height: 1.2; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase;">What happens next</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            ${
    steps.map((step) =>
      renderKingstonsTimelineStep({
        title: step.title,
        body: step.body,
        primaryColor: goldColor,
      })
    ).join("")
  }
          </table>
        </div>

        <div style="margin: 0 0 12px; padding: 22px 24px; background: linear-gradient(90deg, #fff9ef 0%, #fbf0dc 100%); border-radius: 12px; border: 1px solid #f4e4c5;">
          <p style="margin: 0 0 8px; color: ${goldColor}; font-size: 15px; line-height: 1.2; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">Before we meet</p>
          <p style="margin: 0; color: #141922; font-size: 14px; line-height: 1.58;">${
    escapeHtml(notesText)
  }</p>
        </div>

        <div style="margin: 0 0 22px; padding: 18px 22px; background: #eef5f2; border-radius: 12px;">
          <p style="margin: 0 0 4px; color: #0a121d; font-size: 16px; line-height: 1.25; font-weight: 800;">Need help?</p>
          <p style="margin: 0; color: #182333; font-size: 14px; line-height: 1.5;">Simply reply to this email and ${
    escapeHtml(resolvedAgentName)
  } will be able to assist.</p>
        </div>

        <div style="border-top: 1px solid #cfd4d9; padding: 18px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td valign="top" style="padding-right: 18px;">
                <p style="margin: 0 0 4px; color: #111827; font-size: 13px; line-height: 1.3; font-weight: 900;">Your information is secure</p>
                <p style="margin: 0; color: #263241; font-size: 12px; line-height: 1.45;">Arch9 securely manages your appointment information on behalf of ${
    escapeHtml(resolvedOrganisationName)
  }.</p>
                ${
    supportEmail || supportPhone
      ? `<p style="margin: 10px 0 0; color: #4b5563; font-size: 12px; line-height: 1.45;">${
        escapeHtml([supportEmail, supportPhone].filter(Boolean).join(" - "))
      }</p>`
      : ""
  }
              </td>
              <td width="116" valign="top" align="right">
                <p style="margin: 0 0 4px; color: #4b5563; font-size: 12px; line-height: 1.2;">Powered by</p>
                <p style="margin: 0; color: #111827; font-size: 18px; line-height: 1; font-weight: 900; letter-spacing: 0.02em;">ARCH9</p>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

function buildHostSentence({
  agentName,
  agentRole,
  organisationName,
}: {
  agentName?: string;
  agentRole?: string;
  organisationName?: string;
}) {
  const name = pickText(agentName, "");
  if (!name) return "";
  const role = pickText(agentRole, "");
  const organisation = pickText(organisationName, "");
  const roleFragment = role ? `, ${role}` : "";
  const orgFragment = organisation ? ` at ${organisation}` : "";
  return `${name}${roleFragment}${orgFragment}`;
}

function buildWhatToExpect({
  eventType,
  participantRole,
  location,
  attachCalendarInvite,
}: {
  eventType: string;
  participantRole?: string;
  location?: string;
  attachCalendarInvite?: boolean;
}) {
  const seller = isSellerParticipant(participantRole);
  const bullets = [
    seller
      ? "We’ll walk through the property, talk through the valuation, and explain the next steps in the selling process."
      : "We’ll confirm the details, guide you through the appointment, and answer any questions on the day.",
    attachCalendarInvite !== false
      ? "A calendar invite is attached so the appointment can drop straight into your diary."
      : "You can add the appointment to your calendar from the details below.",
    location
      ? "Please use the location below on the day, or reply to this email if anything needs to change."
      : "Please reply to this email if anything needs to change before the appointment.",
  ];

  if (eventType === "appointment_confirmation_required") {
    bullets.unshift(
      "This appointment is waiting on your confirmation, so please review the details and respond as soon as you can.",
    );
  } else if (eventType === "appointment_rescheduled") {
    bullets.unshift(
      "The appointment time has changed, so please review the updated details below.",
    );
  } else if (eventType === "appointment_cancelled") {
    bullets.unshift(
      "This appointment has been cancelled. We’ve kept the details here in case you need to refer back to them.",
    );
  } else {
    bullets.unshift(
      "Please review the appointment details below so you know exactly what to expect.",
    );
  }

  return bullets.filter(Boolean);
}

export function buildAppointmentSubject(
  eventType: string,
  appointmentType = "Appointment",
  options: {
    participantRole?: string;
    appointmentTitle?: string;
    organisationName?: string;
    emailTheme?: string;
    emailTemplateKey?: string;
  } = {},
) {
  const title = eventTitle(eventType);
  const typeLabel = pickText(
    options.appointmentTitle || humanizeAppointmentType(appointmentType),
    "Appointment",
  );
  const participantRole = String(options.participantRole || "").trim()
    .toLowerCase();
  const explicitKingstonsValuation =
    isKingstonsValuationThemeKey(options.emailTheme) ||
    isKingstonsValuationThemeKey(options.emailTemplateKey);
  if (
    isValuationAppointment(appointmentType, options.appointmentTitle) &&
    (explicitKingstonsValuation ||
      (participantRole.includes("seller") &&
        isKingstonsOrganisation(options.organisationName)))
  ) {
    const presentation = isValuationPresentation(
      appointmentType,
      options.appointmentTitle,
    );
    if (presentation && eventType === "appointment_confirmation_required") {
      return `Kingstons valuation presentation request: ${typeLabel}`;
    }
    if (presentation && eventType === "appointment_confirmed") {
      return `Kingstons valuation presentation confirmed: ${typeLabel}`;
    }
    if (presentation && eventType === "appointment_scheduled") {
      return `Kingstons valuation presentation: ${typeLabel}`;
    }
    if (eventType === "appointment_confirmation_required") {
      return `Kingstons valuation request: ${typeLabel}`;
    }
    if (eventType === "appointment_confirmed") {
      return `Kingstons valuation confirmed: ${typeLabel}`;
    }
    if (eventType === "appointment_scheduled") {
      return `Kingstons valuation appointment: ${typeLabel}`;
    }
  }
  if (
    participantRole.includes("seller") && eventType === "appointment_scheduled"
  ) {
    return `Seller valuation appointment: ${typeLabel}`;
  }
  if (
    participantRole.includes("seller") && eventType === "appointment_confirmed"
  ) {
    return `Seller valuation confirmed: ${typeLabel}`;
  }
  if (eventType === "appointment_confirmation_required") {
    return `${title}: ${typeLabel}`;
  }
  return `${title}: ${typeLabel}`;
}

export function buildAppointmentEmailHtml({
  eventType,
  recipientName,
  appointmentType,
  appointmentTitle,
  appointmentDate,
  appointmentTime,
  relatedListing,
  location,
  status,
  notes,
  actionLink,
  acceptLink,
  declineLink,
  rescheduleLink,
  meetingUrl,
  participantRole,
  agentName,
  agentRole,
  agentBio,
  organisationName,
  supportEmail,
  supportPhone,
  attachCalendarInvite,
  branding,
  emailTheme,
  emailTemplateKey,
}: {
  eventType: string;
  recipientName?: string;
  appointmentType?: string;
  appointmentTitle?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  relatedListing?: string;
  location?: string;
  status?: string;
  notes?: string;
  actionLink?: string;
  acceptLink?: string;
  declineLink?: string;
  rescheduleLink?: string;
  meetingUrl?: string;
  participantRole?: string;
  agentName?: string;
  agentRole?: string;
  agentBio?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  attachCalendarInvite?: boolean;
  branding?: BridgeEmailLayoutBranding;
  emailTheme?: string;
  emailTemplateKey?: string;
}) {
  const typeLabel = pickText(
    appointmentTitle,
    humanizeAppointmentType(appointmentType) || "Appointment",
  );
  const primaryColor = normalizeBrandColor(branding?.primaryColor, "#214f75");
  const resolvedOrganisationName = pickText(
    organisationName || branding?.organisationName,
    "Arch9",
  );
  const resolvedAgentName = pickText(agentName, "");
  const resolvedAgentRole = pickText(agentRole, "");
  const resolvedAgentBio = pickText(agentBio, "");
  const hostSentence = buildHostSentence({
    agentName: resolvedAgentName,
    agentRole: resolvedAgentRole,
    organisationName: resolvedOrganisationName,
  });
  const sellerRecipient = isSellerParticipant(participantRole);
  const isKingstonsValuationPresentation = isValuationPresentation(
    appointmentType,
    appointmentTitle,
  );
  const isKingstonsValuationInvite = isKingstonsValuationTheme({
    eventType,
    appointmentType,
    appointmentTitle,
    participantRole,
    organisationName: resolvedOrganisationName,
    emailTheme,
    emailTemplateKey,
  });
  const safeAcceptLink = escapeHtml(acceptLink || "");
  const safeDeclineLink = escapeHtml(declineLink || "");
  const safeRescheduleLink = escapeHtml(rescheduleLink || "");

  if (isKingstonsValuationInvite) {
    return renderKingstonsAppointmentEmail({
      eventType,
      recipientName,
      typeLabel,
      appointmentDate,
      appointmentTime,
      relatedListing,
      location,
      meetingUrl,
      notes,
      actionLink,
      rescheduleLink,
      agentName: resolvedAgentName,
      agentRole: resolvedAgentRole,
      agentBio: resolvedAgentBio,
      organisationName: resolvedOrganisationName,
      supportEmail,
      supportPhone,
      branding,
      isPresentation: isKingstonsValuationPresentation,
    });
  }

  const intro = {
    appointment_scheduled: [
      sellerRecipient
        ? `Your valuation appointment has been scheduled.`
        : `A ${typeLabel.toLowerCase()} has been requested.`,
      hostSentence
        ? `You’ll be met by ${hostSentence}.`
        : `Your ${resolvedOrganisationName} team will host the appointment.`,
      sellerRecipient
        ? "We’ll walk through the property, explain the valuation process, and make sure you know what comes next."
        : "Please review the proposed time, or request an alternative if it does not work for you.",
    ],
    appointment_confirmed: [
      sellerRecipient
        ? `Your valuation appointment is confirmed.`
        : `Your ${typeLabel.toLowerCase()} has been accepted and it's on.`,
      hostSentence
        ? `You’ll be met by ${hostSentence}.`
        : `Your ${resolvedOrganisationName} team will be there to guide you.`,
    ],
    appointment_updated: [
      `Your ${typeLabel.toLowerCase()} details were updated.`,
      hostSentence ? `You’ll still be looked after by ${hostSentence}.` : "",
    ],
    appointment_cancelled: [
      `Your ${typeLabel.toLowerCase()} has been cancelled.`,
    ],
    appointment_rescheduled: [
      `Your ${typeLabel.toLowerCase()} has been rescheduled.`,
      hostSentence ? `You’ll still be looked after by ${hostSentence}.` : "",
    ],
    appointment_confirmation_required: [
      sellerRecipient
        ? `Your valuation appointment needs your confirmation.`
        : `A ${typeLabel.toLowerCase()} has been requested.`,
      hostSentence
        ? `You’ll be met by ${hostSentence}.`
        : `Your ${resolvedOrganisationName} team will host the appointment.`,
      "Please accept the proposed time, or request an alternative if it does not work for you. The appointment is only confirmed once the final time is approved.",
    ],
    appointment_reminder: [
      `This is a reminder about your upcoming ${typeLabel.toLowerCase()}.`,
    ],
    appointment_documents_required: [
      "Please upload the required documents before your appointment.",
    ],
  }[eventType] || ["Your appointment has an update."];

  const contentHtml = [
    renderBridgeIntroParagraphs(intro),
    `<div style="margin: 18px 0; padding: 16px 18px; border: 1px solid #dbe6f2; border-left: 4px solid ${primaryColor}; border-radius: 14px; background: linear-gradient(180deg, #f8fbff 0%, #eef5fb 100%);">
      <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What to expect</p>
      ${
      renderBridgeBullets(
        buildWhatToExpect({
          eventType,
          participantRole,
          location: meetingUrl || location,
          attachCalendarInvite,
        }),
      )
    }
    </div>`,
    renderBridgeSummaryCard(
      [
        { label: "Appointment", value: typeLabel },
        { label: "Date", value: pickText(appointmentDate, "TBC") },
        { label: "Time", value: pickText(appointmentTime, "TBC") },
        ...(relatedListing
          ? [{ label: "Listing / Property", value: relatedListing }]
          : []),
        {
          label: "Location",
          value: pickText(meetingUrl || location, "To be confirmed"),
        },
        { label: "Status", value: pickText(status, "Pending") },
        attachCalendarInvite !== false
          ? { label: "Calendar invite", value: "Attached" }
          : { label: "Calendar invite", value: "Not attached" },
      ],
      "Appointment Details",
    ),
    renderBridgeSummaryCard(
      [
        { label: "Agent", value: pickText(resolvedAgentName, "Your agent") },
        { label: "Agency", value: resolvedOrganisationName },
        ...(resolvedAgentRole
          ? [{ label: "Role", value: resolvedAgentRole }]
          : []),
        ...(resolvedAgentBio
          ? [{ label: "About your agent", value: resolvedAgentBio }]
          : []),
      ],
      "Your Host",
    ),
    notes
      ? `<div style="margin: 16px 0 8px; padding: 16px 18px; border: 1px solid #e2eaf4; border-radius: 14px; background: #ffffff;">
        <p style="margin: 0 0 8px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Notes</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #35506d;">${
        escapeHtml(notes)
      }</p>
      </div>`
      : "",
    acceptLink || declineLink || rescheduleLink
      ? `<div style="margin: 18px 0 16px;">
          <p style="margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: #5d728a;">Please let us know whether the proposed appointment time works for you.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${
        acceptLink
          ? `<a href="${safeAcceptLink}" style="display: inline-block; border-radius: 999px; background: ${primaryColor}; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 10px 16px;">Accept</a>`
          : ""
      }
            ${
        declineLink
          ? `<a href="${safeDeclineLink}" style="display: inline-block; border-radius: 999px; background: #ffffff; border: 1px solid #dce6f1; color: ${primaryColor}; font-size: 13px; font-weight: 700; text-decoration: none; padding: 9px 15px;">Decline</a>`
          : ""
      }
            ${
        rescheduleLink
          ? `<a href="${safeRescheduleLink}" style="display: inline-block; border-radius: 999px; background: #f7fafc; border: 1px solid #dce6f1; color: #35506d; font-size: 13px; font-weight: 700; text-decoration: none; padding: 9px 15px;">Request Reschedule</a>`
          : ""
      }
          </div>
        </div>`
      : "",
    actionLink
      ? renderBridgeCta("View Appointment", actionLink, { primaryColor })
      : "",
  ].join("");

  return renderBridgeEmailLayout({
    preheader: `${eventTitle(eventType)} for ${typeLabel}`,
    title: eventTitle(eventType),
    greeting: `Hi ${pickText(recipientName, "there")},`,
    contentHtml,
    helpBody: `Need help? Reply to this email and your ${
      organisationName || "Arch9"
    } team will assist you.`,
    organisationName: organisationName || "Arch9",
    supportEmail: supportEmail || "",
    supportPhone: supportPhone || "",
    branding,
  });
}

export function buildAppointmentEmailText({
  eventType,
  recipientName,
  appointmentType,
  appointmentTitle,
  appointmentDate,
  appointmentTime,
  relatedListing,
  location,
  status,
  notes,
  actionLink,
  acceptLink,
  declineLink,
  rescheduleLink,
  meetingUrl,
  participantRole,
  agentName,
  agentRole,
  agentBio,
  organisationName,
  supportEmail,
  supportPhone,
  attachCalendarInvite,
  emailTheme,
  emailTemplateKey,
}: {
  eventType: string;
  recipientName?: string;
  appointmentType?: string;
  appointmentTitle?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  relatedListing?: string;
  location?: string;
  status?: string;
  notes?: string;
  actionLink?: string;
  acceptLink?: string;
  declineLink?: string;
  rescheduleLink?: string;
  meetingUrl?: string;
  participantRole?: string;
  agentName?: string;
  agentRole?: string;
  agentBio?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  attachCalendarInvite?: boolean;
  emailTheme?: string;
  emailTemplateKey?: string;
}) {
  const typeLabel = pickText(
    appointmentTitle,
    humanizeAppointmentType(appointmentType) || "Appointment",
  );
  const supportLine = [supportEmail, supportPhone].filter(Boolean).join(" | ");
  const resolvedOrganisationName = organisationName || "Arch9";
  const hostSentence = buildHostSentence({
    agentName,
    agentRole,
    organisationName: resolvedOrganisationName,
  });
  const sellerRecipient = isSellerParticipant(participantRole);
  const isKingstonsValuationPresentation = isValuationPresentation(
    appointmentType,
    appointmentTitle,
  );
  const isKingstonsValuationInvite = isKingstonsValuationTheme({
    eventType,
    appointmentType,
    appointmentTitle,
    participantRole,
    organisationName: resolvedOrganisationName,
    emailTheme,
    emailTemplateKey,
  });

  if (isKingstonsValuationInvite) {
    const kingstons = buildKingstonsValuationInviteCopy({
      eventType,
      participantRole,
      agentName,
      agentRole,
      agentBio,
      organisationName: resolvedOrganisationName,
      isPresentation: isKingstonsValuationPresentation,
    });

    return [
      `Hi ${pickText(recipientName, "there")},`,
      "",
      kingstons.title,
      "",
      "Introduction",
      ...kingstons.intro,
      "",
      kingstons.agentSummaryTitle,
      `Agent: ${pickText(agentName, "Your agent")}`,
      agentRole ? `Role: ${agentRole}` : null,
      agentBio ? `About your agent: ${agentBio}` : null,
      "",
      kingstons.agencySummaryTitle,
      `Agency: ${resolvedOrganisationName}`,
      supportEmail ? `Email: ${supportEmail}` : null,
      supportPhone ? `Phone: ${supportPhone}` : null,
      "",
      "This is what to expect",
      ...kingstons.howItWorks.map((step, index) => `${index + 1}. ${step}`),
      "",
      "Before we arrive",
      ...kingstons.whatToExpect.map((item) => `- ${item}`),
      notes ? `Notes: ${notes}` : null,
      "",
      "Appointment details",
      `Appointment: ${typeLabel}`,
      `Date: ${appointmentDate ? appointmentDate : "TBC"}`,
      `Time: ${appointmentTime ? appointmentTime : "TBC"}`,
      relatedListing ? `Property: ${relatedListing}` : null,
      `Location: ${meetingUrl || location || "To be confirmed"}`,
      `Status: ${status || "Pending"}`,
      attachCalendarInvite !== false
        ? "Calendar invite: Attached"
        : "Calendar invite: Not attached",
      actionLink ? `${kingstons.ctaLabel}: ${actionLink}` : null,
      acceptLink ? `Accept: ${acceptLink}` : null,
      declineLink ? `Decline: ${declineLink}` : null,
      rescheduleLink ? `Request reschedule: ${rescheduleLink}` : null,
      "",
      supportLine ? `Support: ${supportLine}` : null,
      `Need help? Reply to this email and your ${resolvedOrganisationName} team will assist you.`,
      "",
      resolvedOrganisationName,
      "Powered by Arch9",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Hi ${pickText(recipientName, "there")},`,
    "",
    `${eventTitle(eventType)}: ${typeLabel}`,
    sellerRecipient ? "This is your seller valuation appointment." : null,
    appointmentDate ? `Date: ${appointmentDate}` : null,
    appointmentTime ? `Time: ${appointmentTime}` : null,
    relatedListing ? `Listing / Property: ${relatedListing}` : null,
    meetingUrl || location ? `Location: ${meetingUrl || location}` : null,
    status ? `Status: ${status}` : null,
    hostSentence ? `Host: ${hostSentence}` : null,
    agentBio ? `About your agent: ${agentBio}` : null,
    attachCalendarInvite !== false
      ? "Calendar invite: Attached"
      : "Calendar invite: Not attached",
    notes ? `Notes: ${notes}` : null,
    acceptLink ? `Accept: ${acceptLink}` : null,
    declineLink ? `Decline: ${declineLink}` : null,
    rescheduleLink ? `Request reschedule: ${rescheduleLink}` : null,
    actionLink ? `View appointment: ${actionLink}` : null,
    "",
    supportLine ? `Support: ${supportLine}` : null,
    `Need help? Reply to this email and your ${resolvedOrganisationName} team will assist you.`,
    "",
    resolvedOrganisationName,
    "Powered by Arch9",
  ]
    .filter(Boolean)
    .join("\n");
}
