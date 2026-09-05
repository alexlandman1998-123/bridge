import type { SendWorkspaceInvitePayload } from "../types.ts";
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

export async function handleWorkspaceInviteEmail(
  payload: SendWorkspaceInvitePayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to).toLowerCase();
  const inviteLink = normalizeText(
    payload.inviteLink || payload.invite_link || payload.onboardingLink ||
      payload.onboarding_link,
  );
  if (!to) return jsonResponse(400, { error: "Missing required field: to" });
  if (!inviteLink) {
    return jsonResponse(400, { error: "Missing required field: inviteLink" });
  }

  const organisationName =
    normalizeText(payload.organisationName || payload.organisation_name) ||
    "Arch9 workspace";
  const inviteeName = normalizeText(
    payload.inviteeName || payload.invitee_name || payload.agentName ||
      payload.agent_name,
  ) || "there";
  const inviterName =
    normalizeText(payload.inviterName || payload.inviter_name) ||
    "your workspace admin";
  const workspaceRole =
    normalizeText(payload.workspaceRole || payload.workspace_role).replaceAll(
      "_",
      " ",
    ) || "team member";
  const supportEmail = normalizeText(
    payload.supportEmail || payload.support_email,
  );
  const rawPayload = payload as Record<string, unknown>;
  const branding = await resolveEmailBranding({
    payload: rawPayload,
    organisationId: normalizeText(
      rawPayload.organisationId || rawPayload.organisation_id,
    ),
    defaults: {
      organisationName,
      supportEmail,
      logoUrl: normalizeText(
        payload.organisationLogoUrl || payload.organisation_logo_url ||
          payload.organisationLogoIconUrl || payload.organisation_logo_icon_url,
      ),
      primaryColor: normalizeText(
        payload.brandPrimaryColor || payload.brand_primary_color,
      ),
    },
  });
  const sender = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <onboarding@resend.dev>",
    branding.fromName || branding.organisationName,
  );
  const contentHtml = [
    renderBridgeIntroParagraphs([
      `${inviterName} invited you to create or connect your Arch9 account and enter the ${branding.organisationName} workspace.`,
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Workspace", value: branding.organisationName },
        { label: "Access Level", value: workspaceRole },
      ],
      "Workspace invitation",
    ),
    renderBridgeCta("Accept invite", inviteLink, {
      primaryColor: branding.primaryColor,
    }),
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader:
      `${inviterName} invited you to join ${branding.organisationName} on Arch9.`,
    title: `Workspace invitation: join ${branding.organisationName}`,
    greeting: `Hi ${inviteeName},`,
    contentHtml,
    securityTitle: "Secure Workspace Invitation",
    securityBody:
      "This invitation gives access only to the workspace and role shown above. If you were not expecting it, you can ignore this email.",
    helpBody:
      "Need help? Reply to this email and our team will help you get set up.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
  const subject = `You're invited to join ${organisationName} on Arch9`;
  const text =
    `Hi ${inviteeName}, ${inviterName} invited you to join ${organisationName} on Arch9 as ${workspaceRole}. Accept the invite: ${inviteLink}`;
  const requestType = normalizeText(payload.type).toLowerCase() ||
    "workspace_invite";
  const delivery = await prepareEmailDelivery(rawPayload, {
    communicationType: requestType,
    recipient: to,
    recipientRole: workspaceRole.toLowerCase().includes("agent") ||
        requestType === "agent_invite"
      ? "agent"
      : "workspace_user",
    subject,
    messagePreview: text,
    context: {
      organisationId: normalizeText(
        rawPayload.organisationId || rawPayload.organisation_id,
      ),
      branchId: normalizeText(rawPayload.branchId || rawPayload.branch_id),
      metadata: {
        inviteLink,
        inviteeName,
        inviterName,
        organisationName,
        workspaceRole,
        emailPurpose: requestType,
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
      errorMessage: emailResult.error?.message ||
        "Failed to send workspace invite email.",
    });
    return jsonResponse(500, {
      error: emailResult.error?.message ||
        "Failed to send workspace invite email.",
      details: emailResult.error,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "workspace_invite",
    emailId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
  });
}
