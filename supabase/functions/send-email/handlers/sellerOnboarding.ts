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
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { ensureCanonicalClientInvite } from "../services/canonicalClientInvite.ts";
import { jsonResponse } from "../utils/http.ts";
import {
  isMissingColumnError,
  isMissingSchemaError,
  isMissingTableError,
} from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

const SELLER_ONBOARDING_RESEND_TIMEOUT_MS = 45_000;

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStatusKey(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(
    /^_+|_+$/g,
    "",
  );
}

async function verifySellerPortalInviteSetup(
  supabase: Parameters<typeof ensureCanonicalClientInvite>[0] | null,
  listingId: string,
  recipientEmail: string,
) {
  if (!supabase) return { ok: false, status: 500, error: "Seller Portal setup could not be checked. Please try again.", code: "seller_portal_setup_unavailable" };
  if (!listingId) return { ok: false, status: 400, error: "A listing is required before sending the Seller Portal invitation.", code: "seller_portal_listing_required" };

  const query = await supabase.from("private_listings")
    .select("id, organisation_id, seller_type, seller_canonical_facts_json")
    .eq("id", listingId).maybeSingle();
  if (query.error) {
    console.error("[seller_onboarding] seller portal setup check failed", query.error);
    return { ok: false, status: 500, error: "Unable to check seller setup before sending the portal link.", code: "seller_portal_setup_check_failed" };
  }
  const listing = query.data;
  if (!listing) return { ok: false, status: 404, error: "Listing not found.", code: "seller_portal_listing_not_found" };

  const onboardingQuery = await supabase.from("private_listing_seller_onboarding")
    .select("seller_type, form_data")
    .eq("private_listing_id", listingId).maybeSingle();
  if (onboardingQuery.error) {
    console.error("[seller_onboarding] seller portal onboarding lookup failed", onboardingQuery.error);
    return { ok: false, status: 500, error: "Unable to check seller setup before sending the portal link.", code: "seller_portal_setup_check_failed" };
  }
  const facts = toRecord(listing.seller_canonical_facts_json);
  const seller = toRecord(facts.seller);
  const form = toRecord(onboardingQuery.data?.form_data);
  const explicitType = normalizeStatusKey(
    seller.sellerLegalType || seller.legal_type || facts.sellerLegalType ||
    facts.sellerType || form.sellerType || onboardingQuery.data?.seller_type ||
    (normalizeStatusKey(listing.seller_type) === "individual" ? "" : listing.seller_type),
  );
  if (!explicitType || ["unknown", "not_captured", "not_identified"].includes(explicitType)) {
    return { ok: false, status: 409, error: "Confirm the seller entity type before sending a Seller Portal invitation.", code: "seller_type_required" };
  }

  const individualContact = ["individual", "married", "foreign_individual"].includes(explicitType);
  const contactName = normalizeText(facts.primaryContactName) ||
    (individualContact
      ? [facts.firstName, facts.lastName].map(normalizeText).filter(Boolean).join(" ") ||
        [form.sellerFirstName || form.firstName, form.sellerSurname || form.lastName].map(normalizeText).filter(Boolean).join(" ") ||
        normalizeText(facts.sellerName || form.sellerName)
      : "");
  if (!contactName) {
    return { ok: false, status: 409, error: "Name the seller representative before sending the portal invitation.", code: "seller_contact_required" };
  }
  const savedEmail = normalizeText(
    facts.primaryContactEmail || facts.sellerEmail || facts.email || form.sellerEmail || form.email,
  ).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(savedEmail) || savedEmail !== normalizeText(recipientEmail).toLowerCase()) {
    return { ok: false, status: 409, error: "Confirm the seller representative’s email on the listing before sending the invitation.", code: "seller_email_required" };
  }
  return { ok: true };
}
function extractSellerPortalToken(link: string) {
  const normalized = normalizeText(link);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0] === "client" && parts[1] && parts[2] === "selling"
      ? parts[1]
      : "";
  } catch {
    const parts = normalized.split("?")[0].split("#")[0].split("/").filter(
      Boolean,
    );
    return parts[0] === "client" && parts[1] && parts[2] === "selling"
      ? parts[1]
      : "";
  }
}

