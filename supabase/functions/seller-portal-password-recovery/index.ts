import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "../send-email/content/bridgeEmailLayout.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../send-email/services/emailBranding.ts";
import { sendViaResendApi } from "../send-email/services/resend.ts";
import { corsHeaders, jsonResponse } from "../send-email/utils/http.ts";

type JsonRecord = Record<string, unknown>;

const neutralMessage = "If this portal can be recovered, a password reset email will arrive shortly.";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildRecoveryEmail({ sellerName, propertyTitle, recoveryLink, branding }: {
  sellerName: string;
  propertyTitle: string;
  recoveryLink: string;
  branding: Awaited<ReturnType<typeof resolveEmailBranding>>;
}) {
  const html = renderBridgeEmailLayout({
    preheader: "A seller portal password reset was requested.",
    title: "Reset Your Seller Portal Password",
    greeting: `Hello ${sellerName || "Seller"},`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        `A password reset was requested for the secure seller portal for ${propertyTitle || "your property"}.`,
        "This single-use link expires in 30 minutes. If you did not request it, you can safely ignore this email and your password will remain unchanged.",
      ]),
      renderBridgeCta("Reset Password", recoveryLink, {
        primaryColor: branding.primaryColor,
      }),
    ].join(""),
    securityTitle: "Seller Portal Security",
    securityBody:
      "For your security, never forward this email or share the password reset link.",
    helpBody:
      "Need help? Reply to this email or contact your property representative directly.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
  const text = `Hello ${sellerName || "Seller"},\n\nA password reset was requested for the seller portal for ${propertyTitle || "your property"}.\n\nReset your password: ${recoveryLink}\n\nThis single-use link expires in 30 minutes. If you did not request it, ignore this email.`;
  return { html, text };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error("[seller-portal-password-recovery] required service configuration is missing");
    return jsonResponse(500, { error: "Password recovery is temporarily unavailable." });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = normalizeText((body as JsonRecord)?.token);
    if (!token) return jsonResponse(200, { ok: true, message: neutralMessage });

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("bridge_request_private_listing_seller_portal_recovery", {
      p_token: token,
    });
    if (error) {
      console.error("[seller-portal-password-recovery] recovery issuance failed", error.message);
      return jsonResponse(200, { ok: true, message: neutralMessage });
    }

    const recovery = data && typeof data === "object" ? data as JsonRecord : {};
    if (!recovery.deliveryRequired) return jsonResponse(200, { ok: true, message: neutralMessage });

    const recoveryToken = normalizeText(recovery.recoveryToken);
    const recipient = normalizeText(recovery.sellerEmail).toLowerCase();
    const appBaseUrl = normalizeText(
      Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("CLIENT_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL"),
    ).replace(/\/$/, "") || "https://app.arch9.co.za";
    const recoveryLink = `${appBaseUrl}/client/${encodeURIComponent(recoveryToken)}/selling`;
    const branding = await resolveEmailBranding({
      supabase,
      payload: recovery,
      organisationId: normalizeText(recovery.organisationId),
      defaults: {
        organisationName: "Arch9",
        supportEmail: normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
          normalizeText(Deno.env.get("SUPPORT_EMAIL")),
        supportPhone: normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
          normalizeText(Deno.env.get("SUPPORT_PHONE")),
      },
    });
    const content = buildRecoveryEmail({
      sellerName: normalizeText(recovery.sellerName) || "Seller",
      propertyTitle: normalizeText(recovery.propertyTitle) || "your property",
      recoveryLink,
      branding,
    });
    const delivery = await sendViaResendApi({
      apiKey: resendApiKey,
      from: formatEmailSender(
        normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
          "Arch9 <onboarding@resend.dev>",
        branding.fromName || branding.organisationName,
      ),
      to: recipient,
      subject: "Reset your seller portal password",
      html: content.html,
      text: content.text,
      timeoutMs: 15000,
    });

    try {
      await supabase.rpc("bridge_log_client_portal_access_event", {
        p_token: recoveryToken,
        p_event_name: "password_recovery_email",
        p_outcome: delivery.ok ? "success" : "failure",
        p_private_listing_id: normalizeText(recovery.listingId) || null,
        p_reason: delivery.ok ? "email_sent" : "email_delivery_failed",
      });
    } catch {
      // Keep the password recovery response neutral even if access logging fails.
    }
    if (!delivery.ok) console.error("[seller-portal-password-recovery] email delivery failed", delivery.error);

    return jsonResponse(200, { ok: true, message: neutralMessage });
  } catch (error) {
    console.error("[seller-portal-password-recovery] unexpected failure", error);
    return jsonResponse(200, { ok: true, message: neutralMessage });
  }
});
