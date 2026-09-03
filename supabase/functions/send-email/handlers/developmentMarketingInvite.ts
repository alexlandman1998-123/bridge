import type { SendDevelopmentMarketingInvitePayload } from "../types.ts";
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
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleDevelopmentMarketingInviteEmail(
  payload: SendDevelopmentMarketingInvitePayload,
) {
  const to = normalizeText(payload.to).toLowerCase();
  const inviteLink = normalizeText(payload.inviteLink || payload.invite_link);
  if (!to) return jsonResponse(400, { error: "Missing required field: to" });
  if (!inviteLink) {
    return jsonResponse(400, { error: "Missing required field: inviteLink" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const developmentName =
    normalizeText(payload.developmentName || payload.development_name) ||
    "this development";
  const accessRole =
    normalizeText(payload.accessRole || payload.access_role).replaceAll(
      "_",
      " ",
    ) || "viewer";
  const inviteeName =
    normalizeText(payload.inviteeName || payload.invitee_name) || "there";
  const inviterName =
    normalizeText(payload.inviterName || payload.inviter_name) ||
    "the development team";
  const rawPayload = payload as Record<string, unknown>;
  const branding = await resolveEmailBranding({
    payload: rawPayload,
    organisationId: normalizeText(
      payload.organisationId || payload.organisation_id,
    ),
    defaults: {
      organisationName:
        normalizeText(payload.organisationName || payload.organisation_name) ||
        "Arch9",
      logoUrl: normalizeText(
        payload.organisationLogoUrl || payload.organisation_logo_url,
      ),
      supportEmail:
        normalizeText(payload.supportEmail || payload.support_email) ||
        "support@arch9.co.za",
    },
  });
  const subject = `Marketing Hub invitation for ${developmentName}`;
  const text =
    `Hi ${inviteeName}, ${inviterName} invited you to the Marketing Hub for ${developmentName} on Arch9 as a ${accessRole}. This access is limited to approved marketing material and does not include transactions, finance or operational development data. Accept the invite: ${inviteLink}`;
  const html = renderBridgeEmailLayout({
    preheader: `Marketing Hub access for ${developmentName}`,
    title: `You're invited to the Marketing Hub`,
    greeting: `Hi ${inviteeName},`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        `${inviterName} invited you to collaborate on approved marketing material for ${developmentName}.`,
        "This invitation does not provide transaction, finance, inventory, or operational development access.",
      ]),
      renderBridgeSummaryCard([
        { label: "Development", value: developmentName },
        { label: "Marketing access", value: accessRole },
      ], "Marketing Hub access"),
      renderBridgeCta("Accept marketing invitation", inviteLink, {
        primaryColor: branding.primaryColor,
      }),
    ].join(""),
    securityTitle: "Scoped marketing access",
    securityBody:
      "Use the invited email address to accept this link. If you were not expecting it, you can safely ignore this email.",
    helpBody:
      "Need help? Reply to this email and our team will help you get set up.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
  const delivery = await prepareEmailDelivery(rawPayload, {
    communicationType: "development_marketing_invite",
    recipient: to,
    recipientRole: "marketing_partner",
    subject,
    messagePreview: text,
    context: {
      organisationId: normalizeText(
        payload.organisationId || payload.organisation_id,
      ),
      metadata: { developmentName, accessRole, inviteLink },
    },
  });
  const result = await sendViaResendApi({
    apiKey: resendApiKey,
    from: formatEmailSender(
      normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
        "Arch9 <no-reply@arch9.co.za>",
      branding.fromName || branding.organisationName,
    ),
    to,
    subject,
    html,
    text,
  });
  if (!result.ok) {
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage: result.error?.message ||
        "Failed to send marketing invitation.",
    });
    return jsonResponse(500, {
      error: result.error?.message || "Failed to send marketing invitation.",
    });
  }
  await markEmailDeliverySent(delivery?.id || "", {
    emailId: result.data?.id || null,
  });
  return jsonResponse(200, {
    ok: true,
    type: "development_marketing_invite",
    emailId: result.data?.id || null,
    deliveryId: delivery?.id || null,
  });
}
