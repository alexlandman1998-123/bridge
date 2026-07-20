import type { SendLeadPropertySharePayload } from "../types.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderFallbackHtml({ subject, message }: { subject: string; message: string }) {
  return `
    <div style="margin:0;padding:24px;background:#f6f8fb;">
      <div style="width:100%;max-width:680px;margin:0 auto;box-sizing:border-box;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a;">
        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;">${escapeHtml(subject || "Property update")}</h1>
        <div style="font-size:15px;line-height:1.7;color:#334155;white-space:pre-wrap;">${escapeHtml(message)}</div>
      </div>
    </div>
  `;
}

export async function handleLeadPropertyShareEmail(payload: SendLeadPropertySharePayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to).toLowerCase();
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const subject = normalizeText(payload.subject) || "Your matched property collection";
  const message = normalizeText(payload.message || payload.text);
  const html = normalizeText(payload.html) || renderFallbackHtml({ subject, message });
  const text = normalizeText(payload.text || payload.message) || subject;
  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send property collection email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "lead_property_share",
    emailId: emailResult.data?.id || null,
    providerMessageId: emailResult.data?.id || null,
  });
}
