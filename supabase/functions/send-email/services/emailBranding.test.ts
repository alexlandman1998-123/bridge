import {
  DEFAULT_EMAIL_BRANDING,
  extractEmailBrandingFromPayload,
  formatEmailSender,
  mergeEmailBranding,
  normalizeBrandColor,
  normalizeEmailAddress,
  normalizeEmailBranding,
  resolveEmailBranding,
} from "./emailBranding.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function createMockSupabase({
  rows = {},
  errors = {},
}: {
  rows?: Record<string, unknown>;
  errors?: Record<string, unknown>;
} = {}) {
  return {
    from(tableName: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: rows[tableName] || null,
                  error: errors[tableName] || null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

Deno.test("normalizeEmailBranding provides stable Arch9 defaults", () => {
  const branding = normalizeEmailBranding();
  assertEquals(
    branding.organisationName,
    DEFAULT_EMAIL_BRANDING.organisationName,
  );
  assertEquals(branding.primaryColor, DEFAULT_EMAIL_BRANDING.primaryColor);
  assertEquals(branding.secondaryColor, DEFAULT_EMAIL_BRANDING.secondaryColor);
  assertEquals(branding.logoUrl, undefined);
});

Deno.test("normalizeEmailBranding accepts canonical and legacy payload aliases", () => {
  const branding = normalizeEmailBranding({
    organisation_id: "org-1",
    organisation_name: "Kingstons",
    logo_dark_url: "https://cdn.example.test/logo-dark.png",
    organisation_brand_primary_color: "#123abc",
    organisation_brand_secondary_color: "#fedcba",
    company_email: "hello@example.test",
    company_phone: "+27 11 000 0000",
  });

  assertEquals(branding.organisationId, "org-1");
  assertEquals(branding.organisationName, "Kingstons");
  assertEquals(branding.logoUrl, "https://cdn.example.test/logo-dark.png");
  assertEquals(branding.primaryColor, "#123abc");
  assertEquals(branding.secondaryColor, "#fedcba");
  assertEquals(branding.supportEmail, "hello@example.test");
  assertEquals(branding.supportPhone, "+27 11 000 0000");
});

Deno.test("extractEmailBrandingFromPayload reads top-level and metadata fields", () => {
  const extracted = extractEmailBrandingFromPayload({
    organisationName: "Payload Organisation",
    metadata: {
      brandPrimaryColor: "#456def",
      brandSecondaryColor: "#654321",
      organisationLogoUrl: "https://cdn.example.test/logo.png",
      supportEmail: "support@example.test",
    },
  });

  const branding = normalizeEmailBranding(extracted);
  assertEquals(branding.organisationName, "Payload Organisation");
  assertEquals(branding.logoUrl, "https://cdn.example.test/logo.png");
  assertEquals(branding.primaryColor, "#456def");
  assertEquals(branding.secondaryColor, "#654321");
  assertEquals(branding.supportEmail, "support@example.test");
});

Deno.test("normalizeBrandColor rejects unsafe values", () => {
  assertEquals(normalizeBrandColor("#abc", "#000000"), "#abc");
  assertEquals(normalizeBrandColor("#aabbcc", "#000000"), "#aabbcc");
  assertEquals(normalizeBrandColor("red", "#000000"), "#000000");
  assertEquals(
    normalizeBrandColor("javascript:alert(1)", "#000000"),
    "#000000",
  );
});

Deno.test("sender helpers preserve mailbox while applying brand display name", () => {
  assertEquals(
    normalizeEmailAddress("Arch9 <onboarding@example.test>"),
    "onboarding@example.test",
  );
  assertEquals(
    formatEmailSender("Arch9 <onboarding@example.test>", "Kingstons Property"),
    "Kingstons Property <onboarding@example.test>",
  );
});

Deno.test("mergeEmailBranding lets later non-empty values win", () => {
  const branding = mergeEmailBranding(
    {
      organisationName: "Arch9",
      primaryColor: "#111111",
      supportEmail: "ops@arch9.test",
    },
    { organisationName: "Agency", primaryColor: "", secondaryColor: "#222222" },
  );

  assertEquals(branding.organisationName, "Agency");
  assertEquals(branding.primaryColor, "#111111");
  assertEquals(branding.secondaryColor, "#222222");
  assertEquals(branding.supportEmail, "ops@arch9.test");
});

Deno.test("resolveEmailBranding merges database sources and lets payload fields win", async () => {
  const supabase = createMockSupabase({
    rows: {
      organisation_settings: {
        organisation_id: "org-1",
        settings_json: {
          branding: {
            organisationName: "Settings Organisation",
            logoLightUrl: "https://cdn.example.test/settings-logo.png",
            brandPrimaryColor: "#111111",
            supportEmail: "settings@example.test",
          },
        },
      },
      organisations: {
        id: "org-1",
        display_name: "Organisation Row",
        support_email: "org@example.test",
        support_phone: "+27 21 000 0000",
        website: "https://org.example.test",
      },
      organisation_branding: {
        organisation_id: "org-1",
        organisation_display_name: "Branding Row",
        logo_dark_url: "https://cdn.example.test/branding-logo.png",
        primary_brand_color: "#222222",
        secondary_brand_color: "#333333",
      },
    },
  });

  const branding = await resolveEmailBranding({
    supabase,
    payload: {
      organisationId: "org-1",
      organisationName: "Payload Organisation",
      brandPrimaryColor: "#444444",
    },
  });

  assertEquals(branding.organisationId, "org-1");
  assertEquals(branding.organisationName, "Payload Organisation");
  assertEquals(branding.logoUrl, "https://cdn.example.test/branding-logo.png");
  assertEquals(branding.primaryColor, "#444444");
  assertEquals(branding.secondaryColor, "#333333");
  assertEquals(branding.supportEmail, "org@example.test");
  assertEquals(branding.supportPhone, "+27 21 000 0000");
  assertEquals(branding.website, "https://org.example.test");
});

Deno.test("resolveEmailBranding uses explicit organisation id for lookups and payload for final copy", async () => {
  const queried: string[] = [];
  const supabase = {
    from(tableName: string) {
      return {
        select() {
          return {
            eq(_columnName: string, value: string) {
              queried.push(`${tableName}:${value}`);
              return {
                maybeSingle: async () => ({
                  data: tableName === "organisations"
                    ? {
                      id: value,
                      display_name: "Database Organisation",
                      lead_acknowledgement_sender_name: "Database Sender",
                      support_email: "database@example.test",
                    }
                    : null,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  const branding = await resolveEmailBranding({
    supabase,
    organisationId: "explicit-org",
    payload: {
      organisationId: "payload-org",
      organisationName: "Payload Organisation",
      fromName: "Payload Sender",
    },
  });

  assertEquals(queried.includes("organisations:explicit-org"), true);
  assertEquals(queried.includes("organisations:payload-org"), false);
  assertEquals(branding.organisationId, "explicit-org");
  assertEquals(branding.organisationName, "Payload Organisation");
  assertEquals(branding.fromName, "Payload Sender");
  assertEquals(branding.supportEmail, "database@example.test");
});

Deno.test("resolveEmailBranding reads email-ready columns from organisation branding", async () => {
  const supabase = createMockSupabase({
    rows: {
      organisations: {
        id: "org-3",
        display_name: "Organisation Fallback",
      },
      organisation_branding: {
        organisation_id: "org-3",
        organisation_display_name: "Ready Brand",
        logo_icon_url: "https://cdn.example.test/icon.png",
        primary_brand_color: "#101010",
        secondary_brand_color: "#f0f0f0",
        support_email: "ready@example.test",
        support_phone: "+27 11 111 1111",
        support_website: "https://ready.example.test",
        email_from_name: "Ready Sender",
        email_reply_to: "reply@example.test",
        tagline: "Ready to move",
      },
    },
  });

  const branding = await resolveEmailBranding({
    supabase,
    organisationId: "org-3",
  });

  assertEquals(branding.organisationName, "Ready Brand");
  assertEquals(branding.logoUrl, "https://cdn.example.test/icon.png");
  assertEquals(branding.logoIconUrl, "https://cdn.example.test/icon.png");
  assertEquals(branding.primaryColor, "#101010");
  assertEquals(branding.secondaryColor, "#f0f0f0");
  assertEquals(branding.supportEmail, "ready@example.test");
  assertEquals(branding.supportPhone, "+27 11 111 1111");
  assertEquals(branding.website, "https://ready.example.test");
  assertEquals(branding.fromName, "Ready Sender");
  assertEquals(branding.replyTo, "reply@example.test");
  assertEquals(branding.tagline, "Ready to move");
});

Deno.test("resolveEmailBranding supports disabled rollout fallback", async () => {
  const supabase = createMockSupabase({
    rows: {
      organisations: {
        id: "org-disabled",
        display_name: "Database Organisation",
        support_email: "database@example.test",
      },
    },
  });

  const branding = await resolveEmailBranding({
    supabase,
    organisationId: "org-disabled",
    rolloutMode: "disabled",
    defaults: {
      organisationName: "Fallback Organisation",
      supportEmail: "fallback@example.test",
    },
    payload: {
      organisationName: "Payload Organisation",
      supportEmail: "payload@example.test",
    },
  });

  assertEquals(branding.organisationName, "Fallback Organisation");
  assertEquals(branding.supportEmail, "fallback@example.test");
});

Deno.test("resolveEmailBranding can limit database branding to an organisation allowlist", async () => {
  const supabase = createMockSupabase({
    rows: {
      organisations: {
        id: "org-canary",
        display_name: "Database Canary",
        support_email: "database@example.test",
      },
    },
  });

  const outsideCohort = await resolveEmailBranding({
    supabase,
    organisationId: "org-outside",
    rolloutOrganisationIds: ["org-canary"],
    defaults: { organisationName: "Fallback Organisation" },
    payload: { organisationName: "Payload Organisation" },
  });
  const insideCohort = await resolveEmailBranding({
    supabase,
    organisationId: "org-canary",
    rolloutOrganisationIds: "org-canary,org-next",
    defaults: { organisationName: "Fallback Organisation" },
    payload: { organisationName: "Payload Organisation" },
  });

  assertEquals(outsideCohort.organisationName, "Payload Organisation");
  assertEquals(insideCohort.supportEmail, "database@example.test");
});

Deno.test("resolveEmailBranding ignores missing optional branding tables", async () => {
  const supabase = createMockSupabase({
    rows: {
      organisations: {
        id: "org-2",
        name: "Organisation Only",
        company_email: "company@example.test",
      },
    },
    errors: {
      organisation_branding: { code: "PGRST205", message: "table not found" },
      organisation_settings: {
        code: "42P01",
        message: "relation does not exist",
      },
    },
  });

  const branding = await resolveEmailBranding({
    supabase,
    organisationId: "org-2",
  });

  assertEquals(branding.organisationName, "Organisation Only");
  assertEquals(branding.supportEmail, "company@example.test");
  assertEquals(branding.primaryColor, DEFAULT_EMAIL_BRANDING.primaryColor);
});

Deno.test("resolveEmailBranding falls back to payload and defaults without an organisation id", async () => {
  const branding = await resolveEmailBranding({
    payload: {
      organisationName: "Payload Only",
      brandSecondaryColor: "#654321",
    },
  });

  assertEquals(branding.organisationName, "Payload Only");
  assertEquals(branding.primaryColor, DEFAULT_EMAIL_BRANDING.primaryColor);
  assertEquals(branding.secondaryColor, "#654321");
});
