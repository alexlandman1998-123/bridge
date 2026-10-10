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
export const HOME_SEEKERS_RECRUITMENT_REPLY_TO = "thomas@homeseekers.co.za";
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
  platformSender = Deno.env.get("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM") || "",
}: {
  branding: Partial<EmailBranding>;
  supabase: Parameters<typeof resolveAudienceEmailSender>[0]["supabase"];
  sender?: typeof resolveAudienceEmailSender;
  platformSender?: string;
}) {
  // The explicitly configured Arch9 fallback is temporary. A verified,
  // unpaused Home Seekers identity takes precedence once DNS is ready.
  const fallbackEmail = normalizeEmailAddress(platformSender);
  const fallbackDomain = fallbackEmail.split("@")[1] || "";
  const arch9Fallback = fallbackDomain === "arch9.co.za" ||
    fallbackDomain.endsWith(".arch9.co.za");
  const resolved = await sender({
    audience: "client",
    branding: homeSeekersRecruitmentBranding(branding),
    supabase,
    platformSender: arch9Fallback ? fallbackEmail : "",
  });
  const email = normalizeEmailAddress(resolved);
  const domain = email.split("@")[1] || "";
  if (
    domain !== "homeseekers.co.za" && !domain.endsWith(".homeseekers.co.za") &&
    !(arch9Fallback && email === fallbackEmail)
  ) {
    throw new HomeSeekersRecruitmentSenderUnavailable();
  }
  return formatEmailSender(email, "Home Seekers");
}
