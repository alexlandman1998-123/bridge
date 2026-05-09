import { createClient } from "supabase";
import type { SendSellerOnboardingPayload } from "../types.ts";
import {
  buildSellerOnboardingEmailHtml,
  buildSellerOnboardingEmailText,
  buildSellerOnboardingSubject,
} from "../content/sellerOnboarding.ts";
import { fetchOrganisationEmailTemplateOverride } from "../services/emailTemplateSettings.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleSellerOnboardingEmail(payload: SendSellerOnboardingPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const sellerName = normalizeText(payload.sellerName) || "there";
  const propertyTitle = normalizeText(payload.propertyTitle) || "your property";
  const transactionReference = normalizeText(payload.transactionReference);
  const onboardingLink = normalizeText(payload.onboardingLink);
  const agentName = normalizeText(payload.agentName);
  const organisationName = normalizeText(payload.organisationName) || "Bridge";
  const organisationId = normalizeText(payload.organisationId);
  const supportEmail = normalizeText(payload.supportEmail);
  const supportPhone = normalizeText(payload.supportPhone);
  if (!onboardingLink) {
    return jsonResponse(400, { error: "Missing required field: onboardingLink" });
  }

  let templateOverrides = null;
  if (organisationId && supabaseUrl && serviceRoleKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      templateOverrides = await fetchOrganisationEmailTemplateOverride(
        supabase,
        organisationId,
        "seller_onboarding",
      );
    } catch (error) {
      console.error("[seller_onboarding] template override lookup failed", error);
    }
  }

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject =
    normalizeText(templateOverrides?.subject) ||
    buildSellerOnboardingSubject(propertyTitle, transactionReference);
  const html = buildSellerOnboardingEmailHtml({
    sellerName,
    propertyTitle,
    transactionReference,
    onboardingLink,
    agentName,
    organisationName,
    supportEmail,
    supportPhone,
    templateOverrides: templateOverrides || undefined,
  });
  const text = buildSellerOnboardingEmailText({
    sellerName,
    propertyTitle,
    transactionReference,
    onboardingLink,
    agentName,
    organisationName,
    supportEmail,
    supportPhone,
    templateOverrides: templateOverrides || undefined,
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
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send seller onboarding email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_onboarding",
    emailId: emailResult.data?.id || null,
  });
}
