import { createClient } from "supabase";
import type { SendSellerOnboardingPayload } from "../types.ts";
import {
  buildSellerOnboardingEmailHtml,
  buildSellerOnboardingEmailText,
  buildSellerOnboardingSubject,
} from "../content/sellerOnboarding.ts";
import { fetchOrganisationEmailTemplateOverride } from "../services/emailTemplateSettings.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { ensureCanonicalClientInvite } from "../services/canonicalClientInvite.ts";
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

function extractSellerPortalToken(link: string) {
  const normalized = normalizeText(link);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0] === "client" && parts[1] && parts[2] === "selling" ? parts[1] : "";
  } catch {
    const parts = normalized.split("?")[0].split("#")[0].split("/").filter(Boolean);
    return parts[0] === "client" && parts[1] && parts[2] === "selling" ? parts[1] : "";
  }
}

async function resolveSenderOrganisationBranding(
  supabase: any,
  organisationId: string,
  fallbackName = "Arch9",
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
  const emailKind = normalizeText(payload.emailKind) || "onboarding";
  const portalDocumentsMode = emailKind.toLowerCase() === "portal_documents" ||
    normalizeText(payload.type).toLowerCase() === "seller_portal_link";
  let onboardingLink = portalDocumentsMode
    ? normalizeText(payload.portalLink) || normalizeText(payload.onboardingLink)
    : normalizeText(payload.onboardingLink);
  const legacyOnboardingLink = onboardingLink;
  const agentName = normalizeText(payload.agentName);
  const organisationName = normalizeText(payload.organisationName) || "Arch9";
  const organisationId = normalizeText(payload.organisationId);
  let supportEmail = normalizeText(payload.supportEmail);
  let supportPhone = normalizeText(payload.supportPhone);
  if (!onboardingLink) {
    return jsonResponse(400, { error: "Missing required field: onboardingLink" });
  }

  const supabase = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;
  let canonicalClientInvite: any = null;
  if (portalDocumentsMode && supabase) {
    canonicalClientInvite = await ensureCanonicalClientInvite(supabase, {
      email: to,
      clientRole: "seller",
      legacyPortalLink: legacyOnboardingLink,
      metadata: {
        source: "seller_portal_documents_ready",
        organisation_id: organisationId || null,
        listing_id: normalizeText(payload.listingId) || null,
        lead_id: normalizeText(payload.leadId) || null,
        seller_workspace_token: extractSellerPortalToken(legacyOnboardingLink) || null,
      },
    }).catch((inviteError) => {
      console.error("[seller_onboarding] canonical seller invite creation failed", inviteError);
      return null;
    });
    if (normalizeText(canonicalClientInvite?.inviteLink)) {
      onboardingLink = normalizeText(canonicalClientInvite?.inviteLink);
    }
  }

  let templateOverrides = null;
  let senderOrganisationName = organisationName;
  let senderOrganisationLogoUrl = "";
  if (organisationId && supabase) {
    try {
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
    "Arch9 <onboarding@resend.dev>";

  const subject =
    normalizeText(templateOverrides?.subject) ||
    buildSellerOnboardingSubject(propertyTitle, transactionReference, propertyType, emailKind);
  const html = buildSellerOnboardingEmailHtml({
    sellerName,
    propertyTitle,
    propertyType,
    transactionReference,
    onboardingLink,
    emailKind,
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
    emailKind,
    agentName,
    organisationName: senderOrganisationName || organisationName,
    supportEmail,
    supportPhone,
    templateOverrides: templateOverrides || undefined,
  });

  const communicationType = portalDocumentsMode
    ? "seller_portal_link_seller"
    : "seller_onboarding_link_seller";
  const delivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
    communicationType,
    recipient: to,
    recipientRole: "seller",
    subject,
    messagePreview: text,
    context: {
      organisationId,
      leadId: normalizeText(payload.leadId),
      listingId: normalizeText(payload.listingId),
      metadata: {
        emailKind,
        portalDocumentsMode,
        onboardingLink,
        canonicalInviteId: canonicalClientInvite?.inviteId || null,
        canonicalInviteToken: canonicalClientInvite?.token || null,
        canonicalInviteLink: canonicalClientInvite?.inviteLink || null,
        legacyOnboardingLink,
        emailPurpose: communicationType,
      },
    },
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
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage:
        emailResult.error?.message ||
        "Failed to send seller onboarding email.",
    });
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send seller onboarding email.",
      details: emailResult.error,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: portalDocumentsMode ? "seller_portal_link" : "seller_onboarding",
    emailId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
    canonicalInviteId: canonicalClientInvite?.inviteId || null,
    canonicalInviteLink: canonicalClientInvite?.inviteLink || null,
    legacyOnboardingLink: portalDocumentsMode ? legacyOnboardingLink : null,
    communicationType,
  });
}
