import type { OnboardingSubmittedEmailPayload } from "../types.ts";

export function buildOnboardingSubmittedEmailPayload({
  buyerName,
  buyerEmail,
  developmentName,
  unitLabel,
  transactionReference = "",
  clientPortalLink,
}: {
  buyerName: string;
  buyerEmail: string;
  developmentName: string;
  unitLabel: string;
  transactionReference?: string;
  clientPortalLink: string;
}): OnboardingSubmittedEmailPayload {
  return {
    buyerName,
    buyerEmail,
    developmentName,
    unitLabel,
    transactionReference,
    clientPortalLink,
  };
}