async function resolveSenderOrganisationBranding(
  supabase: any,
  organisationId: string,
  fallbackName = "Arch9",
) {
  let senderOrganisationName = fallbackName;
  let senderOrganisationLogoUrl = "";
  let senderBrandPrimaryColor = "";
  let senderBrandSecondaryColor = "";
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
    senderOrganisationName =
      normalizeText(organisationQuery.data?.display_name) ||
      normalizeText(organisationQuery.data?.name) ||
      senderOrganisationName;
    supportEmail = normalizeText(organisationQuery.data?.support_email) ||
      normalizeText(organisationQuery.data?.company_email) ||
      supportEmail;
    supportPhone = normalizeText(organisationQuery.data?.support_phone) ||
      normalizeText(organisationQuery.data?.company_phone) ||
      supportPhone;
  } else if (organisationQuery.error) {
    console.error(
      "[seller_onboarding] organisation lookup failed",
      organisationQuery.error,
    );
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
    console.error(
      "[seller_onboarding] organisation logo lookup failed",
      logoQuery.error,
    );
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
    senderOrganisationName =
      normalizeText(brandingQuery.data?.organisation_display_name) ||
      senderOrganisationName;
    senderOrganisationLogoUrl =
      normalizeText(brandingQuery.data?.logo_dark_url) ||
      normalizeText(brandingQuery.data?.logo_light_url) ||
      senderOrganisationLogoUrl;
  } else if (brandingQuery.error) {
    console.error(
      "[seller_onboarding] organisation branding lookup failed",
      brandingQuery.error,
    );
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
    const agencyOnboarding = toRecord(
      settings.agencyOnboarding || settings.agency_onboarding,
    );
    const branding = toRecord(agencyOnboarding.branding || settings.branding);
    const brandColours = toRecord(
      branding.brandColours || branding.brand_colours ||
        branding.brandColors || branding.brand_colors,
    );
    senderOrganisationLogoUrl = normalizeText(branding.logoDark) ||
      normalizeText(branding.logoDarkUrl) ||
      normalizeText(branding.logoHighContrast) ||
      normalizeText(branding.logoHighContrastUrl) ||
      normalizeText(branding.logo_url) ||
      normalizeText(branding.logoUrl) ||
      normalizeText(branding.logoLight) ||
      normalizeText(branding.logoLightUrl) ||
      senderOrganisationLogoUrl;
    senderBrandPrimaryColor = normalizeText(brandColours.primary) ||
      normalizeText(branding.primaryColor) ||
      normalizeText(branding.primary_color) ||
      normalizeText(branding.primaryColour) ||
      normalizeText(branding.primary_colour) ||
      senderBrandPrimaryColor;
    senderBrandSecondaryColor = normalizeText(brandColours.secondary) ||
      normalizeText(brandColours.accent) ||
      normalizeText(branding.secondaryColor) ||
      normalizeText(branding.secondary_color) ||
      normalizeText(branding.secondaryColour) ||
      normalizeText(branding.secondary_colour) ||
      normalizeText(branding.accentColor) ||
      normalizeText(branding.accent_color) ||
      senderBrandSecondaryColor;
  } else if (settingsQuery.error) {
    console.error(
      "[seller_onboarding] organisation settings lookup failed",
      settingsQuery.error,
    );
  }

  return {
    senderOrganisationName,
    senderOrganisationLogoUrl,
    senderBrandPrimaryColor,
    senderBrandSecondaryColor,
    supportEmail,
    supportPhone,
  };
}

