import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendPublicDemoEnquiryNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function envEnabled(value: string | undefined, fallback = true) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  const text = normalizeText(value);
  return text ? [text] : [];
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

export function buildPublicDemoEnquiryEmail({
  fullName,
  role,
  company,
  email,
  phone,
  businessSize,
  monthlyVolume,
  demoFocus,
  preferredWindow,
  biggestFrustration,
  pageUrl,
  adminUrl,
  submittedAt,
}: {
  fullName: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  businessSize: string;
  monthlyVolume: string;
  demoFocus: string[];
  preferredWindow: string[];
  biggestFrustration: string;
  pageUrl: string;
  adminUrl: string;
  submittedAt: string;
}) {
  const headline = fullName || company || email || "Website lead";
  const focus = demoFocus.join(", ");
  const windowLabel = preferredWindow.join(", ");
  const fields = [
    { label: "Name", value: fullName },
    { label: "Role", value: role },
    { label: "Company", value: company },
    { label: "Email", value: email },
    { label: "Phone", value: phone },
    { label: "Business Size", value: businessSize },
    { label: "Monthly Volume", value: monthlyVolume },
    { label: "Demo Focus", value: focus },
    { label: "Preferred Window", value: windowLabel },
    { label: "Biggest Frustration", value: biggestFrustration },
    { label: "Submitted", value: submittedAt },
    { label: "Source Page", value: pageUrl },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: `New Arch9 demo enquiry from ${headline}.`,
    title: "New Demo Enquiry",
    greeting: `${headline} submitted a book-demo request.`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        "A new demo enquiry was submitted from the Arch9 website.",
        "Review the lead details, assign ownership, and follow up while the request is fresh.",
      ]),
      renderBridgeSummaryCard(fields, "Enquiry Details"),
      renderBridgeCta("Open In Arch9 Admin", adminUrl),
    ].join(""),
    securityBody:
      "This internal notification contains submitted contact details and should be handled by authorised Arch9 team members only.",
    helpBody: "Reply to this email if ownership or routing needs to change.",
    organisationName: "Arch9",
  });

  const text = [
    `New Arch9 demo enquiry: ${headline}`,
    "",
    "A new demo enquiry was submitted from the Arch9 website.",
    fullName ? `Name: ${fullName}` : "",
    role ? `Role: ${role}` : "",
    company ? `Company: ${company}` : "",
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    businessSize ? `Business size: ${businessSize}` : "",
    monthlyVolume ? `Monthly volume: ${monthlyVolume}` : "",
    focus ? `Demo focus: ${focus}` : "",
    windowLabel ? `Preferred window: ${windowLabel}` : "",
    biggestFrustration ? `Biggest frustration: ${biggestFrustration}` : "",
    pageUrl ? `Source page: ${pageUrl}` : "",
    adminUrl ? `Admin: ${adminUrl}` : "",
  ].filter(Boolean).join("\n");

  return { html, text };
}

export async function handlePublicDemoEnquiryNotificationEmail(
  payload: SendPublicDemoEnquiryNotificationPayload,
) {
  const emailsEnabled = envEnabled(
    Deno.env.get("PUBLIC_DEMO_ENQUIRY_EMAILS_ENABLED"),
    true,
  );
  const recipientEmail = (
    normalizeText(payload.to) ||
    normalizeText(Deno.env.get("DEMO_ENQUIRY_NOTIFY_EMAIL")) ||
    normalizeText(Deno.env.get("ARCH9_DEMO_NOTIFY_EMAIL")) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    "support@arch9.co.za"
  ).toLowerCase();

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: "public_demo_enquiry",
      sent: false,
      suppressed: true,
      reason: "public_demo_enquiry_emails_disabled",
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

  const firstName = firstText(payload.firstName, payload.first_name);
  const lastName = firstText(payload.lastName, payload.last_name);
  const fullName = firstText(
    payload.fullName,
    payload.full_name,
    [firstName, lastName].filter(Boolean).join(" "),
  );
  const email = normalizeText(payload.email).toLowerCase();
  const company = firstText(payload.company);
  const adminUrl = firstText(payload.adminUrl, payload.admin_url);
  const { html, text } = buildPublicDemoEnquiryEmail({
    fullName,
    role: firstText(payload.role),
    company,
    email,
    phone: firstText(payload.phone),
    businessSize: firstText(payload.businessSize, payload.business_size),
    monthlyVolume: firstText(payload.monthlyVolume, payload.monthly_volume),
    demoFocus: normalizeList(payload.demoFocus ?? payload.demo_focus),
    preferredWindow: normalizeList(
      payload.preferredWindow ?? payload.preferred_window,
    ),
    biggestFrustration: firstText(
      payload.biggestFrustration,
      payload.biggest_frustration,
    ),
    pageUrl: firstText(payload.pageUrl, payload.page_url),
    adminUrl,
    submittedAt: firstText(payload.submittedAt, payload.submitted_at),
  });

  const from = normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  const replyTo = email || undefined;
  const subject = `New Arch9 demo enquiry: ${
    company || email || fullName || "Website lead"
  }`;
  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject,
    html,
    text,
    replyTo,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the public demo enquiry email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "public_demo_enquiry",
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
