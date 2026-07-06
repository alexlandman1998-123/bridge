import type { SendWorkspaceInvitePayload } from "../types.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
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

function getInitials(value: string) {
  const parts = value.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "B";
}

function normalizeBrandColor(value: string) {
  const normalized = normalizeText(value);
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/i.test(normalized)) return normalized;
  return "#12344d";
}

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
  const organisationLogoUrl = normalizeText(
    payload.organisationLogoUrl || payload.organisation_logo_url,
  );
  const organisationLogoIconUrl = normalizeText(
    payload.organisationLogoIconUrl || payload.organisation_logo_icon_url,
  );
  const brandPrimaryColor = normalizeBrandColor(
    payload.brandPrimaryColor || payload.brand_primary_color || "",
  );
  const sender = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";

  const safeOrganisationName = escapeHtml(organisationName);
  const safeInviteeName = escapeHtml(inviteeName);
  const safeInviterName = escapeHtml(inviterName);
  const safeWorkspaceRole = escapeHtml(workspaceRole);
  const safeInviteLink = escapeHtml(inviteLink);
  const safeSupportEmail = escapeHtml(supportEmail);
  const safeLogoUrl = escapeHtml(
    organisationLogoUrl || organisationLogoIconUrl,
  );
  const safeBrandColor = escapeHtml(brandPrimaryColor);
  const safeInitials = escapeHtml(getInitials(organisationName));
  const currentYear = new Date().getFullYear();
  const supportHtml = safeSupportEmail
    ? `Need help? Reply to <a href="mailto:${safeSupportEmail}" style="color:${safeBrandColor};text-decoration:none;font-weight:700;">${safeSupportEmail}</a>.`
    : "Need help? Reply to this email and our team will help you get set up.";
  const brandMarkHtml = safeLogoUrl
    ? `<img src="${safeLogoUrl}" width="156" alt="${safeOrganisationName}" style="display:block;max-width:156px;max-height:54px;width:auto;height:auto;border:0;object-fit:contain;" />`
    : `<div style="width:54px;height:54px;border-radius:18px;background:#ffffff;color:${safeBrandColor};font-size:20px;font-weight:800;line-height:54px;text-align:center;box-shadow:0 14px 34px rgba(8,26,45,0.24);">${safeInitials}</div>`;

  const html = `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${safeInviterName} invited you to join ${safeOrganisationName} on Arch9.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;padding:0;background:#edf3f8;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;border-collapse:separate;border-spacing:0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#142132;">
            <tr>
              <td style="padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="overflow:hidden;border-radius:28px;background:#ffffff;border:1px solid #dbe6f2;box-shadow:0 28px 80px rgba(15,47,79,0.16);">
                  <tr>
                    <td style="padding:28px;background:${safeBrandColor};background-image:linear-gradient(135deg,${safeBrandColor} 0%,#0a1f36 100%);">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="left" style="vertical-align:middle;">
                            <div style="display:inline-block;padding:13px 16px;border-radius:22px;background:rgba(255,255,255,0.96);box-shadow:0 16px 40px rgba(0,0,0,0.16);">
                              ${brandMarkHtml}
                            </div>
                          </td>
                          <td align="right" style="vertical-align:middle;">
                            <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.24);color:#dbeafe;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">
                              Powered by Arch9
                            </div>
                          </td>
                        </tr>
                      </table>
                      <div style="height:28px;line-height:28px;">&nbsp;</div>
                      <p style="margin:0 0 10px;color:#bfe2ff;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">Workspace invitation</p>
                      <h1 style="margin:0;color:#ffffff;font-size:36px;line-height:1.08;font-weight:800;letter-spacing:-0.04em;">Join ${safeOrganisationName}</h1>
                      <p style="margin:14px 0 0;max-width:520px;color:#dbeafe;font-size:16px;line-height:1.65;">You have been invited into a premium Arch9 workspace as ${safeWorkspaceRole}.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:34px 34px 28px;background:#ffffff;">
                      <p style="margin:0 0 18px;color:#142132;font-size:18px;line-height:1.6;">Hi ${safeInviteeName},</p>
                      <p style="margin:0 0 24px;color:#40536a;font-size:16px;line-height:1.7;">${safeInviterName} invited you to create or connect your Arch9 account and enter the ${safeOrganisationName} workspace.</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0 12px;margin:0 0 26px;">
                        <tr>
                          <td style="padding:16px 18px;border:1px solid #e2eaf4;border-radius:18px;background:#f8fbff;">
                            <p style="margin:0 0 5px;color:#748aa2;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">Workspace</p>
                            <p style="margin:0;color:#142132;font-size:16px;font-weight:800;">${safeOrganisationName}</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:16px 18px;border:1px solid #e2eaf4;border-radius:18px;background:#f8fbff;">
                            <p style="margin:0 0 5px;color:#748aa2;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">Access level</p>
                            <p style="margin:0;color:#142132;font-size:16px;font-weight:800;">${safeWorkspaceRole}</p>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                        <tr>
                          <td style="border-radius:16px;background:${safeBrandColor};box-shadow:0 16px 34px rgba(18,52,77,0.28);">
                            <a href="${safeInviteLink}" style="display:inline-block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;letter-spacing:-0.01em;">Accept invite</a>
                          </td>
                        </tr>
                      </table>
                      <div style="padding:18px 20px;border-radius:20px;background:#f6f9fc;border:1px solid #e2eaf4;">
                        <p style="margin:0 0 8px;color:#40536a;font-size:13px;line-height:1.55;">If the button does not open, copy this secure invite link:</p>
                        <p style="margin:0;word-break:break-all;font-size:13px;line-height:1.55;">
                          <a href="${safeInviteLink}" style="color:${safeBrandColor};font-weight:700;text-decoration:none;">${safeInviteLink}</a>
                        </p>
                      </div>
                      <p style="margin:20px 0 0;color:#667085;font-size:13px;line-height:1.65;">${supportHtml}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 34px 28px;border-top:1px solid #edf2f7;background:#fbfdff;">
                      <p style="margin:0;color:#748aa2;font-size:12px;line-height:1.6;">This invite was sent for ${safeOrganisationName}. If you were not expecting it, you can ignore this email.</p>
                      <p style="margin:8px 0 0;color:#9aaabc;font-size:12px;line-height:1.6;">${currentYear} Arch9. Secure workspace infrastructure for property teams.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
  const subject = `You're invited to join ${organisationName} on Arch9`;
  const text =
    `Hi ${inviteeName}, ${inviterName} invited you to join ${organisationName} on Arch9 as ${workspaceRole}. Accept the invite: ${inviteLink}`;
  const rawPayload = payload as Record<string, unknown>;
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
