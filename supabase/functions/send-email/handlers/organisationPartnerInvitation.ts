import {
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
import { sendViaResendApi } from "../services/resend.ts";
import type { SendOrganisationPartnerInvitationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function titleize(value: string) {
  return normalizeText(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function handleOrganisationPartnerInvitationEmail(
  payload: SendOrganisationPartnerInvitationPayload,
) {
  const recipientEmail = normalizeText(payload.to).toLowerCase();
  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const invitationLink = normalizeText(payload.invitationLink ?? payload.invitation_link);
  if (!invitationLink) {
    return jsonResponse(400, { error: "Missing required field: invitationLink" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const fromOrganisation = normalizeText(payload.invitedByOrganisation ?? payload.invited_by_organisation) || "An Arch9 workspace";
  const partnerOrganisation = normalizeText(payload.partnerOrganisationName ?? payload.partner_organisation_name) || "your organisation";
  const partnerType = titleize(payload.partnerType ?? payload.partner_type ?? "partner");
  const relationshipType = titleize(payload.relationshipType ?? payload.relationship_type ?? "approved");
  const scopeType = titleize(payload.scopeType ?? payload.scope_type ?? "organisation");
  const scopeName = normalizeText(payload.scopeName ?? payload.scope_name);
  const preferred = payload.preferred === true;
  const inviteMessage = normalizeText(payload.message);
  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  const subject = `${fromOrganisation} invited you to connect on Arch9`;
  const summary = `${fromOrganisation} has invited ${partnerOrganisation} to connect as an Arch9 partner.`;

  const introParagraphs = [
    summary,
    "Open the invitation in Arch9 to review the relationship scope and accept or decline the connection.",
    preferred
      ? "This invite is marked as a preferred partner relationship."
      : "Once accepted, both organisations can use this relationship for partner coordination.",
    inviteMessage ? `Message from ${fromOrganisation}: ${inviteMessage}` : "",
  ].filter(Boolean);

  const html = renderBridgeEmailLayout({
    preheader: summary,
    title: "Partner invitation",
    greeting: "Hi there,",
    contentHtml: [
      renderBridgeIntroParagraphs(introParagraphs),
      renderBridgeSummaryCard([
        { label: "Invited By", value: fromOrganisation },
        { label: "Partner", value: partnerOrganisation },
        { label: "Partner Type", value: partnerType },
        { label: "Relationship", value: relationshipType },
        { label: "Scope", value: scopeName ? `${scopeType}: ${scopeName}` : scopeType },
      ], "Invitation Details"),
      renderBridgeCta("Review Partner Invite", invitationLink),
    ].join(""),
    securityBody:
      "This invitation only creates a partner relationship after it is accepted by an authorised user in the invited workspace.",
    helpBody:
      "If you were not expecting this invitation, contact the organisation that sent it before accepting.",
    organisationName: fromOrganisation,
  });

  const text = [
    "Hi there,",
    "",
    summary,
    "Open the invitation in Arch9 to review and respond.",
    preferred ? "This invite is marked as a preferred partner relationship." : "",
    inviteMessage ? `Message from ${fromOrganisation}: ${inviteMessage}` : "",
    `Partner type: ${partnerType}`,
    `Relationship: ${relationshipType}`,
    `Scope: ${scopeName ? `${scopeType}: ${scopeName}` : scopeType}`,
    `Review invite: ${invitationLink}`,
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
