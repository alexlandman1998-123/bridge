import { createClient } from "supabase";
import type { SendSellerOnboardingSubmittedPayload } from "../types.ts";
import {
  buildSellerOnboardingSubmittedEmailHtml,
  buildSellerOnboardingSubmittedEmailText,
  buildSellerOnboardingSubmittedSubject,
} from "../content/sellerOnboardingSubmitted.ts";
import { fetchOrganisationEmailTemplateOverride } from "../services/emailTemplateSettings.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
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
  fallbackName = "Arch9",
) {
  let senderOrganisationName = fallbackName;
  let senderOrganisationLogoUrl = "";
  let brandPrimaryColor = "";
  let brandAccentColor = "";
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

  let brandingQuery = await supabase
    .from("organisation_branding")
    .select("organisation_display_name, logo_light_url, logo_dark_url, primary_color, accent_color, primary_brand_color, accent_brand_color, theme_json")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (brandingQuery.error && isMissingColumnError(brandingQuery.error)) {
    brandingQuery = await supabase
      .from("organisation_branding")
      .select("organisation_display_name, logo_light_url, logo_dark_url, primary_brand_color, accent_brand_color")
      .eq("organisation_id", organisationId)
      .maybeSingle();
  }

  if (
    !brandingQuery.error ||
    isMissingTableError(brandingQuery.error, "organisation_branding") ||
    isMissingSchemaError(brandingQuery.error)
  ) {
    const theme = toRecord(brandingQuery.data?.theme_json);
    senderOrganisationName = normalizeText(brandingQuery.data?.organisation_display_name) || senderOrganisationName;
    senderOrganisationLogoUrl = normalizeText(brandingQuery.data?.logo_dark_url) ||
      normalizeText(brandingQuery.data?.logo_light_url) ||
      senderOrganisationLogoUrl;
    brandPrimaryColor = normalizeText(brandingQuery.data?.primary_color) ||
      normalizeText(brandingQuery.data?.primary_brand_color) ||
      normalizeText(theme.primaryColor) ||
      brandPrimaryColor;
    brandAccentColor = normalizeText(brandingQuery.data?.accent_color) ||
      normalizeText(brandingQuery.data?.accent_brand_color) ||
      normalizeText(theme.accentColor) ||
      brandAccentColor;
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
    senderOrganisationLogoUrl = normalizeText(branding.logoDark) ||
      normalizeText(branding.logoDarkUrl) ||
      normalizeText(branding.logoHighContrast) ||
      normalizeText(branding.logoHighContrastUrl) ||
      normalizeText(branding.logo_url) ||
      normalizeText(branding.logoUrl) ||
      normalizeText(branding.logoLight) ||
      normalizeText(branding.logoLightUrl) ||
      senderOrganisationLogoUrl;
    brandPrimaryColor = normalizeText(branding.primaryColor) ||
      normalizeText(branding.primaryColour) ||
      normalizeText(branding.brandPrimaryColor) ||
      normalizeText(toRecord(branding.brandColours).primary) ||
      brandPrimaryColor;
    brandAccentColor = normalizeText(branding.accentColor) ||
      normalizeText(branding.accentColour) ||
      normalizeText(toRecord(branding.brandColours).accent) ||
      brandAccentColor;
  } else if (settingsQuery.error) {
    console.error("[seller_onboarding_submitted] organisation settings lookup failed", settingsQuery.error);
  }

  return {
    senderOrganisationName,
    senderOrganisationLogoUrl,
    brandPrimaryColor,
    brandAccentColor,
    supportEmail,
    supportPhone,
  };
}

