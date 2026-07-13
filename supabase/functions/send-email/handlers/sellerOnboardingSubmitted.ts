import { createClient } from "supabase";
import type { SendSellerOnboardingSubmittedPayload } from "../types.ts";
import {
  buildSellerOnboardingSubmittedEmailHtml,
  buildSellerOnboardingSubmittedEmailText,
  buildSellerOnboardingSubmittedSellerEmailHtml,
  buildSellerOnboardingSubmittedSellerEmailText,
  buildSellerOnboardingSubmittedSellerSubject,
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

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value).toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
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
    senderOrganisationLogoUrl = normalizeText(brandingQuery.data?.logo_dark_url) ||
      normalizeText(brandingQuery.data?.logo_light_url) ||
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
    console.error("[seller_onboarding_submitted] organisation settings lookup failed", settingsQuery.error);
  }

  return {
    senderOrganisationName,
    senderOrganisationLogoUrl,
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

function normalizeUuidLike(value: unknown) {
  const normalized = normalizeText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function resolveSellerPortalLink(req: Request, payload: SendSellerOnboardingSubmittedPayload) {
  const explicitLink = normalizeText(
    payload.sellerPortalLink ??
      payload.seller_portal_link ??
      payload.portalLink,
  );
  if (explicitLink) return explicitLink;

  const token = normalizeText(payload.sellerPortalToken ?? payload.seller_portal_token);
  if (!token) return "";

  const appBaseUrl = resolveAppBaseUrl(req) || "https://app.arch9.co.za";
  return `${appBaseUrl.replace(/\/+$/, "")}/client/${encodeURIComponent(token)}/selling`;
}

type InternalRecipient = {
  email: string;
  name: string;
  role: "agent" | "principal";
  resolvedBy: string;
  userId?: string;
};

type ProfileRecipient = {
  email: string;
  fullName: string;
};

function addInternalRecipient(
  recipients: InternalRecipient[],
  candidate: Partial<InternalRecipient> & { email?: string },
) {
  const email = normalizeEmail(candidate.email);
  if (!email) return;
  if (recipients.some((recipient) => recipient.email === email)) return;
  recipients.push({
    email,
    name: normalizeText(candidate.name),
    role: candidate.role === "principal" ? "principal" : "agent",
    resolvedBy: normalizeText(candidate.resolvedBy) || "unknown",
    userId: normalizeUuidLike(candidate.userId),
  });
}

function isActiveMembershipStatus(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return !normalized || ["active", "accepted"].includes(normalized);
}

function isPrincipalLikeRole(value: unknown) {
  return [
    "owner",
    "principal",
    "director",
    "partner",
    "admin",
    "admin_staff",
    "branch_manager",
    "manager",
    "hq_manager",
    "super_admin",
  ].includes(normalizeText(value).toLowerCase());
}

async function fetchProfilesByIds(supabase: any, userIds: string[]): Promise<Map<string, ProfileRecipient>> {
  const ids = collectUnique(userIds).map(normalizeUuidLike).filter(Boolean);
  if (!ids.length) return new Map<string, ProfileRecipient>();

  const query = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ids);

  if (query.error) {
    console.error("[seller_onboarding_submitted] profile recipient list lookup failed", query.error);
    return new Map<string, ProfileRecipient>();
  }

  return new Map((Array.isArray(query.data) ? query.data : []).map((profile: any) => [
    normalizeText(profile.id),
    {
      email: normalizeEmail(profile.email),
      fullName: normalizeText(profile.full_name),
    },
  ]));
}

async function fetchOrganisationPrincipalRecipients(
  supabase: any,
  organisationId: string,
) {
  const orgId = normalizeUuidLike(organisationId);
  if (!supabase || !orgId) return [];

  const selectCandidates = [
    "user_id, email, role, workspace_role, organisation_role, organization_role, status",
    "user_id, email, role, workspace_role, organisation_role, status",
    "user_id, email, role, status",
  ];

  let rows: any[] = [];
  for (const selectClause of selectCandidates) {
    const query = await supabase
      .from("organisation_users")
      .select(selectClause)
      .eq("organisation_id", orgId)
      .limit(20);

    if (!query.error) {
      rows = Array.isArray(query.data) ? query.data : [];
      break;
    }

    if (isMissingColumnError(query.error) || isMissingTableError(query.error, "organisation_users")) {
      continue;
    }

    console.error("[seller_onboarding_submitted] organisation principal recipient lookup failed", query.error);
    break;
  }

  const principalRows = rows.filter((row) => {
    const role = row.workspace_role || row.organisation_role || row.organization_role || row.role;
    return isActiveMembershipStatus(row.status) && isPrincipalLikeRole(role);
  });
  const profileById = await fetchProfilesByIds(
    supabase,
    principalRows.map((row) => row.user_id),
  );
  const recipients: InternalRecipient[] = [];

  for (const row of principalRows) {
    const userId = normalizeUuidLike(row.user_id);
    const profile = userId ? profileById.get(userId) : null;
    addInternalRecipient(recipients, {
      email: normalizeEmail(row.email) || profile?.email || "",
      name: profile?.fullName || "",
      role: "principal",
      resolvedBy: "organisation_users.principal_admin",
      userId,
    });
  }

  return recipients;
}

async function resolveInternalNotificationRecipients(
  supabase: any,
  payload: SendSellerOnboardingSubmittedPayload,
) {
  const recipients: InternalRecipient[] = [];
  const leadIds = collectUnique([payload.leadId]);
  const agentIds = collectUnique([payload.assignedAgentId]).map(normalizeUuidLike).filter(Boolean);
  const organisationIds = collectUnique([payload.organisationId]).map(normalizeUuidLike).filter(Boolean);
  const listingId = normalizeUuidLike(payload.listingId);
  let resolvedAgentName = normalizeText(payload.agentName);

  addInternalRecipient(recipients, {
    email: normalizeEmail(payload.to) || normalizeEmail(payload.agentEmail) || normalizeEmail(payload.assignedAgentEmail),
    name: resolvedAgentName,
    role: "agent",
    resolvedBy: normalizeEmail(payload.to) ? "payload.to" : "payload.agentEmail",
    userId: payload.assignedAgentId,
  });

  if (!supabase) {
    return {
      recipients,
      lookupContext: {
        serviceRoleConfigured: false,
        listingId,
        leadIds,
        assignedAgentIds: agentIds,
        organisationIds,
      },
    };
  }

  if (listingId) {
    const listingQuery = await supabase
      .from("private_listings")
      .select("id, organisation_id, assigned_agent_email, assigned_agent_id, seller_lead_id, originating_crm_lead_id")
      .eq("id", listingId)
      .maybeSingle();

    if (!listingQuery.error || isMissingTableError(listingQuery.error, "private_listings")) {
      const listing = listingQuery.data || {};
      if (listing.organisation_id) organisationIds.push(normalizeUuidLike(listing.organisation_id));
      if (listing.seller_lead_id || listing.originating_crm_lead_id) {
        leadIds.push(...collectUnique([listing.seller_lead_id, listing.originating_crm_lead_id]));
      }
      if (listing.assigned_agent_id) agentIds.push(normalizeUuidLike(listing.assigned_agent_id));
      addInternalRecipient(recipients, {
        email: listing.assigned_agent_email,
        name: resolvedAgentName,
        role: "agent",
        resolvedBy: "private_listings.assigned_agent_email",
        userId: listing.assigned_agent_id,
      });
    } else if (listingQuery.error) {
      console.error("[seller_onboarding_submitted] listing recipient lookup failed", listingQuery.error);
    }
  }

  for (const leadId of collectUnique(leadIds)) {
    const leadQuery = await supabase
      .from("leads")
      .select("lead_id, organisation_id, assigned_agent_email, assigned_agent_id")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (!leadQuery.error || isMissingTableError(leadQuery.error, "leads")) {
      const lead = leadQuery.data || {};
      if (lead.organisation_id) organisationIds.push(normalizeUuidLike(lead.organisation_id));
      if (lead.assigned_agent_id) agentIds.push(normalizeUuidLike(lead.assigned_agent_id));
      addInternalRecipient(recipients, {
        email: lead.assigned_agent_email,
        name: resolvedAgentName,
        role: "agent",
        resolvedBy: "leads.assigned_agent_email",
        userId: lead.assigned_agent_id,
      });
    } else if (leadQuery.error) {
      console.error("[seller_onboarding_submitted] lead recipient lookup failed", leadQuery.error);
    }
  }

  const profileById = await fetchProfilesByIds(supabase, agentIds);
  for (const agentId of collectUnique(agentIds)) {
    const profile = profileById.get(agentId);
    if (!resolvedAgentName) resolvedAgentName = profile?.fullName || "";
    addInternalRecipient(recipients, {
      email: profile?.email || "",
      name: resolvedAgentName || profile?.fullName || "",
      role: "agent",
      resolvedBy: "profiles.email",
      userId: agentId,
    });
  }

  for (const organisationId of collectUnique(organisationIds)) {
    const principalRecipients = await fetchOrganisationPrincipalRecipients(supabase, organisationId);
    for (const recipient of principalRecipients) {
      addInternalRecipient(recipients, recipient);
    }
  }

  return {
    recipients,
    lookupContext: {
      serviceRoleConfigured: true,
      listingId,
      leadIds: collectUnique(leadIds),
      assignedAgentIds: collectUnique(agentIds),
      organisationIds: collectUnique(organisationIds),
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
  const internalResolution = await resolveInternalNotificationRecipients(supabase, payload);
  const internalRecipients = internalResolution.recipients;

  const sellerName = normalizeText(payload.sellerName) || "Seller";
  const propertyTitle = normalizeText(payload.propertyTitle) || "property";
  const agentName = normalizeText(payload.agentName) || "Agent";
  const transactionReference = normalizeText(payload.transactionReference);
  const lookupContext = internalResolution.lookupContext as Record<string, unknown>;
  const resolvedOrganisationIds = Array.isArray(lookupContext.organisationIds)
    ? lookupContext.organisationIds.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const organisationId = normalizeText(payload.organisationId) || resolvedOrganisationIds[0] || "";
  const leadId = normalizeText(payload.leadId);
  const listingId = normalizeText(payload.listingId);
  const sellerEmail = normalizeEmail(payload.sellerEmail ?? payload.seller_email);
  const sellerPortalInvitePolicy = normalizeText(
    payload.sellerPortalInvitePolicy ??
      payload.seller_portal_invite_policy,
  ).toLowerCase();
  const deferSellerPortalLinkUntilMandateSigned =
    normalizeBoolean(
      payload.deferSellerPortalLinkUntilMandateSigned ??
        payload.defer_seller_portal_link_until_mandate_signed,
    ) || sellerPortalInvitePolicy === "after_mandate_signed";
  const sellerPortalLink = deferSellerPortalLinkUntilMandateSigned ? "" : resolveSellerPortalLink(req, payload);
  const requestedActionLink = normalizeText(payload.actionLink);
  const appBaseUrl = resolveAppBaseUrl(req);
  const actionLink = requestedActionLink ||
    (appBaseUrl && leadId ? `${appBaseUrl}/pipeline/leads/${encodeURIComponent(leadId)}/legal/mandate` : "");

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";

  const organisationName =
    normalizeText(payload.organisationName) ||
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

  const internalSubject =
    normalizeText(templateOverrides?.subject) ||
    buildSellerOnboardingSubmittedSubject(propertyTitle);

  const sent: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  if (!internalRecipients.length) {
    console.error("[seller_onboarding_submitted] unable to resolve internal recipients", internalResolution.lookupContext);
    skipped.push({
      target: "internal",
      reason: "no_internal_recipient",
      lookupContext: internalResolution.lookupContext,
    });
  }

  for (const recipient of internalRecipients) {
    const recipientName = normalizeText(recipient.name) || agentName || "there";
    const internalHtml = buildSellerOnboardingSubmittedEmailHtml({
      sellerName,
      propertyTitle,
      transactionReference,
      agentName: recipientName,
      actionLink,
      organisationName: senderOrganisationName || organisationName,
      senderOrganisationName,
      senderOrganisationLogoUrl,
      supportEmail,
      supportPhone,
      templateOverrides: templateOverrides || undefined,
    });
    const internalText = buildSellerOnboardingSubmittedEmailText({
      sellerName,
      propertyTitle,
      transactionReference,
      agentName: recipientName,
      actionLink,
      organisationName: senderOrganisationName || organisationName,
    });

    const delivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
      communicationType: "seller_onboarding_submitted_agent",
      recipient: recipient.email,
      recipientRole: recipient.role,
      subject: internalSubject,
      messagePreview: internalText,
      context: {
        organisationId,
        leadId,
        listingId,
        assignedUserId: recipient.userId || normalizeText(payload.assignedAgentId),
        metadata: {
          resolvedBy: recipient.resolvedBy,
          actionLink,
          transactionReference,
          emailPurpose: "seller_onboarding_submitted_agent",
          recipientRole: recipient.role,
        },
      },
    });

    const emailResult = await sendViaResendApi({
      apiKey: resendApiKey,
      from: sender,
      to: recipient.email,
      subject: internalSubject,
      html: internalHtml,
      text: internalText,
    });

    if (!emailResult.ok) {
      await markEmailDeliveryFailed(delivery?.id || "", {
        errorMessage:
          emailResult.error?.message ||
          "Failed to send seller onboarding submitted email.",
      });
      failed.push({
        target: "internal",
        recipient: recipient.email,
        role: recipient.role,
        error: emailResult.error,
      });
      continue;
    }

    await markEmailDeliverySent(delivery?.id || "", {
      emailId: emailResult.data?.id || null,
    });
    sent.push({
      target: "internal",
      recipient: recipient.email,
      role: recipient.role,
      emailId: emailResult.data?.id || null,
      deliveryId: delivery?.id || null,
      resolvedBy: recipient.resolvedBy,
    });
  }

  if (!sellerEmail || !sellerPortalLink) {
    skipped.push({
      target: "seller",
      reason: !sellerEmail
        ? "missing_seller_email"
        : deferSellerPortalLinkUntilMandateSigned
          ? "seller_portal_link_deferred_until_mandate_signed"
          : "missing_seller_portal_link",
    });
  } else {
    const sellerSubject = buildSellerOnboardingSubmittedSellerSubject(propertyTitle);
    const sellerHtml = buildSellerOnboardingSubmittedSellerEmailHtml({
      sellerName,
      propertyTitle,
      portalLink: sellerPortalLink,
      agentName,
      organisationName: senderOrganisationName || organisationName,
      senderOrganisationName,
      senderOrganisationLogoUrl,
      supportEmail,
      supportPhone,
    });
    const sellerText = buildSellerOnboardingSubmittedSellerEmailText({
      sellerName,
      propertyTitle,
      portalLink: sellerPortalLink,
      agentName,
      organisationName: senderOrganisationName || organisationName,
    });

    const sellerDelivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
      communicationType: "seller_onboarding_submitted_seller",
      recipient: sellerEmail,
      recipientRole: "seller",
      subject: sellerSubject,
      messagePreview: sellerText,
      context: {
        organisationId,
        leadId,
        listingId,
        metadata: {
          sellerPortalLink,
          transactionReference,
          emailPurpose: "seller_onboarding_submitted_seller",
        },
      },
    });

    const sellerResult = await sendViaResendApi({
      apiKey: resendApiKey,
      from: sender,
      to: sellerEmail,
      subject: sellerSubject,
      html: sellerHtml,
      text: sellerText,
    });

    if (!sellerResult.ok) {
      await markEmailDeliveryFailed(sellerDelivery?.id || "", {
        errorMessage:
          sellerResult.error?.message ||
          "Failed to send seller onboarding confirmation email.",
      });
      failed.push({
        target: "seller",
        recipient: sellerEmail,
        error: sellerResult.error,
      });
    } else {
      await markEmailDeliverySent(sellerDelivery?.id || "", {
        emailId: sellerResult.data?.id || null,
      });
      sent.push({
        target: "seller",
        recipient: sellerEmail,
        emailId: sellerResult.data?.id || null,
        deliveryId: sellerDelivery?.id || null,
      });
    }
  }

  if (!sent.length && failed.length) {
    return jsonResponse(500, {
      error: "Failed to send seller onboarding submission notifications.",
      failed,
      skipped,
    });
  }

  if (!sent.length) {
    return jsonResponse(400, {
      error: "No seller onboarding submission notification recipients were available.",
      skipped,
      lookupContext: internalResolution.lookupContext,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_onboarding_submitted",
    sent,
    failed,
    skipped,
    actionLink,
    leadId: leadId || null,
    listingId: listingId || null,
    sellerPortalLink: sellerPortalLink || null,
    sellerPortalInvitePolicy: deferSellerPortalLinkUntilMandateSigned
      ? "after_mandate_signed"
      : sellerPortalInvitePolicy || null,
  });
}
