import {
  renderBridgeBrandMark,
  renderBridgeCta,
  renderBridgeEmailLayout,
} from "./bridgeEmailLayout.ts";

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

Deno.test("renderBridgeEmailLayout renders canonical branding", () => {
  const html = renderBridgeEmailLayout({
    preheader: "Preview text",
    title: "Client Onboarding",
    greeting: "Hi Buyer,",
    contentHtml: "<p>Body</p>",
    branding: {
      organisationName: "Kingstons Property",
      logoUrl: "https://cdn.example.test/kingstons.png",
      primaryColor: "#123abc",
      secondaryColor: "#fedcba",
      tagline: "Trusted property people",
      supportEmail: "support@example.test",
      supportPhone: "+27 21 000 0000",
      website: "https://kingstons.example.test",
    },
  });

  assertIncludes(html, "Preview text");
  assertIncludes(html, "https://cdn.example.test/kingstons.png");
  assertIncludes(html, "class=\"arch9-shell\"");
  assertIncludes(html, "background: #F4F4F2");
  assertIncludes(html, "background: #fedcba");
  assertIncludes(html, "Trusted property people");
  assertIncludes(html, "mailto:support@example.test");
  assertIncludes(html, "https://kingstons.example.test");
  assertIncludes(html, "Kingstons Property · Powered by Arch9");
});

Deno.test("renderBridgeEmailLayout prefers the light-background logo variant", () => {
  const html = renderBridgeEmailLayout({
    title: "Mandate Ready",
    greeting: "Hi Agent,",
    contentHtml: "<p>Body</p>",
    branding: {
      organisationName: "Kingstons Property",
      logoUrl: "https://cdn.example.test/logo-generic.png",
      logoLightUrl: "https://cdn.example.test/logo-light-background.png",
      logoDarkUrl: "https://cdn.example.test/logo-dark-header.png",
      primaryColor: "#123abc",
      secondaryColor: "#fedcba",
    },
  });

  assertIncludes(html, "https://cdn.example.test/logo-light-background.png");
  assertNotIncludes(html, "https://cdn.example.test/logo-dark-header.png");
  assertIncludes(html, "background: #FFFFFF");
});

Deno.test("renderBridgeEmailLayout uses a dark header for a dark-only logo", () => {
  const html = renderBridgeEmailLayout({
    title: "Portal Ready",
    greeting: "Hi Seller,",
    contentHtml: "<p>Body</p>",
    branding: {
      organisationName: "Harbour Homes",
      logoDarkUrl: "https://cdn.example.test/logo-for-dark-header.png",
      primaryColor: "#123456",
    },
  });

  assertIncludes(html, "https://cdn.example.test/logo-for-dark-header.png");
  assertIncludes(html, "background: #123456");
});

Deno.test("renderBridgeEmailLayout remains backward compatible with legacy props", () => {
  const html = renderBridgeEmailLayout({
    title: "Legacy Layout",
    greeting: "Hi there,",
    contentHtml: "<p>Body</p>",
    organisationName: "Legacy Organisation",
    senderOrganisationLogoUrl: "https://cdn.example.test/legacy.png",
    supportEmail: "legacy@example.test",
  });

  assertIncludes(html, "Legacy Organisation");
  assertIncludes(html, "https://cdn.example.test/legacy.png");
  assertIncludes(html, "mailto:legacy@example.test");
});

Deno.test("renderBridgeEmailLayout supports white-label footer copy", () => {
  const html = renderBridgeEmailLayout({
    title: "Mandate Ready",
    greeting: "Hi Seller,",
    contentHtml: "<p>Body</p>",
    footerText: "Kingstons Property",
    branding: {
      organisationName: "Kingstons Property",
      primaryColor: "#123456",
      secondaryColor: "#abcdef",
    },
  });

  assertIncludes(html, "Kingstons Property");
  assertNotIncludes(html, "Powered by Arch9");
});

Deno.test("renderBridgeEmailLayout falls back to organisation text when logo is missing", () => {
  const html = renderBridgeEmailLayout({
    title: "No Logo",
    greeting: "Hi there,",
    contentHtml: "<p>Body</p>",
    branding: {
      organisationName: "No Logo Realty",
      primaryColor: "#123456",
      secondaryColor: "#abcdef",
    },
  });

  assertIncludes(html, "No Logo Realty");
  assertNotIncludes(html, "<img src=");
});

Deno.test("renderBridgeEmailLayout rejects unsafe brand colors", () => {
  const html = renderBridgeEmailLayout({
    title: "Unsafe",
    greeting: "Hi there,",
    contentHtml: "<p>Body</p>",
    branding: {
      organisationName: "Unsafe Realty",
      primaryColor: "javascript:alert(1)",
      secondaryColor: "red",
    },
  });

  assertIncludes(html, "background: #b48a42");
  assertNotIncludes(html, "javascript:alert");
});

Deno.test("renderBridgeEmailLayout falls back to text for SVG logos", () => {
  const html = renderBridgeEmailLayout({
    title: "Portal Ready",
    greeting: "Hi Seller,",
    contentHtml: "<p>Body</p>",
    branding: {
      organisationName: "Harbour Homes",
      logoUrl: "https://cdn.example.test/logo.svg",
    },
  });

  assertIncludes(html, "Harbour Homes");
  assertNotIncludes(html, "<img src=");
});

Deno.test("renderBridgeCta supports branded button color and URL fallback", () => {
  const html = renderBridgeCta(
    "Open Portal",
    "https://app.example.test/portal",
    {
      primaryColor: "#456def",
    },
  );

  assertIncludes(html, "background: #456def");
  assertIncludes(html, "copy and paste this URL");
  assertIncludes(html, "https://app.example.test/portal");
});

Deno.test("renderBridgeCta keeps bright agency buttons legible", () => {
  const html = renderBridgeCta("Open Portal", "https://app.example.test/portal", {
    primaryColor: "#F5C400",
  });
  assertIncludes(html, "background: #F5C400");
  assertIncludes(html, "color: #171717");
});

Deno.test("renderBridgeBrandMark renders initials outside the dark header", () => {
  const html = renderBridgeBrandMark({
    organisationName: "Northern Homes",
    primaryColor: "#123456",
  });

  assertIncludes(html, ">NH</div>");
  assertIncludes(html, "background: #123456");
});
