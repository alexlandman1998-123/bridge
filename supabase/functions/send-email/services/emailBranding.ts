import { isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

export const DEFAULT_EMAIL_BRANDING = Object.freeze({
  organisationName: "Arch9",
  primaryColor: "#07152f",
  secondaryColor: "#b48a42",
});

export type EmailBranding = {
  organisationId?: string;
  organisationName: string;
  logoUrl?: string;
  logoIconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  website?: string;
  replyTo?: string;
  fromName?: string;
};

export type EmailBrandingInput =
  & Partial<EmailBranding>
  & Record<string, unknown>;

type SupabaseLike = {
  from: (table: string) => any;
};

type ResolveEmailBrandingInput = {
  supabase?: SupabaseLike;
  payload?: Record<string, unknown>;
  organisationId?: string;
  defaults?: EmailBrandingInput;
  rolloutMode?: string;
  rolloutOrganisationIds?: string[] | string;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function readEnvText(name: string) {
  try {
    return normalizeText(Deno.env.get(name));
  } catch {
    return "";
  }
}

function normalizeRolloutMode(value: unknown) {
  const mode = normalizeText(value).toLowerCase();
  if (["off", "disabled", "disable", "fallback"].includes(mode)) {
    return "disabled";
  }
  if (
    [
      "payload",
      "payload_only",
      "payload-only",
      "metadata_only",
      "metadata-only",
    ]
      .includes(mode)
  ) {
    return "payload_only";
  }
  return "enabled";
}

function normalizeRolloutOrganisationIds(value: unknown) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\s]+/);
  return new Set(
    rawItems.map((item) => normalizeText(item).toLowerCase()).filter(Boolean),
  );
}

function resolveRolloutMode(inputMode: unknown) {
  return normalizeRolloutMode(
    normalizeText(inputMode) || readEnvText("BRIDGE_EMAIL_BRANDING_ROLLOUT"),
  );
}

function resolveRolloutOrganisationIds(inputIds: unknown) {
  const explicit = Array.isArray(inputIds) ? inputIds : normalizeText(inputIds);
  return normalizeRolloutOrganisationIds(
    Array.isArray(explicit) || explicit
      ? explicit
      : readEnvText("BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS"),
  );
}

function pickNestedBranding(value: unknown) {
  const record = toRecord(value);
  const branding = toRecord(record.branding);
  const emailBranding = toRecord(record.emailBranding);
  const email = toRecord(record.email);
  return { ...record, ...branding, ...emailBranding, ...email };
}

function shouldIgnoreBrandingLookupError(error: unknown, tableName: string) {
  return isMissingTableError(error, tableName) || isMissingSchemaError(error);
}

async function maybeFetchSingleByOrganisation(
  supabase: SupabaseLike | undefined,
  tableName: string,
  columnName: string,
  organisationId: string,
) {
  if (!supabase || !organisationId) return {};
  const result = await supabase
    .from(tableName)
    .select("*")
    .eq(columnName, organisationId)
    .maybeSingle();

  if (result.error) {
    if (shouldIgnoreBrandingLookupError(result.error, tableName)) return {};
    console.warn(
      `[send-email] email branding lookup failed for ${tableName}`,
      result.error,
    );
    return {};
  }

  return toRecord(result.data);
}

export function normalizeBrandColor(value: unknown, fallback: string) {
  const text = normalizeText(value);
  if (/^#[0-9a-f]{6}$/i.test(text) || /^#[0-9a-f]{3}$/i.test(text)) {
    return text;
  }
  return fallback;
}

export function normalizeEmailAddress(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0] || "";
}

