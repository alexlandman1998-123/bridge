type OrganisationRecord = Record<string, unknown>;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function safeUrl(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function buildLeadOperationsBrandingPayload(
  organisation: OrganisationRecord = {},
  fallbackOrganisationName = "Arch9",
) {
  const organisationName = firstText(
    organisation.name,
    organisation.display_name,
    organisation.legal_name,
    fallbackOrganisationName,
  );
  const logoDarkUrl = safeUrl(
    firstText(
      organisation.logo_dark_url,
      organisation.logoDarkUrl,
      organisation.brand_logo_dark_url,
    ),
  );
  const logoLightUrl = safeUrl(
    firstText(
      organisation.logo_light_url,
      organisation.logoLightUrl,
      organisation.logo_url,
      organisation.logoUrl,
      organisation.brand_logo_url,
    ),
  );
  const logoIconUrl = safeUrl(
    firstText(
      organisation.logo_icon_url,
      organisation.logoIconUrl,
      organisation.brand_logo_icon_url,
    ),
  );

  return {
    organisationName,
    organisationLogoUrl: logoDarkUrl || logoLightUrl || logoIconUrl || undefined,
    organisationLogoDarkUrl: logoDarkUrl || undefined,
    organisationLogoLightUrl: logoLightUrl || undefined,
    organisationLogoIconUrl: logoIconUrl || undefined,
    organisationBrandPrimaryColor: firstText(
      organisation.brand_primary_colour,
      organisation.brand_primary_color,
      organisation.primary_colour,
      organisation.primary_color,
    ) || undefined,
    organisationBrandSecondaryColor: firstText(
      organisation.brand_secondary_colour,
      organisation.brand_secondary_color,
      organisation.secondary_colour,
      organisation.secondary_color,
    ) || undefined,
    organisationTagline: firstText(organisation.tagline, organisation.slogan) ||
      undefined,
    organisationPhone: firstText(
      organisation.phone,
      organisation.company_phone,
      organisation.support_phone,
    ) || undefined,
    organisationEmail: firstText(
      organisation.email,
      organisation.company_email,
      organisation.support_email,
    ) || undefined,
    organisationWebsite: firstText(
      organisation.website,
      organisation.company_website,
      organisation.support_website,
    ) || undefined,
    fromName: firstText(
      organisation.lead_acknowledgement_sender_name,
      organisation.display_name,
      organisation.name,
    ) || undefined,
  };
}
