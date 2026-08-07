import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
  renderBridgeCta,
  renderBridgeBullets,
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
  options: { participantRole?: string } = {},
) {
  const title = eventTitle(eventType);
  const typeLabel = pickText(appointmentType, "Appointment");
  const participantRole = String(options.participantRole || "").trim().toLowerCase();
  if (participantRole.includes("seller") && eventType === "appointment_scheduled") {
    return `Seller valuation appointment: ${typeLabel}`;
  }
  if (participantRole.includes("seller") && eventType === "appointment_confirmed") {
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
}) {
  const typeLabel = pickText(
    appointmentTitle,
    appointmentType || "Appointment",
  );
  const primaryColor = normalizeBrandColor(branding?.primaryColor, "#214f75");
  const resolvedOrganisationName = pickText(organisationName || branding?.organisationName, "Arch9");
  const resolvedAgentName = pickText(agentName, "");
  const resolvedAgentRole = pickText(agentRole, "");
  const resolvedAgentBio = pickText(agentBio, "");
  const hostSentence = buildHostSentence({
    agentName: resolvedAgentName,
    agentRole: resolvedAgentRole,
    organisationName: resolvedOrganisationName,
  });
  const sellerRecipient = isSellerParticipant(participantRole);
  const safeAcceptLink = escapeHtml(acceptLink || "");
  const safeDeclineLink = escapeHtml(declineLink || "");
  const safeRescheduleLink = escapeHtml(rescheduleLink || "");

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
      ${renderBridgeBullets(buildWhatToExpect({ eventType, participantRole, location: meetingUrl || location, attachCalendarInvite }))}
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
        ...(resolvedAgentRole ? [{ label: "Role", value: resolvedAgentRole }] : []),
        ...(resolvedAgentBio ? [{ label: "About your agent", value: resolvedAgentBio }] : []),
      ],
      "Your Host",
    ),
    notes
      ? `<div style="margin: 16px 0 8px; padding: 16px 18px; border: 1px solid #e2eaf4; border-radius: 14px; background: #ffffff;">
        <p style="margin: 0 0 8px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Notes</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #35506d;">${escapeHtml(notes)}</p>
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
}) {
  const typeLabel = pickText(
    appointmentTitle,
    appointmentType || "Appointment",
  );
  const supportLine = [supportEmail, supportPhone].filter(Boolean).join(" | ");
  const resolvedOrganisationName = organisationName || "Arch9";
  const hostSentence = buildHostSentence({
    agentName,
    agentRole,
    organisationName: resolvedOrganisationName,
  });
  const sellerRecipient = isSellerParticipant(participantRole);

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
    attachCalendarInvite !== false ? "Calendar invite: Attached" : "Calendar invite: Not attached",
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
