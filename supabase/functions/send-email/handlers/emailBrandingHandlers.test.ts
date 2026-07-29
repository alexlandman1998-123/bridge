function assertIncludes(source: string, expected: string, message?: string) {
  if (!source.includes(expected)) {
    throw new Error(message || `Expected source to include ${expected}`);
  }
}

function assertNotIncludes(source: string, expected: string, message?: string) {
  if (source.includes(expected)) {
    throw new Error(message || `Expected source not to include ${expected}`);
  }
}

const brandedHandlerFiles = [
  "appointment.ts",
  "buyerOfferLink.ts",
  "buyerOfferSubmittedAgent.ts",
  "clientOnboarding.ts",
  "offerDecisionNotification.ts",
  "reservationDeposit.ts",
  "sellerOfferReview.ts",
  "sellerOnboarding.ts",
  "sellerOnboardingSubmitted.ts",
];

Deno.test({
  name:
    "converted notification handlers use the central email branding resolver",
  permissions: { read: true },
  async fn() {
    for (const fileName of brandedHandlerFiles) {
      const source = await Deno.readTextFile(
        new URL(fileName, import.meta.url),
      );
      assertIncludes(
        source,
        "resolveEmailBranding",
        `${fileName} should resolve the shared branding contract`,
      );
      assertIncludes(
        source,
        "formatEmailSender",
        `${fileName} should apply the branded sender display name`,
      );
      assertNotIncludes(
        source,
        "extractEmailBrandingFromPayload",
        `${fileName} should not bypass the resolver with payload-only branding`,
      );
      assertNotIncludes(
        source,
        "normalizeEmailBranding",
        `${fileName} should not normalize handler-local branding directly`,
      );
    }
  },
});
