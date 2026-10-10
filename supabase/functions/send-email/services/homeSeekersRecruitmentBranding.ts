import { firstEmailLogo } from "../content/bridgeEmailLayout.ts";
import {
  type EmailBranding,
  formatEmailSender,
  normalizeEmailAddress,
  resolveAudienceEmailSender,
} from "./emailBranding.ts";

export const HOME_SEEKERS_RECRUITMENT_ORGANISATION_ID =
  "2958d402-368e-43c9-b728-0098e10505f1";
export const HOME_SEEKERS_RECRUITMENT_ACCENT = "#f25c1f";
export const HOME_SEEKERS_RECRUITMENT_LOGO =
  "https://app.arch9.co.za/brand/homeseekers/recruitment-logo-on-white.png";

export function homeSeekersRecruitmentBranding(
  branding: Partial<EmailBranding>,
): Partial<EmailBranding> {
  // Variant names describe the background, not the colour of the logo.
  // The current saved SVG is unsuitable for email. Its PNG fallback uses the
  // existing black wordmark on opaque white, preserving contrast in dark mode.
  const logo = firstEmailLogo(branding.logoLightUrl) ||
    HOME_SEEKERS_RECRUITMENT_LOGO;
  return {
    ...branding,
    organisationId: HOME_SEEKERS_RECRUITMENT_ORGANISATION_ID,
    organisationName: "Home Seekers",
    fromName: "Home Seekers",
    logoUrl: logo,
    logoLightUrl: logo,
    primaryColor: "#171717",
    secondaryColor: HOME_SEEKERS_RECRUITMENT_ACCENT,
    supportEmail: "admin@homeseekers.co.za",
    website: "https://www.homeseekers.co.za",
  };
}

export class HomeSeekersRecruitmentSenderUnavailable extends Error {
  constructor() {
    super(
      "Configure a verified Home Seekers email sender before sending recruitment emails.",
    );
  }
}

export async function resolveHomeSeekersRecruitmentSender({
  branding,
  supabase,
  sender = resolveAudienceEmailSender,
}: {
  branding: Partial<EmailBranding>;
  supabase: Parameters<typeof resolveAudienceEmailSender>[0]["supabase"];
  sender?: typeof resolveAudienceEmailSender;
}) {
  // Staff and applicant recruitment emails both originate from Home Seekers.
  // An empty platform fallback prevents an Arch9 mailbox being used when the
  // organisation has no verified, unpaused Resend identity.
  const resolved = await sender({
    audience: "client",
    branding: homeSeekersRecruitmentBranding(branding),
    supabase,
    platformSender: "",
  });
  const email = normalizeEmailAddress(resolved);
  const domain = email.split("@")[1] || "";
  if (
    domain !== "homeseekers.co.za" && !domain.endsWith(".homeseekers.co.za")
  ) {
    throw new HomeSeekersRecruitmentSenderUnavailable();
  }
  return formatEmailSender(email, "Home Seekers");
}
