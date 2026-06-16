import { createClient } from "supabase";
import type { SendSellerOnboardingSubmittedPayload } from "../types.ts";
import {
  buildSellerOnboardingSubmittedEmailHtml,
  buildSellerOnboardingSubmittedEmailText,
  buildSellerOnboardingSubmittedSubject,
} from "../content/sellerOnboardingSubmitted.ts";
import { fetchOrganisationEmailTemplateOverride } from "../services/emailTemplateSettings.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import {
  isMissingColumnError,
  isMissingSchemaError,
  isMissingTableError,
} from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

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
    .select("id, name, display_name, support_email, support_phone, company_email, company_phone")
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
    console.error("[seller_onboarding_submitted] organisation lookup failed", organisationQuery.error);
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
    senderOrganisationLogoUrl = normalizeText(logoQuery.data?.logo_url) || senderOrganisationLogoUrl;
  } else if (logoQuery.error) {
    console.error("[seller_onboarding_submitted] organisation logo lookup failed", logoQuery.error);
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
    senderOrganisationName = normalizeText(brandingQuery.data?.organisation_display_name) || senderOrganisationName;
    senderOrganisationLogoUrl = normalizeText(brandingQuery.data?.logo_light_url) ||
      normalizeText(brandingQuery.data?.logo_dark_url) ||
      senderOrganisationLogoUrl;
  } else if (brandingQuery.error) {
    console.error("[seller_onboarding_submitted] organisation branding lookup failed", brandingQuery.error);
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
    console.error("[seller_onboarding_submitted] organisation settings lookup failed", settingsQuery.error);
  }

  return {
    senderOrganisationName,
    senderOrganisationLogoUrl,
    supportEmail,
    supportPhone,
  };
}

export async function handleSellerOnboardingSubmittedEmail(
  req: Request,
  payload: SendSellerOnboardingSubmittedPayload,
) {
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

  const sellerName = normalizeText(payload.sellerName) || "Seller";
  const propertyTitle = normalizeText(payload.propertyTitle) || "property";
  const agentName = normalizeText(payload.agentName) || "Agent";
  const transactionReference = normalizeText(payload.transactionReference);
  const organisationId = normalizeText(payload.organisationId);
  const leadId = normalizeText(payload.leadId);
  const listingId = normalizeText(payload.listingId);
  const requestedActionLink = normalizeText(payload.actionLink);
  const appBaseUrl = resolveAppBaseUrl(req);
  const actionLink = requestedActionLink ||
    (appBaseUrl && leadId ? `${appBaseUrl}/pipeline/leads/${encodeURIComponent(leadId)}/legal/mandate` : "");

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const organisationName =
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Bridge";
  let supportEmail =
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL"));
  let supportPhone =
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE"));
  let senderOrganisationName = organisationName;
  let senderOrganisationLogoUrl = "";
  let templateOverrides = null;

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
      if (!supportEmail) supportEmail = resolvedOrganisation.supportEmail;
      if (!supportPhone) supportPhone = resolvedOrganisation.supportPhone;
      templateOverrides = await fetchOrganisationEmailTemplateOverride(
        supabase,
        organisationId,
        "seller_onboarding_submitted",
      );
    } catch (error) {
      console.error("[seller_onboarding_submitted] template override lookup failed", error);
    }
  }

  const subject =
    normalizeText(templateOverrides?.subject) ||
    buildSellerOnboardingSubmittedSubject(propertyTitle);
  const html = buildSellerOnboardingSubmittedEmailHtml({
    sellerName,
    propertyTitle,
    transactionReference,
    agentName,
    actionLink,
    organisationName: senderOrganisationName || organisationName,
    senderOrganisationName,
    senderOrganisationLogoUrl,
    supportEmail,
    supportPhone,
    templateOverrides: templateOverrides || undefined,
  });
  const text = buildSellerOnboardingSubmittedEmailText({
    sellerName,
    propertyTitle,
    transactionReference,
    agentName,
    actionLink,
    organisationName: senderOrganisationName || organisationName,
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
      error: emailResult.error?.message || "Failed to send seller onboarding submitted email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_onboarding_submitted",
    emailId: emailResult.data?.id || null,
    actionLink,
    leadId: leadId || null,
    listingId: listingId || null,
  });
}
