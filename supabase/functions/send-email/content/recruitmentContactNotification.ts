import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";
import type { EmailBranding } from "../services/emailBranding.ts";
import {
  HOME_SEEKERS_RECRUITMENT_ACCENT,
  homeSeekersRecruitmentBranding,
} from "../services/homeSeekersRecruitmentBranding.ts";

export function buildRecruitmentContactNotification(
  leadId: string,
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    name?: string;
    contractVersion?: number;
    contractFilename?: string;
  },
  branding: Partial<EmailBranding>,
  eventKind = "lead_received",
) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(leadId)) {
    throw new Error("Saved lead required");
  }
  if (
    !["lead_received", "application_received", "documents_received", "contract_returned"].includes(
      eventKind,
    )
  ) throw new Error("Saved recruitment event required");
  const name =
    (contact.name || `${contact.firstName || ""} ${contact.lastName || ""}`)
      .replace(/\p{Cc}/gu, " ").trim().slice(0, 160);
  const returned = eventKind === "contract_returned";
  const subject = returned ? `Home Seekers: ${name} has returned their signed contract` : eventKind === "application_received"
    ? "Home Seekers: New Application Received"
    : eventKind === "documents_received"
    ? `Home Seekers: ${name} has uploaded their documents`
    : "Home Seekers: New Lead Received";
  const title = returned ? "Signed contract returned" : eventKind === "application_received"
    ? "New application received"
    : eventKind === "documents_received"
    ? "Documents ready for review"
    : "New recruitment lead";
  const action = returned ? "Review signed contract" : eventKind === "lead_received"
    ? "Open recruitment lead"
    : "Open application";
  const url = `https://app.arch9.co.za/agency/recruitment/${leadId}`;
  const details = [
    `Name: ${name}`,
    `Email: ${contact.email}`,
    `Phone: ${contact.phone}`,
    returned
      ? `The applicant has uploaded their signed contract${contact.contractVersion ? ` (version ${contact.contractVersion})` : ""} through My Profile. Open the application to download the private PDF and verify all pages and signatures. This upload does not yet confirm the contract as signed.`
      : eventKind === "lead_received"
      ? "Their contact details were saved from the first Join Us screen. This notification does not mean the full application was submitted. Open the saved lead for their current progress and contact them to help them continue."
      : eventKind === "application_received"
      ? "Their entire Join Us application has been completed, verified and saved in the CRM. Open the application to review their information and track the requested documents."
      : "The requested document pack, including supporting FICA documents / proof of address and the FFC certificate, is complete. Open the application to review the private files and any recorded document exceptions.",
  ];
  return {
    subject,
    text: `${subject}\n\n${
      details.join("\n\n")
    }\n\nOpen the saved lead in Arch9: ${url}`,
    html: renderBridgeEmailLayout({
      title,
      preheader: `${name} — ${
        returned ? "Their signed PDF is ready for the agency to verify."
          : eventKind === "lead_received"
          ? "Contact them to help them complete their application."
          : eventKind === "application_received"
          ? "Their verified application is ready. Track the requested documents."
          : "Their requested document pack is complete and ready for review."
      }`,
      greeting: "Hello Home Seekers team,",
      organisationName: "Home Seekers",
      branding: homeSeekersRecruitmentBranding(branding),
      contentHtml: renderBridgeIntroParagraphs([details[3]]) +
        '<div style="word-break:break-word;overflow-wrap:anywhere;">' +
        renderBridgeSummaryCard([
          { label: "Name", value: name },
          { label: "Email", value: contact.email },
          { label: "Phone", value: contact.phone },
        ], "Applicant details") + "</div>" +
        renderBridgeCta(action, url, {
          primaryColor: HOME_SEEKERS_RECRUITMENT_ACCENT,
        }),
      securityBody:
        "These contact details are shared with the Home Seekers recruitment team to follow up on this enquiry.",
      helpBody:
        "Open Organisation → Recruitment in Arch9 to contact the lead and manage their application.",
      footerText: "Home Seekers · Recruitment",
    }),
  };
}
