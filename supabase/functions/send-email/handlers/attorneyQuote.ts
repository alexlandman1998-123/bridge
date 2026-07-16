import { createClient } from "supabase";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendAttorneyQuotePayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

type QuoteEnvelope = Record<string, unknown>;

function createUserClient(req: Request) {
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const anonKey = normalizeText(Deno.env.get("SUPABASE_ANON_KEY"));
  const authorization = normalizeText(req.headers.get("authorization"));
  if (!supabaseUrl || !anonKey || !authorization) return null;
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

function createServiceClient() {
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function trustedAppBaseUrl() {
  return normalizeText(
    Deno.env.get("PUBLIC_APP_URL") ||
      Deno.env.get("CLIENT_APP_URL") ||
      Deno.env.get("VITE_PUBLIC_APP_URL") ||
      Deno.env.get("VITE_SITE_URL"),
  ).replace(/\/+$/, "");
}

function formatMoney(value: unknown, currency = "ZAR") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: normalizeText(currency) || "ZAR",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value: unknown) {
  const date = new Date(normalizeText(value));
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-ZA", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
}

async function recordOutcome(
  envelope: QuoteEnvelope,
  status: "sent" | "failed",
  deliveryId = "",
  providerMessageId = "",
  errorMessage = "",
) {
  const serviceClient = createServiceClient();
  if (!serviceClient) return;
  const result = await serviceClient.rpc("bridge_record_attorney_quote_email_delivery", {
    p_organisation_id: normalizeText(envelope.organisation_id),
    p_lead_id: normalizeText(envelope.lead_id),
    p_quote_id: normalizeText(envelope.quote_id),
    p_link_id: normalizeText(envelope.link_id),
    p_dispatch_key: normalizeText(envelope.dispatch_key),
    p_status: status,
    p_delivery_id: normalizeText(deliveryId) || null,
    p_provider_message_id: normalizeText(providerMessageId) || null,
    p_error_message: normalizeText(errorMessage).slice(0, 1000) || null,
  });
  if (result.error) {
    console.error("[send-email] Attorney quote outcome audit failed", {
      code: result.error.code,
      message: result.error.message,
    });
  }
}

export async function handleAttorneyQuoteEmail(req: Request, payload: SendAttorneyQuotePayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  const appBaseUrl = trustedAppBaseUrl();
  if (!resendApiKey) return jsonResponse(500, { error: "Email delivery is not configured." });
  if (!appBaseUrl) return jsonResponse(500, { error: "The public application URL is not configured." });

  const organisationId = normalizeText(payload.organisationId ?? payload.organisation_id);
  const quoteId = normalizeText(payload.quoteId ?? payload.quote_id);
  if (!organisationId || !quoteId) return jsonResponse(400, { error: "Attorney quote context is required." });

  const userClient = createUserClient(req);
  if (!userClient) return jsonResponse(401, { error: "Authentication is required." });
  const prepared = await userClient.rpc("bridge_prepare_attorney_quote_email", {
    p_organisation_id: organisationId,
    p_quote_id: quoteId,
  });
  if (prepared.error || !prepared.data?.success) {
    console.error("[send-email] Attorney quote preparation failed", {
      code: prepared.error?.code,
      message: prepared.error?.message,
    });
    const invalidEmail = /email address/i.test(prepared.error?.message || "");
    return jsonResponse(invalidEmail ? 400 : 403, {
      error: invalidEmail
        ? "Add a valid client email address before sending this quote."
        : "This quote is not available for email delivery.",
    });
  }

  const envelope = prepared.data as QuoteEnvelope;
  const recipientEmail = normalizeText(envelope.recipient_email).toLowerCase();
  const recipientName = normalizeText(envelope.recipient_name) || "there";
  const firmName = normalizeText(envelope.firm_name) || "Your conveyancing team";
  const firmLogoUrl = normalizeText(envelope.firm_logo_url);
  const supportEmail = normalizeText(envelope.firm_email);
  const supportPhone = normalizeText(envelope.firm_phone);
  const quoteNumber = normalizeText(envelope.quote_number);
  const currency = normalizeText(envelope.currency) || "ZAR";
  const validUntil = formatDate(envelope.valid_until);
  const quoteUrl = `${appBaseUrl}/quote/${normalizeText(envelope.token)}`;
  const subject = `${firmName} sent you quote ${quoteNumber}`;
  const total = formatMoney(envelope.total_amount, currency);
  const contentHtml = [
    renderBridgeIntroParagraphs([
      `${firmName} has prepared a secure property legal services quote for you.`,
      "Use the secure link below to review the fee breakdown and accept or decline the quote.",
    ]),
    renderBridgeSummaryCard([
      { label: "Quote", value: quoteNumber },
      { label: "Professional fee", value: formatMoney(envelope.professional_fee, currency) },
      { label: "VAT", value: formatMoney(envelope.vat_amount, currency) },
      { label: "Estimated disbursements", value: formatMoney(envelope.disbursements, currency) },
      { label: "Total", value: total },
      { label: "Valid until", value: validUntil },
    ], "Quote Summary"),
    renderBridgeCta("Review Secure Quote", quoteUrl),
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: `${quoteNumber} from ${firmName} totals ${total}.`,
    title: "Your Quote Is Ready",
    greeting: `Hi ${recipientName},`,
    contentHtml,
    securityTitle: "Private Bearer Link",
    securityBody: "This secure link can record your quote decision. Please do not forward it. Accepting the quote does not itself create a legal Matter or attorney-client mandate.",
    helpBody: "Questions about the quote? Reply to this email or contact the firm before deciding.",
    senderOrganisationName: firmName,
    senderOrganisationLogoUrl: firmLogoUrl,
    supportEmail,
    supportPhone,
  });
  const text = [
    `Hi ${recipientName},`,
    "",
    `${firmName} has prepared a secure property legal services quote for you.`,
    `Quote: ${quoteNumber}`,
    `Professional fee: ${formatMoney(envelope.professional_fee, currency)}`,
    `VAT: ${formatMoney(envelope.vat_amount, currency)}`,
    `Estimated disbursements: ${formatMoney(envelope.disbursements, currency)}`,
    `Total: ${total}`,
    `Valid until: ${validUntil}`,
    "",
    "Review secure quote:",
    quoteUrl,
    "",
    "Please do not forward this bearer link. Accepting does not itself create a legal Matter or attorney-client mandate.",
    "",
    firmName,
    "Powered by Arch9",
  ].join("\n");

  const delivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
    communicationType: "attorney_quote",
    recipient: recipientEmail,
    recipientRole: "client",
    subject,
    messagePreview: text,
    context: {
      organisationId: normalizeText(envelope.organisation_id),
      branchId: normalizeText(envelope.branch_id),
      assignedUserId: normalizeText(envelope.actor_user_id),
      leadId: normalizeText(envelope.lead_id),
      metadata: {
        quoteId: normalizeText(envelope.quote_id),
        quoteNumber,
        quoteLinkId: normalizeText(envelope.link_id),
        validUntil: normalizeText(envelope.valid_until),
      },
    },
  });

  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) || "Arch9 <no-reply@arch9.co.za>";
  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject,
    html,
    text,
    replyTo: supportEmail || undefined,
  });

  if (!emailResult.ok) {
    const message = emailResult.error?.message || "Failed to send Attorney quote email.";
    await markEmailDeliveryFailed(delivery?.id || "", { errorMessage: message });
    await recordOutcome(envelope, "failed", delivery?.id || "", "", message);
    return jsonResponse(502, { error: "The quote email could not be delivered.", deliveryId: delivery?.id || null });
  }

  const providerMessageId = normalizeText(emailResult.data?.id);
  await markEmailDeliverySent(delivery?.id || "", { emailId: providerMessageId });
  await recordOutcome(envelope, "sent", delivery?.id || "", providerMessageId);
  return jsonResponse(200, {
    ok: true,
    type: "attorney_quote",
    sent: true,
    deliveryId: delivery?.id || null,
    recipientEmail,
  });
}
