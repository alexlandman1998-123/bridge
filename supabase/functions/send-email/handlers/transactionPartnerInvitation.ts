import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendTransactionPartnerInvitationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function resolveRoleLabel(payload: SendTransactionPartnerInvitationPayload) {
  const explicit = normalizeText(payload.roleLabel ?? payload.role_label);
  if (explicit) return explicit;
  const roleType = normalizeText(payload.roleType ?? payload.role_type);
  if (roleType === "transfer_attorney") return "Transfer Attorney";
  if (roleType === "bond_originator") return "Bond Originator";
  if (roleType === "developer") return "Developer";
  return "Transaction Partner";
}

export async function handleTransactionPartnerInvitationEmail(
  payload: SendTransactionPartnerInvitationPayload,
) {
  const recipientEmail = normalizeText(payload.to).toLowerCase();
  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const invitationLink = normalizeText(payload.invitationLink ?? payload.invitation_link);
  if (!invitationLink) {
    return jsonResponse(400, { error: "Missing required field: invitationLink" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const companyName = normalizeText(payload.companyName ?? payload.company_name) || "your firm";
  const contactName = normalizeText(payload.contactName ?? payload.contact_name) || "there";
  const organisationName = normalizeText(payload.invitedByOrganisation ?? payload.invited_by_organisation) || "Arch9";
  const roleLabel = resolveRoleLabel(payload);
  const transactionId = normalizeText(payload.transactionId ?? payload.transaction_id);
  const transactionReference = normalizeText(payload.transactionReference ?? payload.transaction_reference) ||
    transactionId;
  const propertyLabel = normalizeText(payload.propertyLabel ?? payload.property_label);
  const buyerLabel = normalizeText(payload.buyerLabel ?? payload.buyer_label);
  const deliveryKind = normalizeText(payload.deliveryKind ?? payload.delivery_kind).toLowerCase();
  const isResend = deliveryKind === "resend";
  const reusedProspect = payload.reusedProspect === true || payload.reused_prospect === true ||
    Boolean(normalizeText(payload.partnerProspectId ?? payload.partner_prospect_id ?? ""));
  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  const subject = isResend
    ? `${organisationName} has resent your Arch9 transaction invite`
    : reusedProspect
    ? `${organisationName} has shared another Arch9 transaction with you`
    : `${organisationName} has invited you into an Arch9 transaction`;
  const message =
    `${organisationName} has invited ${companyName} to collaborate on a secure Arch9 transaction workspace as ${roleLabel}.`;
  const introParagraphs = [
    message,
    isResend
      ? "A fresh secure invitation link has been issued. Use this link instead of any previous invite link for this transaction."
      : "Use the secure invitation link to sign in or create your Arch9 password. Once accepted, this transaction will be linked to your account.",
    "Your access is limited to this transaction and the workflow areas relevant to your role.",
  ];

  const html = renderBridgeEmailLayout({
    preheader: message,
    title: isResend
      ? "Your secure invite has been resent"
      : reusedProspect
      ? "Another secure transaction is ready"
      : "Your secure transaction invite",
    greeting: `Hi ${contactName},`,
    contentHtml: [
      renderBridgeIntroParagraphs(introParagraphs),
      renderBridgeSummaryCard([
        { label: "Role", value: roleLabel },
        { label: "Company", value: companyName },
        { label: "Invited By", value: organisationName },
        { label: "Transaction", value: transactionReference },
        { label: "Property", value: propertyLabel },
        { label: "Buyer", value: buyerLabel },
      ].filter((field) => field.value), "Invitation Details"),
      renderBridgeCta("Open Secure Invite", invitationLink),
    ].join(""),
    securityBody:
      "This invitation grants access only to the transaction that generated the link. It does not grant access to the inviting organisation's wider workspace.",
    helpBody:
      "If you were not expecting this invitation, contact the transaction owner before accepting.",
    organisationName,
  });

  const text = [
    `Hi ${contactName},`,
    "",
    message,
    isResend
      ? "A fresh secure invitation link has been issued. Use this link instead of any previous invite link for this transaction."
      : "Use this secure link to sign in or create your Arch9 password. Once accepted, this transaction will be linked to your account.",
    transactionReference ? `Transaction: ${transactionReference}` : "",
    propertyLabel ? `Property: ${propertyLabel}` : "",
    buyerLabel ? `Buyer: ${buyerLabel}` : "",
    `Open Secure Invite: ${invitationLink}`,
    "",
    "This invitation grants access only to the transaction that generated the link.",
  ].filter(Boolean).join("\n");

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject,
    html,
    text,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the transaction partner invitation email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "transaction_partner_invitation",
    sent: true,
    transactionId,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
