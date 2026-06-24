import { sendViaResendApi } from "../services/resend.ts";
import type {
  SendArch9LaunchConfirmationPayload,
  SendArch9LaunchInternalNotificationPayload,
} from "../types.ts";
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

function envEnabled(value: string | undefined, fallback = true) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function renderDetail(label: string, value: string) {
  if (!value) return "";
  return `
    <tr>
      <td style="padding: 10px 0; font-size: 12px; line-height: 1.4; color: #6d746f; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">${escapeHtml(label)}</td>
      <td style="padding: 10px 0; font-size: 14px; line-height: 1.5; color: #111817; text-align: right; font-weight: 600;">${escapeHtml(value)}</td>
    </tr>
  `;
}

function renderEmailHtml({
  recipientName,
  roleType,
  discussionFocus,
  preferredTime,
}: {
  recipientName: string;
  roleType: string;
  discussionFocus: string;
  preferredTime: string;
}) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const details = [
    renderDetail("Profile", roleType),
    renderDetail("Focus", discussionFocus),
    renderDetail("Preferred time", preferredTime),
  ].filter(Boolean).join("");

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Thank you for your Arch9 request. We will be in contact shortly.
    </div>
    <div style="margin:0;padding:24px 12px;background:#f3f0ea;">
      <div style="max-width:560px;margin:0 auto;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111817;">
        <div style="padding:26px 8px 20px;text-align:center;">
          <p style="margin:0;font-size:24px;line-height:1.1;letter-spacing:0.36em;color:#123a34;font-weight:300;">ARCH9</p>
        </div>
        <div style="background:#fbfaf7;border:1px solid #ded8ce;border-radius:22px;padding:30px 24px;box-shadow:0 24px 60px rgba(17,24,23,0.08);">
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#5d6361;">${escapeHtml(greeting)}</p>
          <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.08;letter-spacing:-0.03em;color:#123a34;">
            Thank you. We’ll be in contact shortly.
          </h1>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#313b39;">
            We’ve received your request for a private Arch9 strategy session.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#5d6361;">
            Our team will review your details and come back to you with a time that suits your schedule.
          </p>
          ${details ? `
            <div style="margin:0 0 24px;padding:4px 18px;border:1px solid #ded8ce;border-radius:14px;background:#ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                ${details}
              </table>
            </div>
          ` : ""}
          <div style="margin:0 0 4px;padding:18px;border-radius:16px;background:#eef0ea;border:1px solid #d8d5ca;">
            <p style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.25;color:#111817;">What happens next?</p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#313b39;">1. We review your details.</p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#313b39;">2. We prepare a tailored walkthrough.</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#313b39;">3. We confirm a time that suits you.</p>
          </div>
        </div>
        <p style="margin:18px 0 0;text-align:center;font-size:12px;line-height:1.6;color:#7b817d;">
          Arch9 Concierge · Private launch follow-up
        </p>
      </div>
    </div>
  `;
}

function renderInternalNotificationHtml({
  fullName,
  email,
  phone,
  company,
  roleType,
  discussionFocus,
  preferredTime,
  note,
  pageUrl,
  submittedAt,
}: {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  roleType: string;
  discussionFocus: string;
  preferredTime: string;
  note: string;
  pageUrl: string;
  submittedAt: string;
}) {
  const details = [
    renderDetail("Name", fullName),
    renderDetail("Email", email),
    renderDetail("Phone", phone),
    renderDetail("Company", company),
    renderDetail("Profile", roleType),
    renderDetail("Focus", discussionFocus),
    renderDetail("Preferred time", preferredTime),
    renderDetail("Submitted", submittedAt),
  ].filter(Boolean).join("");

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      New Arch9 launch concierge request from ${escapeHtml(fullName || "a launch guest")}.
    </div>
    <div style="margin:0;padding:24px 12px;background:#f3f0ea;">
      <div style="max-width:620px;margin:0 auto;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111817;">
        <div style="padding:24px 8px 18px;text-align:center;">
          <p style="margin:0;font-size:22px;line-height:1.1;letter-spacing:0.34em;color:#123a34;font-weight:300;">ARCH9</p>
        </div>
        <div style="background:#fbfaf7;border:1px solid #ded8ce;border-radius:22px;padding:30px 24px;box-shadow:0 24px 60px rgba(17,24,23,0.08);">
          <p style="margin:0 0 14px;font-size:12px;line-height:1.4;color:#6d746f;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">New concierge request</p>
          <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.08;letter-spacing:-0.03em;color:#123a34;">
            ${escapeHtml(fullName || "A launch guest")} requested a follow-up.
          </h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#5d6361;">
            They scanned the Arch9 launch QR flow and asked to be contacted after the event.
          </p>
          ${details ? `
            <div style="margin:0 0 22px;padding:4px 18px;border:1px solid #ded8ce;border-radius:14px;background:#ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                ${details}
              </table>
            </div>
          ` : ""}
          ${note ? `
            <div style="margin:0 0 22px;padding:18px;border-radius:16px;background:#eef0ea;border:1px solid #d8d5ca;">
              <p style="margin:0 0 8px;font-size:12px;line-height:1.4;color:#6d746f;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Note</p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#313b39;">${escapeHtml(note)}</p>
            </div>
          ` : ""}
          ${pageUrl ? `
            <p style="margin:0;font-size:12px;line-height:1.6;color:#7b817d;word-break:break-word;">Source page: ${escapeHtml(pageUrl)}</p>
          ` : ""}
        </div>
      </div>
    </div>
  `;
}

