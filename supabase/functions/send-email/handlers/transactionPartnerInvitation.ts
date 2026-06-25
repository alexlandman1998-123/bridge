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
  const reusedProspect = payload.reusedProspect === true || payload.reused_prospect === true ||
    Boolean(normalizeText(payload.partnerProspectId ?? payload.partner_prospect_id ?? ""));
  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@bridge9.app>";
  const subject = reusedProspect
    ? `${organisationName} has selected your firm for another property transaction`
    : `${organisationName} has selected your firm for a property transaction`;
  const message = reusedProspect
    ? `${organisationName} has selected ${companyName} for another property transaction as ${roleLabel}.`
    : `${organisationName} has selected ${companyName} to participate in a property transaction as ${roleLabel}.`;

  const html = renderBridgeEmailLayout({
    preheader: message,
    title: reusedProspect ? "Another transaction is waiting for your firm" : "You have been invited to a property transaction",
    greeting: `Hi ${contactName},`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        message,
        "Accept the invitation to create your Arch9 account and access the transaction workspace.",
      ]),
      renderBridgeSummaryCard([
        { label: "Role", value: roleLabel },
        { label: "Company", value: companyName },
        { label: "Invited By", value: organisationName },
        { label: "Transaction", value: transactionId },
      ].filter((field) => field.value), "Invitation Details"),
      renderBridgeCta("Accept Invitation", invitationLink),
    ].join(""),
    securityBody:
      "This invitation grants access only to the transaction that generated the link. It does not grant agency, branch, or organisation visibility.",
    helpBody:
      "If you were not expecting this invitation, contact the transaction owner before accepting.",
    organisationName,
  });

  const text = [
    `Hi ${contactName},`,
    "",
    message,
    transactionId ? `Transaction: ${transactionId}` : "",
    `Accept Invitation: ${invitationLink}`,
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
