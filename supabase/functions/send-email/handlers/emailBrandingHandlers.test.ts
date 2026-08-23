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

function assertUsesSharedShell(source: string, fileName: string) {
  if (
    source.includes("renderBridgeEmailLayout") ||
    /build[A-Za-z]+EmailHtml/.test(source)
  ) {
    return;
  }
  throw new Error(`${fileName} should use the shared dark-header email layout`);
}

const brandedHandlerFiles = [
  "appointment.ts",
  "attorneyQuote.ts",
  "bondAttorneyLegalNotification.ts",
  "bondIntakeNotification.ts",
  "bondOriginatorBuyerIntro.ts",
  "buyerOfferLink.ts",
  "buyerOfferSubmittedAgent.ts",
  "clientSellerPortalNotification.ts",
  "clientOnboarding.ts",
  "commercialEnterpriseNotification.ts",
  "commercialAccessNotification.ts",
  "agencyOnboarding.ts",
  "commercialLandlordOnboarding.ts",
  "leadAcknowledgement.ts",
  "leadOperationsNotification.ts",
  "leadPropertyShare.ts",
  "legacyTest.ts",
  "notificationReminderDispatch.ts",
  "offerDecisionNotification.ts",
  "onboardingSubmitted.ts",
  "organisationPartnerInvitation.ts",
  "reservationDeposit.ts",
  "reservationDepositReceived.ts",
  "sellerMandateSigned.ts",
  "sellerOfferReview.ts",
  "sellerOnboarding.ts",
  "sellerOnboardingSubmitted.ts",
  "transactionPartnerInvitation.ts",
  "transactionOperationsNotification.ts",
  "transactionProgressDispatch.ts",
  "transactionRoleplayerIntro.ts",
  "weeklyDigestNotification.ts",
  "workspaceInvite.ts",
];

const sharedLayoutHandlerFiles = [
  ...brandedHandlerFiles,
  "arch9LaunchConfirmation.ts",
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

Deno.test({
  name: "notification handlers render through the shared email shell",
  permissions: { read: true },
  async fn() {
    for (const fileName of sharedLayoutHandlerFiles) {
      const source = await Deno.readTextFile(
        new URL(fileName, import.meta.url),
      );
      assertUsesSharedShell(source, fileName);
    }
  },
});

Deno.test({
  name:
    "buyer offer submitted notification hydrates agency branding from organisation id",
  permissions: { read: true },
  async fn() {
    const source = await Deno.readTextFile(
      new URL("buyerOfferSubmittedAgent.ts", import.meta.url),
    );
    assertIncludes(
      source,
      'import { createClient } from "supabase";',
      "buyer offer submitted handler should be able to load organisation branding",
    );
    assertIncludes(
      source,
      "const supabase = supabaseUrl && serviceRoleKey",
      "buyer offer submitted handler should create a service-role client when configured",
    );
    assertIncludes(
      source,
      "supabase,",
      "buyer offer submitted handler should pass the client into resolveEmailBranding",
    );
  },
});