export async function handleArch9LaunchConfirmationEmail(
  payload: SendArch9LaunchConfirmationPayload,
) {
  const emailsEnabled = envEnabled(Deno.env.get("ARCH9_LAUNCH_CONFIRMATION_EMAILS_ENABLED"), true);
  const recipientEmail = normalizeText(payload.to).toLowerCase();

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: "arch9_launch_confirmation",
      sent: false,
      suppressed: true,
      reason: "arch9_launch_confirmation_emails_disabled",
      recipientEmail,
    });
  }

  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  const replyTo = normalizeText(Deno.env.get("ARCH9_REPLY_TO_EMAIL"));
  const recipientName = normalizeText(payload.recipientName || payload.recipient_name);
  const roleType = normalizeText(payload.roleType || payload.role_type);
  const discussionFocus = normalizeText(payload.discussionFocus || payload.discussion_focus);
  const preferredTime = normalizeText(payload.preferredTime || payload.preferred_time);

  const html = renderEmailHtml({
    recipientName,
    roleType,
    discussionFocus,
    preferredTime,
  });
  const text = [
    recipientName ? `Hi ${recipientName},` : "Hi,",
    "",
    "Thank you. We’ll be in contact shortly.",
    "",
    "We’ve received your request for a private Arch9 strategy session.",
    "Our team will review your details and come back to you with a time that suits your schedule.",
    "",
    roleType ? `Profile: ${roleType}` : "",
    discussionFocus ? `Focus: ${discussionFocus}` : "",
    preferredTime ? `Preferred time: ${preferredTime}` : "",
    "",
    "Arch9 Concierge",
  ].filter(Boolean).join("\n");

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject: "Thank you for your Arch9 request",
    html,
    text,
    replyTo: replyTo || undefined,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the Arch9 launch confirmation email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "arch9_launch_confirmation",
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}

export async function handleArch9LaunchInternalNotificationEmail(
  payload: SendArch9LaunchInternalNotificationPayload,
) {
  const emailsEnabled = envEnabled(Deno.env.get("ARCH9_LAUNCH_INTERNAL_EMAILS_ENABLED"), true);
  const recipientEmail = normalizeText(payload.to).toLowerCase();

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: "arch9_launch_internal_notification",
      sent: false,
      suppressed: true,
      reason: "arch9_launch_internal_emails_disabled",
      recipientEmail,
    });
  }

  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 Concierge <no-reply@arch9.co.za>";
  const replyTo = normalizeText(payload.email) ||
    normalizeText(Deno.env.get("ARCH9_REPLY_TO_EMAIL"));
  const fullName = normalizeText(payload.fullName || payload.full_name);
  const email = normalizeText(payload.email || "");
  const phone = normalizeText(payload.phone || "");
  const company = normalizeText(payload.company || "");
  const roleType = normalizeText(payload.roleType || payload.role_type);
  const discussionFocus = normalizeText(payload.discussionFocus || payload.discussion_focus);
  const preferredTime = normalizeText(payload.preferredTime || payload.preferred_time);
  const note = normalizeText(payload.note || "");
  const pageUrl = normalizeText(payload.pageUrl || payload.page_url);
  const submittedAt = normalizeText(payload.submittedAt || payload.submitted_at);

  const html = renderInternalNotificationHtml({
    fullName,
    email,
    phone,
    company,
    roleType,
    discussionFocus,
    preferredTime,
    note,
    pageUrl,
    submittedAt,
  });
  const text = [
    `New Arch9 launch concierge request: ${fullName || "Launch guest"}`,
    "",
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    company ? `Company: ${company}` : "",
    roleType ? `Profile: ${roleType}` : "",
    discussionFocus ? `Focus: ${discussionFocus}` : "",
    preferredTime ? `Preferred time: ${preferredTime}` : "",
    note ? `Note: ${note}` : "",
    submittedAt ? `Submitted: ${submittedAt}` : "",
    pageUrl ? `Source page: ${pageUrl}` : "",
  ].filter(Boolean).join("\n");

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject: `New Arch9 request${fullName ? `: ${fullName}` : ""}`,
    html,
    text,
    replyTo: replyTo || undefined,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the Arch9 internal notification email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "arch9_launch_internal_notification",
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
