import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendAgencySignupNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function envEnabled(value: string | undefined, fallback = true) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

export function buildAgencySignupNotificationEmail({
  authUserId,
  email,
  fullName,
  phone,
  appRole,
  intendedOrgRole,
  onboardingPath,
  workspaceAction,
  source,
  signedUpAt,
  adminUrl,
}: {
  authUserId: string;
  email: string;
  fullName: string;
  phone: string;
  appRole: string;
  intendedOrgRole: string;
  onboardingPath: string;
  workspaceAction: string;
  source: string;
  signedUpAt: string;
  adminUrl: string;
}) {
  const headline = fullName || email || "New agency signup";
  const fields = [
    { label: "Name", value: fullName },
    { label: "Email", value: email },
    { label: "Phone", value: phone },
    { label: "Requested role", value: intendedOrgRole || appRole },
    { label: "Onboarding path", value: onboardingPath },
    { label: "Workspace action", value: workspaceAction },
    { label: "Source", value: source },
    { label: "Signed up", value: signedUpAt },
    { label: "Account ID", value: authUserId },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: `New agency signup from ${headline}.`,
    title: "New Agency Signup",
    greeting: `${headline} has created an Arch9 agency account.`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        "This is an early engagement signal. Reach out while their setup is still fresh, especially if they have not started onboarding.",
      ]),
      renderBridgeSummaryCard(fields, "Signup Details"),
      adminUrl ? renderBridgeCta("Open Arch9 Admin", adminUrl) : "",
    ].join(""),
    securityBody:
      "This internal notification contains contact details and should be handled by authorised Arch9 team members only.",
    helpBody: "Reply to this email if ownership or routing needs to change.",
    organisationName: "Arch9",
  });

  const text = [
    `New Arch9 agency signup: ${headline}`,
    "",
    "Follow up while their setup is still fresh, especially if they have not started onboarding.",
    fullName ? `Name: ${fullName}` : "",
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    intendedOrgRole || appRole ? `Requested role: ${intendedOrgRole || appRole}` : "",
    onboardingPath ? `Onboarding path: ${onboardingPath}` : "",
    workspaceAction ? `Workspace action: ${workspaceAction}` : "",
    source ? `Source: ${source}` : "",
    signedUpAt ? `Signed up: ${signedUpAt}` : "",
    authUserId ? `Account ID: ${authUserId}` : "",
    adminUrl ? `Admin: ${adminUrl}` : "",
  ].filter(Boolean).join("\n");

  return { html, text };
}

export async function handleAgencySignupNotificationEmail(
  payload: SendAgencySignupNotificationPayload,
) {
  const enabled = envEnabled(Deno.env.get("AGENCY_SIGNUP_NOTIFICATION_EMAILS_ENABLED"), true);
  const recipientEmail = (
    normalizeText(Deno.env.get("AGENCY_SIGNUP_NOTIFY_EMAIL")) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    "support@arch9.co.za"
  ).toLowerCase();

  if (!enabled) {
    return jsonResponse(200, {
      ok: true,
      type: "agency_signup_notification",
      sent: false,
      suppressed: true,
      reason: "agency_signup_notification_emails_disabled",
      recipientEmail,
    });
  }

  const email = normalizeText(payload.email).toLowerCase();
  if (!email) return jsonResponse(400, { error: "Missing required field: email" });

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });

  const fullName = firstText(payload.fullName, payload.full_name);
  const adminUrl = normalizeText(Deno.env.get("AGENCY_SIGNUP_ADMIN_URL"));
  const { html, text } = buildAgencySignupNotificationEmail({
    authUserId: firstText(payload.authUserId, payload.auth_user_id),
    email,
    fullName,
    phone: normalizeText(payload.phone),
    appRole: firstText(payload.appRole, payload.app_role),
    intendedOrgRole: firstText(payload.intendedOrgRole, payload.intended_org_role),
    onboardingPath: firstText(payload.onboardingPath, payload.onboarding_path),
    workspaceAction: firstText(payload.workspaceAction, payload.workspace_action),
    source: normalizeText(payload.source),
    signedUpAt: firstText(payload.signedUpAt, payload.signed_up_at),
    adminUrl,
  });

  const from = normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  const delivery = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject: `New Arch9 agency signup: ${fullName || email}`,
    html,
    text,
    replyTo: email,
  });

  if (!delivery.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the agency signup notification email.",
      details: delivery.error,
      status: delivery.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "agency_signup_notification",
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: delivery.data,
  });
}
