import type { EmailBranding } from "../services/emailBranding.ts";

type MandateSigningRecipientRole = "agent" | "purchaser" | "seller";

export function resolveSellerMandateEmailLayoutBranding(
  branding: EmailBranding,
  recipientRole: MandateSigningRecipientRole,
): EmailBranding {
  if (!recipientRole || !branding.logoDarkUrl) return branding;
  return {
    ...branding,
    logoUrl: branding.logoDarkUrl,
    logoLightUrl: branding.logoDarkUrl,
  };
}
