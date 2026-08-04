import {
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
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
import type { SendOrganisationPartnerInvitationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function titleize(value: string) {
  return normalizeText(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function resolveFirstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function resolvePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : fallback;
}

function resolveExpiryDays(payload: SendOrganisationPartnerInvitationPayload) {
  const explicit = resolvePositiveInteger(
    payload.expiryDays ?? payload.expiry_days,
    0,
  );
  if (explicit > 0) return explicit;

  const expiresAt = resolveFirstText(payload.expiresAt, payload.expires_at);
  const expiresTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isFinite(expiresTime)) {
    const days = Math.ceil((expiresTime - Date.now()) / 86400000);
    return Math.max(days, 0);
  }

  return 14;
}

export async function handleOrganisationPartnerInvitationEmail(
  payload: SendOrganisationPartnerInvitationPayload,
) {
  const recipientEmail = normalizeText(payload.to).toLowerCase();
  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const invitationLink = normalizeText(
    payload.inviteUrl ?? payload.invite_url ??
      payload.invitationLink ?? payload.invitation_link,
  );
  if (!invitationLink) {
    return jsonResponse(400, { error: "Missing required field: invitationLink" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const fromOrganisation = resolveFirstText(
    payload.invitingOrganisationName,
    payload.inviting_organisation_name,
    payload.invitedByOrganisation,
    payload.invited_by_organisation,
  ) || "An Arch9 workspace";
  const partnerOrganisation = resolveFirstText(
    payload.partnerName,
    payload.partner_name,
    payload.partnerOrganisationName,
    payload.partner_organisation_name,
  ) || "your organisation";
  const partnerType = titleize(payload.partnerType ?? payload.partner_type ?? "partner");
  const relationshipType = payload.preferred === true
    ? "Preferred"
    : titleize(payload.relationshipType ?? payload.relationship_type ?? "approved");
  const scopeType = titleize(payload.scopeType ?? payload.scope_type ?? "organisation");
  const scopeName = normalizeText(payload.scopeName ?? payload.scope_name);
  const scopeLabel = resolveFirstText(
    payload.scopeLabel,
    payload.scope_label,
    scopeName ? `${scopeType}: ${scopeName}` : scopeType,
  );
  const expiryDays = resolveExpiryDays(payload);
  const supportEmail = resolveFirstText(
    payload.supportEmail,
    payload.support_email,
    Deno.env.get("BRIDGE_SUPPORT_EMAIL"),
    Deno.env.get("ARCH9_SUPPORT_EMAIL"),
  ) || "support@arch9.co.za";
  const supportPhone = resolveFirstText(
    payload.supportPhone,
    payload.support_phone,
    Deno.env.get("BRIDGE_SUPPORT_PHONE"),
    Deno.env.get("ARCH9_SUPPORT_PHONE"),
  ) || "+27 10 109 1315";
  const arch9Website = resolveFirstText(
    payload.arch9Website,
    payload.arch9_website,
    Deno.env.get("ARCH9_WEBSITE"),
  ) || "www.arch9.co.za";
  const invitingOrganisationLogoUrl = resolveFirstText(
    payload.invitingOrganisationLogoUrl,
    payload.inviting_organisation_logo_url,
    payload.invitedByOrganisationLogoUrl,
    payload.invited_by_organisation_logo_url,
  );
  const preferred = payload.preferred === true;
  const inviteMessage = normalizeText(payload.message);
  const recipientName = resolveFirstText(payload.recipientName, payload.recipient_name);
  const branding = await resolveEmailBranding({
    payload: {
      ...(payload as Record<string, unknown>),
      organisationName: fromOrganisation,
      organisationLogoUrl: invitingOrganisationLogoUrl,
      supportEmail,
      supportPhone,
      website: arch9Website,
    },
    organisationId: normalizeText(payload.organisationId ?? payload.organisation_id),
    defaults: {
      organisationName: fromOrganisation,
      logoUrl: invitingOrganisationLogoUrl,
      supportEmail,
      supportPhone,
      website: arch9Website,
    },
  });
  const from = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <no-reply@arch9.co.za>",
    branding.fromName || branding.organisationName,
  );
  const subject = `${fromOrganisation} invited you to review a company connection on Arch9`;
  const summary = `${fromOrganisation} has invited your organisation to connect on Arch9.`;

  const contentHtml = [
    renderBridgeIntroParagraphs([
      "You have been asked to review an organisation-level partner connection. Sign in as your company contact to connect your workspace and bring your team in when you are ready.",
      inviteMessage ? `Message from ${fromOrganisation}: ${inviteMessage}` : "",
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Invited By", value: fromOrganisation },
        { label: "Partner", value: partnerOrganisation },
        { label: "Partner Type", value: partnerType },
        { label: "Relationship", value: relationshipType },
        { label: "Scope", value: scopeLabel },
        { label: "Expires", value: `${expiryDays} days` },
      ],
      "Invitation Details",
    ),
    renderBridgeCta("Review Invitation", invitationLink, {
      primaryColor: branding.primaryColor,
    }),
    `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What accepting means</p>
       ${renderBridgeBullets([
      `Your organisation will be connected to ${fromOrganisation} as an approved partner.`,
      "Their authorised users may route relevant property transactions to your organisation.",
      "You can collaborate securely on shared transactions within Arch9.",
      "You can manage or remove this partnership at any time.",
    ])}
     </div>`,
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: summary,
    title: "Partner Invitation",
    greeting: recipientName ? `Hi ${recipientName},` : "Hi,",
    contentHtml,
    securityTitle: "Security And Privacy",
    securityBody:
      "This invitation can only be accepted by an authorised user in the invited workspace. No data is shared until the invitation is accepted.",
    helpBody:
      "If you were not expecting this invitation, please contact the organisation that sent it before accepting.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    supportWebsite: branding.website,
    branding,
  });

  const text = [
    "PARTNER INVITATION",
    "",
    recipientName ? `Hi ${recipientName},` : "",
    `${fromOrganisation} has invited your organisation to connect on Arch9.`,
    "You have been asked to review an organisation-level partner connection. Sign in as your company contact to connect your workspace and bring your team in when you are ready.",
    "",
    "Review invitation:",
    invitationLink,
    `This invitation expires in ${expiryDays} days.`,
    "",
    "About Arch9",
    "Arch9 is a secure property transaction platform that connects agencies, attorneys, bond originators, developers, buyers and sellers in one shared workspace.",
    "It helps each role player manage their part of the transaction while keeping permissions, documents and updates clearly separated.",
    "",
    "Invitation details",
    `Invited by: ${fromOrganisation}`,
    `Partner: ${partnerOrganisation}`,
    `Partner type: ${partnerType}`,
    `Relationship: ${relationshipType}`,
    `Scope: ${scopeLabel}`,
    "",
    "What accepting means",
    `Your organisation will be connected to ${fromOrganisation} as an approved partner.`,
    "Their authorised users may route relevant property transactions to your organisation.",
    "You can collaborate securely on shared transactions within Arch9.",
    "You can manage or remove this partnership at any time.",
    "",
    "Security and privacy",
    "This invitation can only be accepted by an authorised user in the invited workspace.",
    "No data is shared until the invitation is accepted.",
    "All data and conversations remain secure within Arch9.",
    "You can review the relationship scope before accepting.",
    "",
    "Need help?",
    "If you were not expecting this invitation, please contact the organisation that sent it before accepting.",
    inviteMessage ? `Message from ${fromOrganisation}: ${inviteMessage}` : "",
    "",
    "Questions?",
    `Contact our support team: ${supportEmail}${supportPhone ? ` | ${supportPhone}` : ""}`,
    `Arch9 Property Transaction Platform: ${arch9Website}`,
    `${fromOrganisation} | Powered by Arch9`,
  ].filter(Boolean).join("\n");

  const delivery = await prepareEmailDelivery(
    payload as Record<string, unknown>,
    {
      communicationType: "organisation_partner_invitation",
      recipient: recipientEmail,
      recipientRole: "partner",
      subject,
      messagePreview: text,
      context: {
        organisationId: normalizeText(
          payload.organisationId ?? payload.organisation_id,
        ),
        metadata: {
          partnerInvitationId: normalizeText(
            payload.invitationId ?? payload.invitation_id,
          ) || null,
          partnerType: normalizeText(
            payload.partnerType ?? payload.partner_type,
          ) || null,
          relationshipType,
          scopeType,
          scopeName: scopeName || null,
          scopeLabel,
          expiryDays,
        },
      },
    },
  );

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject,
    html,
    text,
  });

  if (!sendResult.ok) {
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage: sendResult.error?.message ||
        "Failed to send organisation partner invitation email.",
    });
    return jsonResponse(502, {
      error: "Resend rejected the organisation partner invitation email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: sendResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "organisation_partner_invitation",
    sent: true,
    deliveryId: delivery?.id || null,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
