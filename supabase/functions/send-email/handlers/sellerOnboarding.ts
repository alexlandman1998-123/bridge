import { createClient } from "supabase";
import type { SendSellerOnboardingPayload } from "../types.ts";
import {
  buildSellerOnboardingEmailHtml,
  buildSellerOnboardingEmailText,
  buildSellerOnboardingSubject,
} from "../content/sellerOnboarding.ts";
import { fetchOrganisationEmailTemplateOverride } from "../services/emailTemplateSettings.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import {
  isMissingColumnError,
  isMissingSchemaError,
  isMissingTableError,
} from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function resolveSenderOrganisationBranding(
  supabase: any,
  organisationId: string,
  fallbackName = "Bridge",
) {
  let senderOrganisationName = fallbackName;
  let senderOrganisationLogoUrl = "";
  let supportEmail = "";
  let supportPhone = "";

  const organisationQuery = await supabase
    .from("organisations")
    .select(
      "id, name, display_name, support_email, support_phone, company_email, company_phone",
    )
    .eq("id", organisationId)
    .maybeSingle();

  if (
    !organisationQuery.error ||
    isMissingTableError(organisationQuery.error, "organisations") ||
    isMissingSchemaError(organisationQuery.error)
  ) {
    senderOrganisationName = normalizeText(organisationQuery.data?.display_name) ||
      normalizeText(organisationQuery.data?.name) ||
      senderOrganisationName;
    supportEmail = normalizeText(organisationQuery.data?.support_email) ||
      normalizeText(organisationQuery.data?.company_email) ||
      supportEmail;
    supportPhone = normalizeText(organisationQuery.data?.support_phone) ||
      normalizeText(organisationQuery.data?.company_phone) ||
      supportPhone;
  } else if (organisationQuery.error) {
    console.error("[seller_onboarding] organisation lookup failed", organisationQuery.error);
  }

  const logoQuery = await supabase
    .from("organisations")
    .select("logo_url")
    .eq("id", organisationId)
    .maybeSingle();

  if (
    !logoQuery.error ||
    isMissingTableError(logoQuery.error, "organisations") ||
    isMissingSchemaError(logoQuery.error) ||
    isMissingColumnError(logoQuery.error, "logo_url")
  ) {
    senderOrganisationLogoUrl = normalizeText(logoQuery.data?.logo_url) ||
      senderOrganisationLogoUrl;
  } else if (logoQuery.error) {
    console.error("[seller_onboarding] organisation logo lookup failed", logoQuery.error);
  }

  const brandingQuery = await supabase
    .from("organisation_branding")
    .select("organisation_display_name, logo_light_url, logo_dark_url")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (
    !brandingQuery.error ||
    isMissingTableError(brandingQuery.error, "organisation_branding") ||
    isMissingSchemaError(brandingQuery.error)
  ) {
    senderOrganisationName = normalizeText(brandingQuery.data?.organisation_display_name) ||
      senderOrganisationName;
    senderOrganisationLogoUrl = normalizeText(brandingQuery.data?.logo_light_url) ||
      normalizeText(brandingQuery.data?.logo_dark_url) ||
      senderOrganisationLogoUrl;
  } else if (brandingQuery.error) {
    console.error("[seller_onboarding] organisation branding lookup failed", brandingQuery.error);
  }

  const settingsQuery = await supabase
    .from("organisation_settings")
    .select("settings_json")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (
    !settingsQuery.error ||
    isMissingTableError(settingsQuery.error, "organisation_settings") ||
    isMissingSchemaError(settingsQuery.error) ||
    isMissingColumnError(settingsQuery.error, "settings_json")
  ) {
    const settings = toRecord(settingsQuery.data?.settings_json);
    const agencyOnboarding = toRecord(settings.agencyOnboarding || settings.agency_onboarding);
    const branding = toRecord(agencyOnboarding.branding || settings.branding);
    senderOrganisationLogoUrl = normalizeText(branding.logoLight) ||
      normalizeText(branding.logoLightUrl) ||
      normalizeText(branding.logo_url) ||
      normalizeText(branding.logoUrl) ||
      normalizeText(branding.logoDark) ||
      normalizeText(branding.logoDarkUrl) ||
      senderOrganisationLogoUrl;
  } else if (settingsQuery.error) {
    console.error("[seller_onboarding] organisation settings lookup failed", settingsQuery.error);
  }

  return {
    senderOrganisationName,
    senderOrganisationLogoUrl,
    supportEmail,
    supportPhone,
  };
}

export async function handleSellerOnboardingEmail(payload: SendSellerOnboardingPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const sellerName = normalizeText(payload.sellerName) || "there";
  const propertyTitle = normalizeText(payload.propertyTitle) || "your property";
  const propertyType = normalizeText(payload.propertyType);
  const transactionReference = normalizeText(payload.transactionReference);
  const onboardingLink = normalizeText(payload.onboardingLink);
  const agentName = normalizeText(payload.agentName);
  const organisationName = normalizeText(payload.organisationName) || "Bridge";
  const organisationId = normalizeText(payload.organisationId);
  let supportEmail = normalizeText(payload.supportEmail);
  let supportPhone = normalizeText(payload.supportPhone);
  if (!onboardingLink) {
    return jsonResponse(400, { error: "Missing required field: onboardingLink" });
  }

  let templateOverrides = null;
  let senderOrganisationName = organisationName;
  let senderOrganisationLogoUrl = "";
  if (organisationId && supabaseUrl && serviceRoleKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const resolvedOrganisation = await resolveSenderOrganisationBranding(
        supabase,
        organisationId,
        organisationName,
      );
      senderOrganisationName = resolvedOrganisation.senderOrganisationName;
      senderOrganisationLogoUrl = resolvedOrganisation.senderOrganisationLogoUrl;
      if (!supportEmail) {
        supportEmail = resolvedOrganisation.supportEmail;
      }
      if (!supportPhone) {
        supportPhone = resolvedOrganisation.supportPhone;
      }
      templateOverrides = await fetchOrganisationEmailTemplateOverride(
        supabase,
        organisationId,
        "seller_onboarding",
      );
    } catch (error) {
      console.error("[seller_onboarding] template override lookup failed", error);
    }
  }

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject =
    normalizeText(templateOverrides?.subject) ||
    buildSellerOnboardingSubject(propertyTitle, transactionReference, propertyType);
  const html = buildSellerOnboardingEmailHtml({
    sellerName,
    propertyTitle,
    propertyType,
    transactionReference,
    onboardingLink,
    agentName,
    organisationName,
    senderOrganisationName,
    senderOrganisationLogoUrl,
    supportEmail,
    supportPhone,
    templateOverrides: templateOverrides || undefined,
  });
  const text = buildSellerOnboardingEmailText({
    sellerName,
    propertyTitle,
    propertyType,
    transactionReference,
    onboardingLink,
    agentName,
    organisationName: senderOrganisationName || organisationName,
    supportEmail,
    supportPhone,
    templateOverrides: templateOverrides || undefined,
  });

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send seller onboarding email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_onboarding",
    emailId: emailResult.data?.id || null,
  });
}
