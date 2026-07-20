import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { sendViaResendApi } from "../send-email/services/resend.ts";
import { corsHeaders, jsonResponse } from "../send-email/utils/http.ts";

type JsonRecord = Record<string, unknown>;

const neutralMessage = "If this portal can be recovered, a password reset email will arrive shortly.";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: unknown) {
  return normalizeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildRecoveryEmail({ sellerName, propertyTitle, recoveryLink }: {
  sellerName: string;
  propertyTitle: string;
  recoveryLink: string;
}) {
  const safeName = escapeHtml(sellerName || "Seller");
  const safeProperty = escapeHtml(propertyTitle || "your property");
  const safeLink = escapeHtml(recoveryLink);
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#142132"><div style="width:100%;max-width:620px;margin:0 auto;padding:32px 20px;box-sizing:border-box"><div style="width:100%;box-sizing:border-box;background:#fff;border:1px solid #dbe5ef;border-radius:20px;padding:30px"><p style="margin:0 0 10px;color:#607387;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Seller portal security</p><h1 style="margin:0 0 16px;font-size:26px">Reset your seller portal password</h1><p style="margin:0 0 14px;line-height:1.6">Hello ${safeName},</p><p style="margin:0 0 14px;line-height:1.6">A password reset was requested for the secure seller portal for <strong>${safeProperty}</strong>.</p><p style="margin:0 0 22px;line-height:1.6">This single-use link expires in 30 minutes. If you did not request it, you can safely ignore this email and your password will remain unchanged.</p><a href="${safeLink}" style="display:inline-block;border-radius:12px;background:#2f5478;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px">Reset password</a><p style="margin:24px 0 0;color:#6b7d93;font-size:12px;line-height:1.6">For your security, never forward this email or share the link.</p></div></div></body></html>`;
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
    const content = buildRecoveryEmail({
      sellerName: normalizeText(recovery.sellerName) || "Seller",
      propertyTitle: normalizeText(recovery.propertyTitle) || "your property",
      recoveryLink,
    });
    const delivery = await sendViaResendApi({
      apiKey: resendApiKey,
      from: normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) || "Arch9 <onboarding@resend.dev>",
      to: recipient,
      subject: "Reset your seller portal password",
      html: content.html,
      text: content.text,
      timeoutMs: 15000,
    });

    await supabase.rpc("bridge_log_client_portal_access_event", {
      p_token: recoveryToken,
      p_event_name: "password_recovery_email",
      p_outcome: delivery.ok ? "success" : "failure",
      p_private_listing_id: normalizeText(recovery.listingId) || null,
      p_reason: delivery.ok ? "email_sent" : "email_delivery_failed",
    }).catch(() => null);
    if (!delivery.ok) console.error("[seller-portal-password-recovery] email delivery failed", delivery.error);

    return jsonResponse(200, { ok: true, message: neutralMessage });
  } catch (error) {
    console.error("[seller-portal-password-recovery] unexpected failure", error);
    return jsonResponse(200, { ok: true, message: neutralMessage });
  }
});
