import { renderBridgeEmailLayout } from "../content/bridgeEmailLayout.ts";
import { resolveSellerMandateEmailLayoutBranding } from "./sellerMandateBranding.ts";

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

Deno.test("agent mandate-ready email uses the dark-header logo variant", () => {
  const branding = resolveSellerMandateEmailLayoutBranding(
    {
      organisationName: "Kingstons Property",
      logoUrl: "https://cdn.example.test/logo-generic.png",
      logoLightUrl: "https://cdn.example.test/logo-light-background.png",
      logoDarkUrl: "https://cdn.example.test/logo-dark-header.png",
      primaryColor: "#123abc",
      secondaryColor: "#fedcba",
    },
    "agent",
  );
  const html = renderBridgeEmailLayout({
    title: "Mandate Ready for Agent Signature",
    greeting: "Hi Agent,",
    contentHtml: "<p>Body</p>",
    branding,
  });

  assertIncludes(html, "https://cdn.example.test/logo-dark-header.png");
  assertNotIncludes(html, "https://cdn.example.test/logo-light-background.png");
});

Deno.test("seller mandate-ready email also uses the dark-header logo variant", () => {
  const branding = resolveSellerMandateEmailLayoutBranding(
    {
      organisationName: "Kingstons Property",
      logoUrl: "https://cdn.example.test/logo-generic.png",
      logoLightUrl: "https://cdn.example.test/logo-light-background.png",
      logoDarkUrl: "https://cdn.example.test/logo-dark-header.png",
      primaryColor: "#123abc",
      secondaryColor: "#fedcba",
    },
    "seller",
  );
  const html = renderBridgeEmailLayout({
    title: "Mandate Ready",
    greeting: "Hi Seller,",
    contentHtml: "<p>Body</p>",
    branding,
  });

  assertIncludes(html, "https://cdn.example.test/logo-dark-header.png");
  assertNotIncludes(html, "https://cdn.example.test/logo-light-background.png");
});
