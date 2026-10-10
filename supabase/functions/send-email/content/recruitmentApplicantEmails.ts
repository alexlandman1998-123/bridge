import {
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "./bridgeEmailLayout.ts";
import type { EmailBranding } from "../services/emailBranding.ts";
import {
  HOME_SEEKERS_RECRUITMENT_ACCENT,
  homeSeekersRecruitmentBranding,
} from "../services/homeSeekersRecruitmentBranding.ts";

export const applicantEmailKinds = [
  "application_thanks",
  "documents_reminder",
  "documents_followup",
];
const documents = [
  {
    type: "CV",
    label: "CV",
    reason: "to understand your work experience and background",
  },
  {
    type: "Identity document",
    label: "ID or passport",
    reason: "to verify your identity for FICA and recruitment checks",
  },
  {
    type: "Qualifications",
    label: "Qualifications",
    reason: "to review your relevant training and qualifications",
  },
  {
    type: "Registration evidence",
    label: "FFC certificate",
    reason: "to check your property practitioner registration",
  },
  {
    type: "Other",
    label: "Supporting FICA documents / proof of address",
    reason: "to verify your residential address for the FICA document pack",
  },
];

export function buildRecruitmentApplicantEmail(
  kind: string,
  lead: any,
  baseUrl: string,
  branding: Partial<EmailBranding>,
) {
  if (!applicantEmailKinds.includes(kind)) {
    throw new Error("Choose a saved applicant email");
  }
  const thanks = kind === "application_thanks",
    followup = kind === "documents_followup";
  const title = thanks
    ? "Thank you for your application"
    : followup
    ? "Reminder: upload your application documents"
    : "Log in and upload your application documents";
  const subject = `Home Seekers: ${title}`;
  const heading = thanks
    ? title
    : followup
    ? "Your documents are still needed"
    : "Upload your documents";
  const paragraphs = thanks
    ? [
      "Thank you for applying to Home Seekers. We have received your completed application.",
      "Please look out for a second email with a link to log in, the documents we need and why we need them. If it does not arrive, check your spam folder or contact the Home Seekers recruitment team.",
      "Our team will review your application once the requested document pack is complete.",
    ]
    : [
      followup
        ? "Some requested documents for your Home Seekers application are still missing. Please log in and upload the remaining files so our team can review your application."
        : "Your completed Home Seekers application has been received. Please upload your supporting FICA documents and FFC certificate, along with the other documents below, so our team can review and approve your application.",
      "Log in with your application email address and the password you set when applying. If you already have an account, use your existing password. You can also choose “Use an email code instead” if you need help signing in, then open My Profile to upload your files.",
    ];
  const missing = documents.filter((doc) =>
    !Array.isArray(lead.documents_json) ||
    (!lead.documents_json.some((file: any) =>
      file?.type === doc.type && typeof file.path === "string" &&
      file.path.trim()
    ) &&
      (doc.type === "Other" ||
        String(lead.document_waivers_json?.[doc.type] || "").trim().length < 5))
  );
  const checklist = thanks
    ? []
    : (followup ? missing : documents).map((doc) =>
      `${doc.label} — ${doc.reason}.`
    );
  const notes = thanks ? [] : [
    "Upload PDF, JPG or PNG files, up to 10 MB per file. If a qualification or other requested item does not apply, contact the recruitment team so they can review and record an exception.",
    "This login gives you access to your own application and documents. Full agency access opens after activation.",
  ];
  const link = new URL("/applicant/my-profile", baseUrl).href;
  return {
    subject,
    text: `${subject}\n\nHi ${lead.name},\n\n${
      [...paragraphs, ...checklist, ...notes].join("\n\n")
    }${thanks ? "" : `\n\nLog in and upload documents: ${link}`}`,
    html: renderBridgeEmailLayout({
      title: heading,
      preheader: thanks
        ? "Application received. Your document instructions will arrive in a second email."
        : followup
        ? "Complete your remaining uploads so the Home Seekers team can review your application."
        : "Sign in to My Profile and upload the documents listed in this email.",
      greeting: `Hi ${lead.name},`,
      organisationName: "Home Seekers",
      branding: homeSeekersRecruitmentBranding(branding),
      contentHtml: renderBridgeIntroParagraphs(paragraphs) +
        (thanks ? "" : renderBridgeCta("Log in and upload documents", link, {
          primaryColor: HOME_SEEKERS_RECRUITMENT_ACCENT,
        })) +
        (thanks
          ? ""
          : `<h2 style="margin:24px 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.4;color:#171717;">${
            followup ? "Documents still needed" : "Documents to upload"
          }</h2>`) +
        renderBridgeBullets(checklist) + renderBridgeIntroParagraphs(notes),
      securityBody:
        "Your information and documents are handled securely. Only you and the authorised recruitment team can access your application documents.",
      helpBody:
        "Need help? Contact the Home Seekers recruitment team at admin@homeseekers.co.za.",
      footerText: "Home Seekers · Recruitment",
    }),
  };
}

export function buildHomeSeekersRecruitmentApprovalEmail(
  lead: { name: string },
  branding: Partial<EmailBranding>,
) {
  const title = "Your application has been approved";
  const paragraphs = [
    "Your application has been approved. We will send you the contract shortly.",
    "The Home Seekers recruitment team will guide you through the next step.",
  ];
  return {
    subject: `Home Seekers: ${title}`,
    text: `Home Seekers: ${title}\n\nHi ${lead.name},\n\n${
      paragraphs.join("\n\n")
    }\n\nNeed help? Contact admin@homeseekers.co.za.`,
    html: renderBridgeEmailLayout({
      title: "Application approved",
      preheader:
        "Your Home Seekers application is approved. Your contract will follow shortly.",
      greeting: `Hi ${lead.name},`,
      organisationName: "Home Seekers",
      branding: homeSeekersRecruitmentBranding(branding),
      contentHtml: renderBridgeIntroParagraphs(paragraphs),
      securityBody:
        "Your information and documents are handled securely. Only you and the authorised recruitment team can access your application documents.",
      helpBody:
        "Need help? Contact the Home Seekers recruitment team at admin@homeseekers.co.za.",
      footerText: "Home Seekers · Recruitment",
    }),
  };
}