function normalizeEmail(value: unknown) {
  const email = normalizeText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function collectUnique(values: unknown[]) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

async function resolveAssignedAgentRecipient(
  supabase: any,
  payload: SendSellerOnboardingSubmittedPayload,
) {
  const explicitEmail = normalizeEmail(payload.to);
  const listingId = normalizeText(payload.listingId);
  const leadIds = collectUnique([payload.leadId]);
  const agentIds = collectUnique([payload.assignedAgentId]);
  const lookupContext = {
    hasExplicitEmail: Boolean(explicitEmail),
    listingId,
    leadIds,
    assignedAgentIds: agentIds,
  };

  if (explicitEmail) {
    return {
      email: explicitEmail,
      agentName: normalizeText(payload.agentName),
      resolvedBy: "payload.to",
      lookupContext,
    };
  }
  if (!supabase) {
    return {
      email: "",
      agentName: normalizeText(payload.agentName),
      resolvedBy: "",
      lookupContext: { ...lookupContext, serviceRoleConfigured: false },
    };
  }

  let resolvedAgentName = normalizeText(payload.agentName);

  if (listingId) {
    const listingQuery = await supabase
      .from("private_listings")
      .select("id, assigned_agent_email, assigned_agent_id, seller_lead_id, originating_crm_lead_id")
      .eq("id", listingId)
      .maybeSingle();

    if (!listingQuery.error || isMissingColumnError(listingQuery.error) || isMissingTableError(listingQuery.error, "private_listings")) {
      const listing = listingQuery.data || {};
      const listingEmail = normalizeEmail(listing.assigned_agent_email);
      if (listingEmail) {
        return {
          email: listingEmail,
          agentName: resolvedAgentName,
          resolvedBy: "private_listings.assigned_agent_email",
          lookupContext,
        };
      }
      leadIds.push(...collectUnique([listing.seller_lead_id, listing.originating_crm_lead_id]));
      agentIds.push(...collectUnique([listing.assigned_agent_id]));
    } else if (listingQuery.error) {
      console.error("[seller_onboarding_submitted] listing recipient lookup failed", listingQuery.error);
    }
  }

  for (const leadId of collectUnique(leadIds)) {
    const leadQuery = await supabase
      .from("leads")
      .select("lead_id, assigned_agent_email, assigned_agent_id")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (!leadQuery.error || isMissingColumnError(leadQuery.error) || isMissingTableError(leadQuery.error, "leads")) {
      const lead = leadQuery.data || {};
      const leadEmail = normalizeEmail(lead.assigned_agent_email);
      if (leadEmail) {
        return {
          email: leadEmail,
          agentName: resolvedAgentName,
          resolvedBy: "leads.assigned_agent_email",
          lookupContext: {
            ...lookupContext,
            leadIds: collectUnique(leadIds),
          },
        };
      }
      agentIds.push(...collectUnique([lead.assigned_agent_id]));
    } else if (leadQuery.error) {
      console.error("[seller_onboarding_submitted] lead recipient lookup failed", leadQuery.error);
    }
  }

  for (const agentId of collectUnique(agentIds)) {
    const profileQuery = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", agentId)
      .maybeSingle();

    if (!profileQuery.error || isMissingColumnError(profileQuery.error) || isMissingTableError(profileQuery.error, "profiles")) {
      const profile = profileQuery.data || {};
      const profileEmail = normalizeEmail(profile.email);
      if (!resolvedAgentName) resolvedAgentName = normalizeText(profile.full_name);
      if (profileEmail) {
        return {
          email: profileEmail,
          agentName: resolvedAgentName,
          resolvedBy: "profiles.email",
          lookupContext: {
            ...lookupContext,
            leadIds: collectUnique(leadIds),
            assignedAgentIds: collectUnique(agentIds),
          },
        };
      }
    } else if (profileQuery.error) {
      console.error("[seller_onboarding_submitted] profile recipient lookup failed", profileQuery.error);
    }
  }

  return {
    email: "",
    agentName: resolvedAgentName,
    resolvedBy: "",
    lookupContext: {
      ...lookupContext,
      leadIds: collectUnique(leadIds),
      assignedAgentIds: collectUnique(agentIds),
      serviceRoleConfigured: true,
    },
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

  const supabase = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;
  const recipient = await resolveAssignedAgentRecipient(supabase, payload);
  const to = recipient.email;
  if (!to) {
    console.error("[seller_onboarding_submitted] unable to resolve assigned agent email", recipient.lookupContext);
    return jsonResponse(400, {
      error: "Unable to resolve assigned agent email for seller onboarding submission.",
      lookupContext: recipient.lookupContext,
    });
  }
  console.info("[seller_onboarding_submitted] resolved assigned agent recipient", {
    resolvedBy: recipient.resolvedBy,
    listingId: payload.listingId || null,
    leadId: payload.leadId || null,
    assignedAgentId: payload.assignedAgentId || null,
  });

  const sellerName = normalizeText(payload.sellerName) || "Seller";
  const propertyTitle = normalizeText(payload.propertyTitle) || "property";
  const agentName = normalizeText(recipient.agentName || payload.agentName) || "Agent";
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
    "Arch9 <onboarding@resend.dev>";

  const organisationName =
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Arch9";
  let supportEmail =
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL"));
  let supportPhone =
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE"));
  let senderOrganisationName = organisationName;
  let senderOrganisationLogoUrl = "";
  let brandPrimaryColor = normalizeText(payload.brandPrimaryColor ?? payload.brand_primary_color);
  let brandAccentColor = normalizeText(payload.brandAccentColor ?? payload.brand_accent_color);
  let templateOverrides = null;

  if (organisationId && supabase) {
    try {
      const resolvedOrganisation = await resolveSenderOrganisationBranding(
        supabase,
        organisationId,
        organisationName,
      );
      senderOrganisationName = resolvedOrganisation.senderOrganisationName;
      senderOrganisationLogoUrl = resolvedOrganisation.senderOrganisationLogoUrl;
      brandPrimaryColor = resolvedOrganisation.brandPrimaryColor || brandPrimaryColor;
      brandAccentColor = resolvedOrganisation.brandAccentColor || brandAccentColor;
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
    brandPrimaryColor,
    brandAccentColor,
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

  const delivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
    communicationType: "seller_onboarding_submitted_agent",
    recipient: to,
    recipientRole: "agent",
    subject,
    messagePreview: text,
    context: {
      organisationId,
      leadId,
      listingId,
      assignedUserId: normalizeText(payload.assignedAgentId),
      metadata: {
        resolvedBy: recipient.resolvedBy,
        actionLink,
        transactionReference,
        emailPurpose: "seller_onboarding_submitted_agent",
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
        "Failed to send seller onboarding submitted email.",
    });
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send seller onboarding submitted email.",
      details: emailResult.error,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "seller_onboarding_submitted",
    emailId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
    resolvedBy: recipient.resolvedBy,
    actionLink,
    leadId: leadId || null,
    listingId: listingId || null,
  });
}
