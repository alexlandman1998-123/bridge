import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "./bridgeEmailLayout.ts";
import type { EmailBranding } from "../services/emailBranding.ts";
import { homeSeekersRecruitmentBranding } from "../services/homeSeekersRecruitmentBranding.ts";

export function buildHomeSeekersRecruitmentCodeEmail(
  code: string,
  firstName: string,
  branding: Partial<EmailBranding>,
) {
  if (!/^(?:\d{6}|\d{8})$/.test(code)) {
    throw new Error("Invalid verification code");
  }
  const instructions =
    "Return to the Home Seekers form you already have open and enter this code to continue your saved application.";
  const expiry =
    "This code can only be used once and expires automatically. Use the code from your latest email. If it no longer works, request a new code in the same form. Your saved enquiry stays safe.";
  const subject = "Your Home Seekers verification code";
  return {
    subject,
    html: renderBridgeEmailLayout({
      title: "Verify your email",
      preheader: "Enter your code in the Home Seekers application form.",
      greeting: firstName ? `Hi ${firstName},` : "Hello,",
      organisationName: "Home Seekers",
      branding: homeSeekersRecruitmentBranding(branding),
      contentHtml: renderBridgeIntroParagraphs([instructions]) +
        `<p style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;padding:20px;background:#fff1e8;color:#171717">${code}</p>` +
        renderBridgeIntroParagraphs([expiry]),
      securityTitle: "Keep your code private",
      securityBody:
        "Do not share this code. If you did not request it, you can ignore this email.",
      helpBody:
        "Need another code? Request it from the Home Seekers form. You do not need to start again.",
      footerText: "Home Seekers · Recruitment",
    }),
    text:
      `${subject}\n\n${instructions}\n\n${code}\n\n${expiry}\n\nDo not share this code. If you did not request it, ignore this email.`,
  };
}
