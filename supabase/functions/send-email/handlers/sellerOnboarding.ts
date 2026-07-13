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

const SELLER_ONBOARDING_RESEND_TIMEOUT_MS = 45_000;
const SELLER_PORTAL_INVITE_BLOCKED_BEFORE_MANDATE_SIGNED_EVENT =
  "seller_portal_invite_blocked_before_mandate_signed";
const SELLER_PORTAL_INVITE_READY_AFTER_MANDATE_SIGNED_STATUS_KEYS = new Set([
  "active",
  "completed",
  "finalised",
  "finalized",
  "fully_signed",
  "live",
  "mandate_signed",
  "published",
  "signed",
  "signed_uploaded",
  "sold",
  "transaction_created",
  "under_offer",
  "uploaded_signed",
]);
const SELLER_PORTAL_INVITE_SIGNED_MANDATE_PACKET_STATUS_KEYS = new Set([
  "complete",
  "completed",
  "finalised",
  "finalized",
  "fully_signed",
  "mandate_signed",
  "signed",
  "signed_uploaded",
  "uploaded_signed",
]);

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStatusKey(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function listingHasSignedMandateSignal(listing: Record<string, unknown> | null) {
  if (!listing) return false;
  return [
    listing.mandate_status,
    listing.listing_status,
    listing.status,
  ].some((value) => SELLER_PORTAL_INVITE_READY_AFTER_MANDATE_SIGNED_STATUS_KEYS.has(normalizeStatusKey(value)));
}

function packetHasSignedMandateSignal(packet: Record<string, unknown> | null, versions: Record<string, unknown>[] = []) {
  if (packet && [
    packet.status,
    packet.state,
    packet.packet_status,
  ].some((value) => SELLER_PORTAL_INVITE_SIGNED_MANDATE_PACKET_STATUS_KEYS.has(normalizeStatusKey(value)))) {
    return true;
  }

  return versions.some((version) =>
    Boolean(
      normalizeText(version.final_signed_file_path) ||
        normalizeText(version.final_signed_file_url) ||
        normalizeText(version.final_signed_document_id) ||
        normalizeText(version.finalised_at) ||
        normalizeText(version.finalized_at),
    )
  );
}

async function listingLinkedPacketHasSignedMandateSignal(
  supabase: any,
  listing: Record<string, unknown>,
) {
  const packetId = normalizeText(listing.mandate_packet_id);
  if (!packetId) return false;

  const packetQuery = await supabase
    .from("document_packets")
    .select("id, status")
    .eq("id", packetId)
    .maybeSingle();
  if (packetQuery.error) {
    console.error("[seller_onboarding] seller portal invite packet guard lookup failed", packetQuery.error);
    return false;
  }

  const versionsQuery = await supabase
    .from("document_packet_versions")
    .select("id, packet_id, final_signed_file_path, final_signed_file_url, final_signed_document_id, finalised_at")
    .eq("packet_id", packetId)
    .order("version_number", { ascending: false })
    .limit(3);
  if (versionsQuery.error) {
    console.error("[seller_onboarding] seller portal invite packet version guard lookup failed", versionsQuery.error);
    return packetHasSignedMandateSignal(packetQuery.data || null, []);
  }

  return packetHasSignedMandateSignal(
    packetQuery.data || null,
    (versionsQuery.data || []) as Record<string, unknown>[],
  );
}

async function appendSellerPortalInviteGuardBlockedEvent(
  supabase: any,
  {
    listing,
    listingId,
    code,
    message,
  }: {
    listing: Record<string, unknown> | null;
    listingId: string;
    code: string;
    message: string;
  },
) {
  const packetId = normalizeText(listing?.mandate_packet_id);
  const organisationId = normalizeText(listing?.organisation_id);
  if (!supabase || !packetId || !organisationId) return;

  const nowIso = new Date().toISOString();
  const eventPayload = {
    activity_type: SELLER_PORTAL_INVITE_BLOCKED_BEFORE_MANDATE_SIGNED_EVENT,
    document_packet_id: packetId,
    document_packet_version_id: null,
    actor_role: "system",
    visibility: "internal",
    triggerSource: "send_email_seller_portal_guard",
    triggerReason: "mandate_not_signed",
    listingId: normalizeText(listing?.id) || listingId || null,
    listing_id: normalizeText(listing?.id) || listingId || null,
    mandateStatus: normalizeText(listing?.mandate_status) || null,
    listingStatus: normalizeText(listing?.listing_status) || null,
    status: normalizeText(listing?.status) || null,
    code,
    blockedAt: nowIso,
    message,
    created_at: nowIso,
    metadata: {},
  };

  const insert = await supabase.from("document_packet_events").insert({
    packet_id: packetId,
    organisation_id: organisationId,
    version_id: null,
    event_type: SELLER_PORTAL_INVITE_BLOCKED_BEFORE_MANDATE_SIGNED_EVENT,
    event_payload_json: eventPayload,
    created_by: null,
    created_at: nowIso,
  });
  if (insert.error) {
    console.error("[seller_onboarding] seller portal invite blocked event insert failed", insert.error);
  }
}

async function verifySellerPortalInviteAfterSignedMandate(
  supabase: any,
  listingId: string,
) {
  if (!supabase) {
    return {
      ok: false,
      status: 500,
      error: "Supabase service role is required before sending seller portal password setup links.",
      code: "seller_portal_invite_guard_unavailable",
    };
  }
  if (!listingId) {
    return {
      ok: false,
      status: 400,
      error: "Listing id is required before sending seller portal password setup links.",
      code: "seller_portal_invite_listing_required",
    };
  }

  const query = await supabase
    .from("private_listings")
    .select("id, organisation_id, mandate_status, listing_status, status, mandate_packet_id")
    .eq("id", listingId)
    .maybeSingle();

  if (query.error) {
    console.error("[seller_onboarding] seller portal invite mandate guard failed", query.error);
    return {
      ok: false,
      status: 500,
      error: query.error.message || "Unable to verify signed mandate before sending seller portal link.",
      code: "seller_portal_invite_guard_failed",
    };
  }

  const listing = query.data || null;
  const hasSignedMandateSignal = listingHasSignedMandateSignal(listing) ||
    (listing ? await listingLinkedPacketHasSignedMandateSignal(supabase, listing) : false);

  if (!hasSignedMandateSignal) {
    const code = "seller_portal_invite_requires_signed_mandate";
    const error = "Seller portal password setup links are sent only after the seller mandate is signed.";
    await appendSellerPortalInviteGuardBlockedEvent(supabase, {
      listing,
      listingId,
      code,
      message: error,
    });
    return {
      ok: false,
      status: 409,
      error,
      code,
    };
  }

  return { ok: true };
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
    senderOrganisationLogoUrl = normalizeText(brandingQuery.data?.logo_dark_url) ||
      normalizeText(brandingQuery.data?.logo_light_url) ||
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
    senderOrganisationLogoUrl = normalizeText(branding.logoDark) ||
      normalizeText(branding.logoDarkUrl) ||
      normalizeText(branding.logoHighContrast) ||
      normalizeText(branding.logoHighContrastUrl) ||
      normalizeText(branding.logo_url) ||
      normalizeText(branding.logoUrl) ||
      normalizeText(branding.logoLight) ||
      normalizeText(branding.logoLightUrl) ||
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
    ? normalizeText(payload.portalLink) ||
      normalizeText(payload.onboardingUrl ?? payload.onboarding_url) ||
      normalizeText(payload.onboardingLink)
    : normalizeText(payload.onboardingUrl ?? payload.onboarding_url) ||
      normalizeText(payload.onboardingLink);
  const legacyOnboardingLink = onboardingLink;
  const agentName = normalizeText(payload.agentName);
  const agentEmail = normalizeText(payload.agentEmail ?? payload.agent_email);
  const agentPhone = normalizeText(payload.agentPhone ?? payload.agent_phone);
  const organisationName = normalizeText(payload.agencyName ?? payload.agency_name) ||
    normalizeText(payload.organisationName) ||
    "Arch9";
  const payloadAgencyLogoUrl = normalizeText(
    payload.agencyLogoUrl ?? payload.agency_logo_url ??
      payload.agencyLogo ?? payload.agency_logo,
  );
  const expiryDays = normalizeText(payload.expiryDays ?? payload.expiry_days);
  const expiresAt = normalizeText(payload.expiresAt ?? payload.expires_at);
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
  const listingId = normalizeText(payload.listingId);
  if (portalDocumentsMode) {
    const guard = await verifySellerPortalInviteAfterSignedMandate(supabase, listingId);
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
        source: "seller_portal_documents_ready",
        organisation_id: organisationId || null,
        listing_id: listingId || null,
        lead_id: normalizeText(payload.leadId) || null,
        seller_workspace_token: extractSellerPortalToken(legacyOnboardingLink) || null,
      },
    }).catch((inviteError) => {
      console.error("[seller_onboarding] canonical seller invite creation failed", inviteError);
      return null;
    });
  }

  let templateOverrides = null;
  let senderOrganisationName = organisationName;
  let senderOrganisationLogoUrl = payloadAgencyLogoUrl;
  if (organisationId && supabase) {
    try {
      const resolvedOrganisation = await resolveSenderOrganisationBranding(
        supabase,
        organisationId,
        organisationName,
      );
      senderOrganisationName = resolvedOrganisation.senderOrganisationName;
      senderOrganisationLogoUrl = resolvedOrganisation.senderOrganisationLogoUrl ||
        senderOrganisationLogoUrl;
      if (!supportEmail) {
        supportEmail = resolvedOrganisation.supportEmail;
      }
      if (!supportPhone) {
        supportPhone = resolvedOrganisation.supportPhone;
      }
      templateOverrides = await fetchOrganisationEmailTemplateOverride(
        supabase,
        organisationId,
        portalDocumentsMode ? "seller_portal_link" : "seller_onboarding",
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
    expiryDays,
    expiresAt,
    templateOverrides: templateOverrides || undefined,
    agentEmail,
    agentPhone,
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
  });

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
    timeoutMs: SELLER_ONBOARDING_RESEND_TIMEOUT_MS,
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