export function formatEmailSender(sender: unknown, fromName: unknown) {
  const email = normalizeEmailAddress(sender);
  if (!email) return normalizeText(sender);
  const cleanName = normalizeText(fromName).replace(/[<>\r\n"]/g, "");
  return cleanName ? `${cleanName} <${email}>` : normalizeText(sender) || email;
}

export function normalizeEmailBranding(
  input: EmailBrandingInput = {},
): EmailBranding {
  return {
    organisationId: firstText(input.organisationId, input.organisation_id) ||
      undefined,
    organisationName: firstText(
      input.organisationName,
      input.organisation_name,
      DEFAULT_EMAIL_BRANDING.organisationName,
    ),
    logoUrl: firstText(
      input.logoUrl,
      input.logo_url,
      input.organisationLogoUrl,
      input.organisation_logo_url,
      input.logoDarkUrl,
      input.logo_dark_url,
      input.logoLightUrl,
      input.logo_light_url,
      input.brandLogoUrl,
      input.brand_logo_url,
    ) || undefined,
    logoIconUrl: firstText(
      input.logoIconUrl,
      input.logo_icon_url,
      input.organisationLogoIconUrl,
      input.organisation_logo_icon_url,
      input.logoIcon,
      input.logo_icon,
    ) ||
      undefined,
    primaryColor: normalizeBrandColor(
      firstText(
        input.primaryColor,
        input.primary_color,
        input.brandPrimaryColor,
        input.brand_primary_color,
        input.organisationBrandPrimaryColor,
        input.organisation_brand_primary_color,
        input.primaryColour,
        input.primary_colour,
      ),
      DEFAULT_EMAIL_BRANDING.primaryColor,
    ),
    secondaryColor: normalizeBrandColor(
      firstText(
        input.secondaryColor,
        input.secondary_color,
        input.brandSecondaryColor,
        input.brand_secondary_color,
        input.organisationBrandSecondaryColor,
        input.organisation_brand_secondary_color,
        input.secondaryColour,
        input.secondary_colour,
      ),
      DEFAULT_EMAIL_BRANDING.secondaryColor,
    ),
    tagline: firstText(
      input.tagline,
      input.organisationTagline,
      input.organisation_tagline,
      input.slogan,
    ) || undefined,
    supportEmail: firstText(
      input.supportEmail,
      input.support_email,
      input.organisationEmail,
      input.organisation_email,
      input.companyEmail,
      input.company_email,
      input.email,
    ) ||
      undefined,
    supportPhone: firstText(
      input.supportPhone,
      input.support_phone,
      input.organisationPhone,
      input.organisation_phone,
      input.companyPhone,
      input.company_phone,
      input.phone,
    ) ||
      undefined,
    website: firstText(
      input.website,
      input.organisationWebsite,
      input.organisation_website,
    ) || undefined,
    replyTo: firstText(input.replyTo, input.reply_to) || undefined,
    fromName: firstText(input.fromName, input.from_name) || undefined,
  };
}

export function extractEmailBrandingFromPayload(
  payload: Record<string, unknown> = {},
): Partial<EmailBranding> {
  const metadata = toRecord(payload.metadata);
  return {
    organisationId: firstText(
      payload.organisationId,
      payload.organisation_id,
      metadata.organisationId,
      metadata.organisation_id,
    ) ||
      undefined,
    organisationName: firstText(
      payload.organisationName,
      payload.organisation_name,
      payload.agencyName,
      payload.agency_name,
      metadata.organisationName,
      metadata.organisation_name,
    ) || undefined,
    logoUrl: firstText(
      payload.organisationLogoUrl,
      payload.organisation_logo_url,
      payload.logoUrl,
      payload.logo_url,
      payload.logoDarkUrl,
      payload.logo_dark_url,
      payload.logoLightUrl,
      payload.logo_light_url,
      metadata.organisationLogoUrl,
      metadata.organisation_logo_url,
      metadata.logoUrl,
      metadata.logo_url,
    ) || undefined,
    logoIconUrl: firstText(
      payload.organisationLogoIconUrl,
      payload.organisation_logo_icon_url,
      payload.logoIconUrl,
      payload.logo_icon_url,
      metadata.organisationLogoIconUrl,
      metadata.organisation_logo_icon_url,
      metadata.logoIconUrl,
      metadata.logo_icon_url,
    ) || undefined,
    primaryColor: firstText(
      payload.organisationBrandPrimaryColor,
      payload.organisation_brand_primary_color,
      payload.brandPrimaryColor,
      payload.brand_primary_color,
      payload.primaryColor,
      payload.primary_color,
      metadata.organisationBrandPrimaryColor,
      metadata.organisation_brand_primary_color,
      metadata.brandPrimaryColor,
      metadata.brand_primary_color,
    ) || undefined,
    secondaryColor: firstText(
      payload.organisationBrandSecondaryColor,
      payload.organisation_brand_secondary_color,
      payload.brandSecondaryColor,
      payload.brand_secondary_color,
      payload.secondaryColor,
      payload.secondary_color,
      metadata.organisationBrandSecondaryColor,
      metadata.organisation_brand_secondary_color,
      metadata.brandSecondaryColor,
      metadata.brand_secondary_color,
    ) || undefined,
    tagline: firstText(
      payload.organisationTagline,
      payload.organisation_tagline,
      payload.tagline,
      metadata.tagline,
    ) ||
      undefined,
    supportEmail: firstText(
      payload.supportEmail,
      payload.support_email,
      payload.organisationEmail,
      payload.organisation_email,
      metadata.supportEmail,
      metadata.support_email,
    ) || undefined,
    supportPhone: firstText(
      payload.supportPhone,
      payload.support_phone,
      payload.organisationPhone,
      payload.organisation_phone,
      metadata.supportPhone,
      metadata.support_phone,
    ) || undefined,
    website: firstText(
      payload.organisationWebsite,
      payload.organisation_website,
      payload.website,
      metadata.website,
    ) ||
      undefined,
    replyTo: firstText(
      payload.replyTo,
      payload.reply_to,
      metadata.replyTo,
      metadata.reply_to,
    ) || undefined,
    fromName: firstText(
      payload.fromName,
      payload.from_name,
      metadata.fromName,
      metadata.from_name,
    ) || undefined,
  };
}

export function extractEmailBrandingFromOrganisation(
  row: Record<string, unknown> = {},
): Partial<EmailBranding> {
  return {
    organisationId: firstText(row.id, row.organisation_id) || undefined,
    organisationName: firstText(
      row.display_name,
      row.name,
      row.legal_name,
      row.organisation_name,
    ) || undefined,
    logoUrl: firstText(
      row.logo_url,
      row.logoUrl,
      row.brand_logo_url,
      row.logo_dark_url,
      row.logo_light_url,
    ) || undefined,
    logoIconUrl:
      firstText(row.logo_icon_url, row.logoIconUrl, row.brand_logo_icon_url) ||
      undefined,
    primaryColor: firstText(
      row.brand_primary_colour,
      row.brand_primary_color,
      row.primary_colour,
      row.primary_color,
    ) || undefined,
    secondaryColor: firstText(
      row.brand_secondary_colour,
      row.brand_secondary_color,
      row.secondary_colour,
      row.secondary_color,
    ) || undefined,
    tagline: firstText(row.tagline, row.slogan) || undefined,
    supportEmail: firstText(
      row.support_email,
      row.company_email,
      row.email,
      row.billing_email,
    ) || undefined,
    supportPhone: firstText(row.support_phone, row.company_phone, row.phone) ||
      undefined,
    website: firstText(row.website, row.company_website) || undefined,
    fromName: firstText(
      row.lead_acknowledgement_sender_name,
      row.display_name,
      row.name,
    ) || undefined,
  };
}

export function extractEmailBrandingFromOrganisationBranding(
  row: Record<string, unknown> = {},
): Partial<EmailBranding> {
  const metadata = pickNestedBranding(row.metadata_json);
  return {
    organisationId: firstText(
      row.organisation_id,
      metadata.organisationId,
      metadata.organisation_id,
    ) || undefined,
    organisationName: firstText(
      row.organisation_display_name,
      metadata.organisationName,
      metadata.organisation_name,
      metadata.displayName,
      metadata.display_name,
    ) || undefined,
    logoUrl: firstText(
      row.logo_dark_url,
      row.logo_light_url,
      row.logo_icon_url,
      metadata.logoDarkUrl,
      metadata.logo_dark_url,
      metadata.logoDark,
      metadata.logoLightUrl,
      metadata.logo_light_url,
      metadata.logoLight,
      metadata.logoUrl,
      metadata.logo_url,
    ) || undefined,
    logoIconUrl: firstText(
      row.logo_icon_url,
      metadata.logoIconUrl,
      metadata.logo_icon_url,
      metadata.logoIcon,
      metadata.logo_icon,
    ) || undefined,
    primaryColor: firstText(
      row.primary_brand_color,
      metadata.primaryBrandColor,
      metadata.primary_brand_color,
      metadata.brandPrimaryColor,
      metadata.brand_primary_color,
      metadata.primaryColor,
      metadata.primary_color,
    ) || undefined,
    secondaryColor: firstText(
      row.secondary_brand_color,
      row.accent_brand_color,
      metadata.secondaryBrandColor,
      metadata.secondary_brand_color,
      metadata.brandSecondaryColor,
      metadata.brand_secondary_color,
      metadata.secondaryColor,
      metadata.secondary_color,
      metadata.accentBrandColor,
      metadata.accent_brand_color,
    ) || undefined,
    tagline: firstText(row.tagline, metadata.tagline, metadata.slogan) ||
      undefined,
    supportEmail: firstText(
      row.support_email,
      metadata.supportEmail,
      metadata.support_email,
      metadata.email,
    ) || undefined,
    supportPhone: firstText(
      row.support_phone,
      metadata.supportPhone,
      metadata.support_phone,
      metadata.phone,
    ) || undefined,
    website: firstText(
      row.support_website,
      row.website,
      metadata.website,
      metadata.organisationWebsite,
      metadata.organisation_website,
    ) || undefined,
    replyTo:
      firstText(row.email_reply_to, metadata.replyTo, metadata.reply_to) ||
      undefined,
    fromName: firstText(
      row.email_from_name,
      row.from_name,
      metadata.fromName,
      metadata.from_name,
      row.organisation_display_name,
    ) || undefined,
  };
}

export function extractEmailBrandingFromSettings(
  row: Record<string, unknown> = {},
): Partial<EmailBranding> {
  const settings = pickNestedBranding(row.settings_json);
  return {
    organisationId: firstText(
      row.organisation_id,
      settings.organisationId,
      settings.organisation_id,
    ) || undefined,
    organisationName: firstText(
      settings.organisationName,
      settings.organisation_name,
      settings.displayName,
      settings.display_name,
    ) ||
      undefined,
    logoUrl: firstText(
      settings.logoDarkUrl,
      settings.logo_dark_url,
      settings.logoDark,
      settings.logoLightUrl,
      settings.logo_light_url,
      settings.logoLight,
      settings.logoUrl,
      settings.logo_url,
    ) || undefined,
    logoIconUrl: firstText(
      settings.logoIconUrl,
      settings.logo_icon_url,
      settings.logoIcon,
      settings.logo_icon,
    ) || undefined,
    primaryColor: firstText(
      settings.primaryColor,
      settings.primary_color,
      settings.primaryColour,
      settings.primary_colour,
      settings.brandPrimaryColor,
      settings.brand_primary_color,
    ) || undefined,
    secondaryColor: firstText(
      settings.secondaryColor,
      settings.secondary_color,
      settings.secondaryColour,
      settings.secondary_colour,
      settings.brandSecondaryColor,
      settings.brand_secondary_color,
      settings.accentColor,
      settings.accent_color,
    ) || undefined,
    tagline: firstText(settings.tagline, settings.slogan) || undefined,
    supportEmail: firstText(
      settings.supportEmail,
      settings.support_email,
      settings.email,
    ) || undefined,
    supportPhone: firstText(
      settings.supportPhone,
      settings.support_phone,
      settings.phone,
    ) || undefined,
    website: firstText(
      settings.website,
      settings.organisationWebsite,
      settings.organisation_website,
    ) || undefined,
    replyTo: firstText(settings.replyTo, settings.reply_to) || undefined,
    fromName: firstText(settings.fromName, settings.from_name) || undefined,
  };
}

export async function resolveEmailBranding({
  supabase,
  payload = {},
  organisationId,
  defaults = {},
  rolloutMode,
  rolloutOrganisationIds,
}: ResolveEmailBrandingInput = {}): Promise<EmailBranding> {
  const explicitBranding = extractEmailBrandingFromPayload(payload);
  const resolvedOrganisationId = firstText(
    organisationId,
    explicitBranding.organisationId,
  );
  const mode = resolveRolloutMode(rolloutMode);
  if (mode === "disabled") {
    return mergeEmailBranding(defaults);
  }
  if (mode === "payload_only") {
    return mergeEmailBranding(defaults, explicitBranding);
  }
  const allowedOrganisationIds = resolveRolloutOrganisationIds(
    rolloutOrganisationIds,
  );
  if (
    allowedOrganisationIds.size > 0 &&
    !allowedOrganisationIds.has(resolvedOrganisationId.toLowerCase())
  ) {
    return mergeEmailBranding(defaults, explicitBranding);
  }
  if (!resolvedOrganisationId || !supabase) {
    return mergeEmailBranding(defaults, explicitBranding);
  }

  const [organisationRow, brandingRow, settingsRow] = await Promise.all([
    maybeFetchSingleByOrganisation(
      supabase,
      "organisations",
      "id",
      resolvedOrganisationId,
    ),
    maybeFetchSingleByOrganisation(
      supabase,
      "organisation_branding",
      "organisation_id",
      resolvedOrganisationId,
    ),
    maybeFetchSingleByOrganisation(
      supabase,
      "organisation_settings",
      "organisation_id",
      resolvedOrganisationId,
    ),
  ]);

  return mergeEmailBranding(
    defaults,
    extractEmailBrandingFromSettings(settingsRow),
    extractEmailBrandingFromOrganisation(organisationRow),
    extractEmailBrandingFromOrganisationBranding(brandingRow),
    explicitBranding,
    { organisationId: resolvedOrganisationId },
  );
}

export function mergeEmailBranding(...inputs: EmailBrandingInput[]) {
  const merged: EmailBrandingInput = {};
  for (const input of inputs) {
    for (const [key, value] of Object.entries(input || {})) {
      if (normalizeText(value)) merged[key] = value;
    }
  }
  return normalizeEmailBranding(merged);
}
