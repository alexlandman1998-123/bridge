import { buildLeadOperationsBrandingPayload } from "./leadOperationsBranding.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

Deno.test("buildLeadOperationsBrandingPayload forwards logo variants for lead notifications", () => {
  const branding = buildLeadOperationsBrandingPayload({
    name: "Kingstons Property",
    logo_url: "https://cdn.example.test/logo-light.png",
    logo_dark_url: "https://cdn.example.test/logo-dark.png",
    logo_light_url: "https://cdn.example.test/logo-light-alt.png",
    logo_icon_url: "https://cdn.example.test/logo-icon.png",
    brand_primary_colour: "#123abc",
    brand_secondary_colour: "#fedcba",
    support_email: "support@example.test",
    support_phone: "+27 21 000 0000",
    website: "https://kingstons.example.test",
    lead_acknowledgement_sender_name: "Kingstons Leads",
  });

  assertEquals(branding.organisationName, "Kingstons Property");
  assertEquals(
    branding.organisationLogoUrl,
    "https://cdn.example.test/logo-dark.png",
  );
  assertEquals(
    branding.organisationLogoDarkUrl,
    "https://cdn.example.test/logo-dark.png",
  );
  assertEquals(
    branding.organisationLogoLightUrl,
    "https://cdn.example.test/logo-light-alt.png",
  );
  assertEquals(
    branding.organisationLogoIconUrl,
    "https://cdn.example.test/logo-icon.png",
  );
  assertEquals(branding.organisationBrandPrimaryColor, "#123abc");
  assertEquals(branding.organisationBrandSecondaryColor, "#fedcba");
  assertEquals(branding.organisationEmail, "support@example.test");
  assertEquals(branding.organisationPhone, "+27 21 000 0000");
  assertEquals(branding.organisationWebsite, "https://kingstons.example.test");
  assertEquals(branding.fromName, "Kingstons Leads");
});

Deno.test("buildLeadOperationsBrandingPayload ignores non-https logo urls", () => {
  const branding = buildLeadOperationsBrandingPayload({
    name: "Unsafe Realty",
    logo_url: "/brand/logo.png",
    logo_dark_url: "http://cdn.example.test/logo-dark.png",
  });

  assertEquals(branding.organisationLogoUrl, undefined);
  assertEquals(branding.organisationLogoDarkUrl, undefined);
  assertEquals(branding.organisationLogoLightUrl, undefined);
});
