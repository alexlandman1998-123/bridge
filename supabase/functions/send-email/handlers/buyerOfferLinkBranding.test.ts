import { renderBridgeEmailLayout } from "../content/bridgeEmailLayout.ts";
import { resolveBuyerOfferLinkEmailLayoutBranding } from "./buyerOfferLinkBranding.ts";

function assertIncludes(source: string, expected: string, message?: string) {
  if (!source.includes(expected)) {
    throw new Error(message || `Expected output to include ${expected}`);
  }
}

function assertNotIncludes(source: string, expected: string, message?: string) {
  if (source.includes(expected)) {
    throw new Error(message || `Expected output not to include ${expected}`);
  }
}

Deno.test("buyer verification link email uses the dark-header logo variant", () => {
  const branding = resolveBuyerOfferLinkEmailLayoutBranding({
    organisationName: "Kingstons Property",
    logoUrl: "https://cdn.example.test/logo-generic.png",
    logoLightUrl: "https://cdn.example.test/logo-light-background.png",
    logoDarkUrl: "https://cdn.example.test/logo-dark-header.png",
    primaryColor: "#123abc",
    secondaryColor: "#fedcba",
  });
  const html = renderBridgeEmailLayout({
    title: "Buyer Verification Ready",
    greeting: "Hi Buyer,",
    contentHtml: "<p>Body</p>",
    branding,
  });

  assertIncludes(html, "https://cdn.example.test/logo-dark-header.png");
  assertNotIncludes(html, "https://cdn.example.test/logo-light-background.png");
});
