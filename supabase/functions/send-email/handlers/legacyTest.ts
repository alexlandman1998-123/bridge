import type { SendLegacyTestPayload } from "../types.ts";
import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "../content/bridgeEmailLayout.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleLegacyTestEmail(payload: SendLegacyTestPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const name = normalizeText(payload.name) || "there";
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    defaults: { organisationName: "Arch9" },
  });
  const sender = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <onboarding@resend.dev>",
    branding.fromName || branding.organisationName,
  );
  const html = renderBridgeEmailLayout({
    preheader: "Your Arch9 email system is working.",
    title: "Email Test",
    greeting: `Hi ${name},`,
    contentHtml: renderBridgeIntroParagraphs([
      "Your Arch9 email system is working.",
    ]),
    securityBody:
      "This is a controlled test email from the Arch9 notification system.",
    helpBody: "No action is needed.",
    organisationName: branding.organisationName,
    branding,
  });

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject: "Arch9 email test",
    html,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send test email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "test",
    emailId: emailResult.data?.id || null,
  });
}
