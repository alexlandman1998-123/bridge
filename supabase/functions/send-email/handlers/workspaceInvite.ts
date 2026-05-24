import type { SendWorkspaceInvitePayload } from "../types.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function handleWorkspaceInviteEmail(payload: SendWorkspaceInvitePayload) {
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
  if (!inviteLink) return jsonResponse(400, { error: "Missing required field: inviteLink" });

  const organisationName = normalizeText(payload.organisationName || payload.organisation_name) || "Bridge workspace";
  const inviteeName = normalizeText(
    payload.inviteeName || payload.invitee_name || payload.agentName ||
      payload.agent_name,
  ) || "there";
  const inviterName = normalizeText(payload.inviterName || payload.inviter_name) || "your workspace admin";
  const workspaceRole = normalizeText(payload.workspaceRole || payload.workspace_role).replaceAll("_", " ") || "team member";
  const supportEmail = normalizeText(payload.supportEmail || payload.support_email);
  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const safeOrganisationName = escapeHtml(organisationName);
  const safeInviteeName = escapeHtml(inviteeName);
  const safeInviterName = escapeHtml(inviterName);
  const safeWorkspaceRole = escapeHtml(workspaceRole);
  const safeInviteLink = escapeHtml(inviteLink);
  const safeSupportEmail = escapeHtml(supportEmail);

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#142132;max-width:620px;margin:0 auto;padding:24px">
      <p style="margin:0 0 16px">Hi ${safeInviteeName},</p>
      <p style="margin:0 0 16px">${safeInviterName} invited you to join <strong>${safeOrganisationName}</strong> on Bridge as ${safeWorkspaceRole}.</p>
      <p style="margin:0 0 22px">Accept the invite to create or connect your Bridge account and enter the workspace.</p>
      <p style="margin:0 0 24px">
        <a href="${safeInviteLink}" style="display:inline-block;background:#12344d;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 18px;font-weight:700">Accept invite</a>
      </p>
      <p style="margin:0 0 12px;color:#667085;font-size:13px">If the button does not open, copy this link:</p>
      <p style="margin:0 0 20px;word-break:break-all;color:#315a7a;font-size:13px">${safeInviteLink}</p>
      ${safeSupportEmail ? `<p style="margin:0;color:#667085;font-size:13px">Need help? Reply to ${safeSupportEmail}.</p>` : ""}
    </div>
  `;

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject: `You're invited to join ${organisationName} on Bridge`,
    html,
    text: `Hi ${inviteeName}, ${inviterName} invited you to join ${organisationName} on Bridge as ${workspaceRole}. Accept the invite: ${inviteLink}`,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send workspace invite email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "workspace_invite",
    emailId: emailResult.data?.id || null,
  });
}
