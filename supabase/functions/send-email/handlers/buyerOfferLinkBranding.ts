import type { EmailBranding } from "../services/emailBranding.ts";

export function resolveBuyerOfferLinkEmailLayoutBranding(
  branding: EmailBranding,
): EmailBranding {
  if (!branding.logoDarkUrl) return branding;
  return {
    ...branding,
    logoUrl: branding.logoDarkUrl,
    logoLightUrl: branding.logoDarkUrl,
  };
}