export async function handleSellerOnboardingEmail(
  payload: SendSellerOnboardingPayload,
) {
  const requestStartedAt = performance.now();
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
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
    ? normalizeText(payload.portalLink) ||
      normalizeText(payload.onboardingUrl ?? payload.onboarding_url) ||
      normalizeText(payload.onboardingLink)
    : normalizeText(payload.onboardingUrl ?? payload.onboarding_url) ||
      normalizeText(payload.onboardingLink);
  const legacyOnboardingLink = onboardingLink;
  const agentName = normalizeText(payload.agentName);
  const agentEmail = normalizeText(payload.agentEmail ?? payload.agent_email);
  const agentPhone = normalizeText(payload.agentPhone ?? payload.agent_phone);
  const organisationName =
    normalizeText(payload.agencyName ?? payload.agency_name) ||
    normalizeText(payload.organisationName) ||
    "Arch9";
  const payloadAgencyLogoUrl = normalizeText(
    payload.agencyLogoUrl ?? payload.agency_logo_url ??
      payload.agencyLogo ?? payload.agency_logo,
  );
  const expiryDays = normalizeText(payload.expiryDays ?? payload.expiry_days);
  const expiresAt = normalizeText(payload.expiresAt ?? payload.expires_at);
  const organisationId = normalizeText(payload.organisationId);
  const requiredDocuments = Array.isArray(payload.requiredDocuments)
    ? payload.requiredDocuments
    : [];
  const sellerStructure = payload.sellerStructure || null;
  let supportEmail = normalizeText(payload.supportEmail);
  let supportPhone = normalizeText(payload.supportPhone);
  if (!onboardingLink) {
    return jsonResponse(400, {
      error: "Missing required field: onboardingLink",
    });
  }

  const supabase = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;
  const listingId = normalizeText(payload.listingId);
  if (portalDocumentsMode) {
    const guard = await verifySellerPortalInviteSetup(
      supabase,
      listingId,
      to,
    );
    if (!guard.ok) {
      return jsonResponse(guard.status || 500, {
        error: guard.error,
        code: guard.code,
      });
    }
  }
  let canonicalClientInvite: any = null;
  if (portalDocumentsMode && supabase) {
    canonicalClientInvite = await ensureCanonicalClientInvite(supabase, {
      email: to,
      clientRole: "seller",
      legacyPortalLink: legacyOnboardingLink,
      metadata: {
        source: "seller_portal_invitation",
        organisation_id: organisationId || null,
        listing_id: listingId || null,
        lead_id: normalizeText(payload.leadId) || null,
        seller_workspace_token:
          extractSellerPortalToken(legacyOnboardingLink) || null,
      },
    }).catch((inviteError) => {
      console.error(
        "[seller_onboarding] canonical seller invite creation failed",
        inviteError,
      );
      return null;
    });
  }

  let templateOverrides = null;
  let senderOrganisationName = organisationName;
  let senderOrganisationLogoUrl = payloadAgencyLogoUrl;
  const brandingPayload = payload as Record<string, unknown>;
  const [branding, resolvedTemplateOverrides] = await Promise.all([
    resolveEmailBranding({
      supabase: supabase || undefined,
      organisationId,
      rolloutMode: brandingPayload.brandingResolved === true ? "payload_only" : undefined,
      payload: {
        ...brandingPayload,
        organisationName: senderOrganisationName || organisationName,
        logoUrl: senderOrganisationLogoUrl,
        supportEmail,
        supportPhone,
      },
      defaults: {
        organisationName,
        logoUrl: payloadAgencyLogoUrl,
        supportEmail,
        supportPhone,
      },
    }),
    organisationId && supabase
      ? fetchOrganisationEmailTemplateOverride(
        supabase,
        organisationId,
        portalDocumentsMode ? "seller_portal_link" : "seller_onboarding",
      ).catch((error) => {
        console.error("[seller_onboarding] template override lookup failed", error);
        return null;
      })
      : Promise.resolve(null),
  ]);
  templateOverrides = resolvedTemplateOverrides;
  senderOrganisationName = branding.organisationName;
  senderOrganisationLogoUrl = branding.logoDarkUrl || branding.logoUrl ||
    branding.logoLightUrl || branding.logoIconUrl ||
    senderOrganisationLogoUrl;
  supportEmail = branding.supportEmail || supportEmail;
  supportPhone = branding.supportPhone || supportPhone;

  const sender = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <onboarding@resend.dev>",
    branding.fromName || branding.organisationName,
  );

  const subject = normalizeText(templateOverrides?.subject) ||
    buildSellerOnboardingSubject(
      propertyTitle,
      transactionReference,
      propertyType,
      emailKind,
    );
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
    expiryDays,
    expiresAt,
    requiredDocuments,
    sellerStructure,
    templateOverrides: templateOverrides || undefined,
    agentEmail,
    agentPhone,
    branding,
  });
  const text = buildSellerOnboardingEmailText({
    sellerName,
    propertyTitle,
    propertyType,
    transactionReference,
    onboardingLink,
    emailKind,
    agentName,
    agentEmail,
    agentPhone,
    organisationName: senderOrganisationName || organisationName,
    supportEmail,
    supportPhone,
    expiryDays,
    expiresAt,
    requiredDocuments,
    sellerStructure,
    templateOverrides: templateOverrides || undefined,
  });

  const communicationType = portalDocumentsMode
    ? "seller_portal_link_seller"
    : "seller_onboarding_link_seller";
  const delivery = await prepareEmailDelivery(
    payload as Record<string, unknown>,
    {
      communicationType,
      recipient: to,
      recipientRole: "seller",
      subject,
      messagePreview: text,
      context: {
        organisationId,
        leadId: normalizeText(payload.leadId),
        listingId,
        metadata: {
          emailKind,
          portalDocumentsMode,
          onboardingLink,
          canonicalInviteId: canonicalClientInvite?.inviteId || null,
          canonicalInviteToken: canonicalClientInvite?.token || null,
          canonicalInviteLink: canonicalClientInvite?.inviteLink || null,
          legacyOnboardingLink,
          expiryDays: expiryDays || null,
          expiresAt: expiresAt || null,
          agentEmail: agentEmail || null,
          agentPhone: agentPhone || null,
          emailPurpose: communicationType,
        },
      },
    },
  );

  const preparationMs = Math.max(0, Math.round(performance.now() - requestStartedAt));
  const resendStartedAt = performance.now();
  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    bcc: agentEmail,
    subject,
    html,
    text,
    timeoutMs: SELLER_ONBOARDING_RESEND_TIMEOUT_MS,
  });
  const resendSubmissionMs = Math.max(0, Math.round(performance.now() - resendStartedAt));

  if (!emailResult.ok) {
    const deliveryStartedAt = performance.now();
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage: emailResult.error?.message ||
        "Failed to send seller onboarding email.",
    });
    const deliveryPersistenceMs = Math.max(0, Math.round(performance.now() - deliveryStartedAt));
    const timings = {
      preparationMs,
      resendSubmissionMs,
      deliveryPersistenceMs,
      totalMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
    };
    console.info("[seller_onboarding] delivery timing", {
      organisationId: organisationId || null,
      listingId: listingId || null,
      status: "failed",
      ...timings,
    });
    return jsonResponse(500, {
      error: emailResult.error?.message ||
        "Failed to send seller onboarding email.",
      details: emailResult.error,
    });
  }

  const deliveryStartedAt = performance.now();
  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });
  const deliveryPersistenceMs = Math.max(0, Math.round(performance.now() - deliveryStartedAt));
  const timings = {
    preparationMs,
    resendSubmissionMs,
    deliveryPersistenceMs,
    totalMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
  };
  console.info("[seller_onboarding] delivery timing", {
    organisationId: organisationId || null,
    listingId: listingId || null,
    status: "sent",
    ...timings,
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
