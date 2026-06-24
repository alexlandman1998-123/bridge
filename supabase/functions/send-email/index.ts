import { handleClientOnboardingEmail } from "./handlers/clientOnboarding.ts";
import { handleLegacyTestEmail } from "./handlers/legacyTest.ts";
import { handleOnboardingSubmittedEmail } from "./handlers/onboardingSubmitted.ts";
import { handleReservationDepositEmail } from "./handlers/reservationDeposit.ts";
import { handleReservationDepositReceivedEmail } from "./handlers/reservationDepositReceived.ts";
import { handleSellerOnboardingEmail } from "./handlers/sellerOnboarding.ts";
import { handleSellerOnboardingSubmittedEmail } from "./handlers/sellerOnboardingSubmitted.ts";
import { handleSellerMandateSentEmail } from "./handlers/sellerMandateSent.ts";
import { handleSellerMandateSignedEmail } from "./handlers/sellerMandateSigned.ts";
import { handleAppointmentEmail } from "./handlers/appointment.ts";
import { handleWorkspaceInviteEmail } from "./handlers/workspaceInvite.ts";
import { handleBuyerOfferLinkEmail } from "./handlers/buyerOfferLink.ts";
import { handleBuyerOfferSubmittedAgentEmail } from "./handlers/buyerOfferSubmittedAgent.ts";
import { handleLeadPropertyShareEmail } from "./handlers/leadPropertyShare.ts";
import {
  handleArch9LaunchConfirmationEmail,
  handleArch9LaunchInternalNotificationEmail,
} from "./handlers/arch9LaunchConfirmation.ts";
import { handleBondIntakeNotificationEmail } from "./handlers/bondIntakeNotification.ts";
import { handleBondOriginatorBuyerIntroEmail } from "./handlers/bondOriginatorBuyerIntro.ts";
import { handleCommercialAccessNotificationEmail } from "./handlers/commercialAccessNotification.ts";
import { handleCommercialLandlordOnboardingEmail } from "./handlers/commercialLandlordOnboarding.ts";
import { handleOfferDecisionNotificationEmail } from "./handlers/offerDecisionNotification.ts";
import { handleSellerOfferReviewEmail } from "./handlers/sellerOfferReview.ts";
import {
  handleTransactionRoleplayerHandoffEmail,
  handleTransactionRoleplayerIntroEmail,
} from "./handlers/transactionRoleplayerIntro.ts";
import { handleTransactionPartnerInvitationEmail } from "./handlers/transactionPartnerInvitation.ts";
import type {
  SendArch9LaunchConfirmationPayload,
  SendArch9LaunchInternalNotificationPayload,
  SendAppointmentEmailPayload,
  SendBondIntakeNotificationPayload,
  SendBondOriginatorBuyerIntroPayload,
  SendBuyerOfferLinkPayload,
  SendBuyerOfferSubmittedAgentPayload,
  SendClientOnboardingPayload,
  SendCommercialAccessNotificationPayload,
  SendCommercialLandlordOnboardingPayload,
  SendLegacyTestPayload,
  SendLeadPropertySharePayload,
  SendOfferDecisionNotificationPayload,
  SendOnboardingSubmittedPayload,
  SendReservationDepositPayload,
  SendReservationDepositReceivedPayload,
  SendSellerMandateSentPayload,
  SendSellerMandateSignedPayload,
  SendSellerOfferReviewPayload,
  SendSellerOnboardingPayload,
  SendSellerOnboardingSubmittedPayload,
  SendTransactionRoleplayerHandoffPayload,
  SendTransactionRoleplayerIntroPayload,
  SendTransactionPartnerInvitationPayload,
  SendWorkspaceInvitePayload,
} from "./types.ts";
import { corsHeaders, jsonResponse } from "./utils/http.ts";
import { normalizeText } from "./utils/text.ts";

type EmailRequestEnvelope = Record<string, unknown>;

function toRecord(value: unknown): EmailRequestEnvelope | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EmailRequestEnvelope)
    : null;
}

function resolveEmailPayload(body: unknown): EmailRequestEnvelope | null {
  const root = toRecord(body);
  if (!root) return null;

  if (normalizeText(root.type)) {
    return root;
  }

  const nestedBody = toRecord(root.body);
  if (nestedBody && normalizeText(nestedBody.type)) {
    return nestedBody;
  }

  const nestedPayload = toRecord(root.payload);
  if (nestedPayload && normalizeText(nestedPayload.type)) {
    return nestedPayload;
  }

  return root;
}

function resolveTransactionId(payload: EmailRequestEnvelope): string {
  return normalizeText(payload.transactionId ?? payload.transaction_id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await req.json();
    const payload = resolveEmailPayload(body);

    if (!payload) {
      return jsonResponse(400, { error: "Invalid request body." });
    }

    const normalizedType = normalizeText(payload.type).toLowerCase();
    const type = normalizedType.replaceAll("-", "_");
    const transactionId = resolveTransactionId(payload);
    const recipient = normalizeText(payload.to).toLowerCase();
    const payloadKeys = Object.keys(payload || {});

    console.log("[send-email] incoming request", {
      resolvedType: type || null,
      hasType: Boolean(type),
      recipient: recipient || null,
      transactionId: transactionId || null,
      payloadKeys,
    });

    if (
      ["client_onboarding", "onboarding", "onboarding_email"].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "client_onboarding",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleClientOnboardingEmail(
        req,
        {
          ...(payload as SendClientOnboardingPayload),
          type: "client_onboarding",
          transactionId,
        },
      );
    }

    if (
      ["reservation_deposit", "deposit_request", "reservation"].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "reservation_deposit",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleReservationDepositEmail(
        req,
        {
          ...(payload as SendReservationDepositPayload),
          type: "reservation_deposit",
          transactionId,
        },
      );
    }

    if (["reservation_deposit_received", "deposit_received"].includes(type)) {
      console.log("[send-email] routing template", {
        route: "reservation_deposit_received",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleReservationDepositReceivedEmail(
        req,
        {
          ...(payload as SendReservationDepositReceivedPayload),
          type: "reservation_deposit_received",
          transactionId,
        },
      );
    }

    if ("client_portal_link" === type || "client_portal" === type || "portal_link" === type) {
      console.log("[send-email] routing template", {
        route: "client_portal_link",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleOnboardingSubmittedEmail(
        req,
        {
          ...(payload as SendOnboardingSubmittedPayload),
          type: "client_portal_link",
          transactionId,
        },
      );
    }

    if (
      ["onboarding_submitted", "client_onboarding_submitted"].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "onboarding_submitted",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleOnboardingSubmittedEmail(
        req,
        {
          ...(payload as SendOnboardingSubmittedPayload),
          type: "onboarding_submitted",
          transactionId,
        },
      );
    }

    if (["seller_onboarding", "seller_onboarding_link", "seller_portal_link"].includes(type)) {
      console.log("[send-email] routing template", {
        route: type === "seller_portal_link" ? "seller_portal_link" : "seller_onboarding",
        recipient: recipient || null,
      });
      return await handleSellerOnboardingEmail(
        {
          ...(payload as SendSellerOnboardingPayload),
          type: type === "seller_portal_link" ? "seller_portal_link" : (payload as SendSellerOnboardingPayload).type,
          emailKind: type === "seller_portal_link" ? "portal_documents" : (payload as SendSellerOnboardingPayload).emailKind,
        },
      );
    }

    if (["commercial_landlord_onboarding"].includes(type)) {
      console.log("[send-email] routing template", {
        route: "commercial_landlord_onboarding",
        recipient: recipient || null,
      });
      return await handleCommercialLandlordOnboardingEmail(
        payload as SendCommercialLandlordOnboardingPayload,
      );
    }

    if (["seller_onboarding_submitted"].includes(type)) {
      console.log("[send-email] routing template", {
        route: "seller_onboarding_submitted",
        recipient: recipient || null,
      });
      return await handleSellerOnboardingSubmittedEmail(
        req,
        payload as SendSellerOnboardingSubmittedPayload,
      );
    }

    if (["seller_mandate_sent", "seller_mandate"].includes(type)) {
      console.log("[send-email] routing template", {
        route: "seller_mandate_sent",
        recipient: recipient || null,
      });
      return await handleSellerMandateSentEmail(
        payload as SendSellerMandateSentPayload,
      );
    }

    if (["seller_mandate_signed"].includes(type)) {
      console.log("[send-email] routing template", {
        route: "seller_mandate_signed",
        recipient: recipient || null,
      });
      return await handleSellerMandateSignedEmail(
        payload as SendSellerMandateSignedPayload,
      );
    }

    if (
      ["buyer_offer_link", "offer_link", "post_viewing_offer_link"].includes(
        type,
      )
    ) {
      console.log("[send-email] routing template", {
        route: "buyer_offer_link",
        recipient: recipient || null,
      });
      return await handleBuyerOfferLinkEmail(
        payload as SendBuyerOfferLinkPayload,
      );
    }

    if (
      [
        "lead_property_share",
        "property_collection",
        "property_collection_email",
        "buyer_property_collection",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "lead_property_share",
        recipient: recipient || null,
      });
      return await handleLeadPropertyShareEmail(
        payload as SendLeadPropertySharePayload,
      );
    }

    if (
      [
        "buyer_offer_submitted_agent",
        "buyer_offer_submitted",
        "offer_submitted_agent",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "buyer_offer_submitted_agent",
        recipient: recipient || null,
      });
      return await handleBuyerOfferSubmittedAgentEmail(
        payload as SendBuyerOfferSubmittedAgentPayload,
      );
    }

    if (["seller_offer_review", "offer_seller_review"].includes(type)) {
      console.log("[send-email] routing template", {
        route: "seller_offer_review",
        recipient: recipient || null,
      });
      return await handleSellerOfferReviewEmail(
        payload as SendSellerOfferReviewPayload,
      );
    }

    if (
      [
        "offer_decision_notification",
        "seller_offer_decision",
        "offer_accepted_notification",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "offer_decision_notification",
        recipient: recipient || null,
      });
      return await handleOfferDecisionNotificationEmail(
        payload as SendOfferDecisionNotificationPayload,
      );
    }

    if (
      [
        "bond_intake_notification",
        "bond_originator_intake",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "bond_intake_notification",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleBondIntakeNotificationEmail({
        ...(payload as SendBondIntakeNotificationPayload),
        type: "bond_intake_notification",
        transactionId,
      });
    }

    if (["bond_originator_buyer_intro"].includes(type)) {
      console.log("[send-email] routing template", {
        route: "bond_originator_buyer_intro",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleBondOriginatorBuyerIntroEmail({
        ...(payload as SendBondOriginatorBuyerIntroPayload),
        type: "bond_originator_buyer_intro",
        transactionId,
      });
    }

    if (
      [
        "commercial_access_notification",
        "commercial_access_request",
        "commercial_access_decision",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "commercial_access_notification",
        requestedType: type,
        recipient: recipient || null,
      });
      return await handleCommercialAccessNotificationEmail({
        ...(payload as SendCommercialAccessNotificationPayload),
        type: "commercial_access_notification",
      });
    }

    if (
      [
        "transaction_partner_invitation",
        "partner_transaction_invite",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "transaction_partner_invitation",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleTransactionPartnerInvitationEmail({
        ...(payload as SendTransactionPartnerInvitationPayload),
        type: "transaction_partner_invitation",
        transactionId,
      });
    }

    if (
      [
        "transaction_roleplayer_intro",
        "roleplayer_intro",
        "transaction_handoff_intro",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "transaction_roleplayer_intro",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleTransactionRoleplayerIntroEmail({
        ...(payload as SendTransactionRoleplayerIntroPayload),
        type: "transaction_roleplayer_intro",
        transactionId,
      });
    }

    if (
      [
        "transaction_roleplayer_handoff",
        "roleplayer_handoff",
        "transaction_team_handoff",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "transaction_roleplayer_handoff",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleTransactionRoleplayerHandoffEmail({
        ...(payload as SendTransactionRoleplayerHandoffPayload),
        type: "transaction_roleplayer_handoff",
        transactionId,
      });
    }

    if (
      [
        "appointment_scheduled",
        "appointment_confirmed",
        "seller_appointment_scheduled",
        "appointment_updated",
        "appointment_cancelled",
        "appointment_rescheduled",
        "appointment_confirmation_required",
        "appointment_reminder",
        "appointment_documents_required",
      ].includes(type)
    ) {
      const routedType = type === "seller_appointment_scheduled"
        ? "appointment_scheduled"
        : type;
      console.log("[send-email] routing template", {
        route: "appointment",
        type: routedType,
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleAppointmentEmail({
        ...(payload as SendAppointmentEmailPayload),
        type: routedType as SendAppointmentEmailPayload["type"],
        transactionId,
      });
    }

    if (
      ["workspace_invite", "team_invite", "branch_invite", "agent_invite"].includes(type) &&
      (payload as SendWorkspaceInvitePayload).to
    ) {
      console.log("[send-email] routing template", {
        route: "workspace_invite",
        requestedType: type,
        recipient: recipient || null,
      });
      return await handleWorkspaceInviteEmail(payload as SendWorkspaceInvitePayload);
    }

    if (
      [
        "arch9_launch_confirmation",
        "launch_confirmation",
        "arch9_concierge_confirmation",
      ].includes(type) &&
      (payload as SendArch9LaunchConfirmationPayload).to
    ) {
      console.log("[send-email] routing template", {
        route: "arch9_launch_confirmation",
        recipient: recipient || null,
      });
      return await handleArch9LaunchConfirmationEmail({
        ...(payload as SendArch9LaunchConfirmationPayload),
        type: "arch9_launch_confirmation",
      });
    }

    if (
      [
        "arch9_launch_internal_notification",
        "launch_internal_notification",
        "arch9_concierge_internal_notification",
      ].includes(type) &&
      (payload as SendArch9LaunchInternalNotificationPayload).to
    ) {
      console.log("[send-email] routing template", {
        route: "arch9_launch_internal_notification",
        recipient: recipient || null,
      });
      return await handleArch9LaunchInternalNotificationEmail({
        ...(payload as SendArch9LaunchInternalNotificationPayload),
        type: "arch9_launch_internal_notification",
      });
    }

    if (
      ["legacy_test", "test_email", "bridge_email_test"].includes(type) &&
      (payload as SendLegacyTestPayload).to
    ) {
      console.log("[send-email] routing template", {
        route: "legacy_test",
        recipient: recipient || null,
      });
      return await handleLegacyTestEmail(payload as SendLegacyTestPayload);
    }

    if (!type) {
      return jsonResponse(400, {
        error:
          "Missing email type. The send-email function requires an explicit template type.",
        supportedTypes: [
          "client_onboarding",
          "client_portal_link",
          "client_portal",
          "portal_link",
          "onboarding_submitted",
          "reservation_deposit",
          "reservation_deposit_received",
          "seller_onboarding",
          "seller_onboarding_submitted",
          "seller_mandate_sent",
          "seller_mandate_signed",
          "lead_property_share",
          "property_collection",
          "buyer_offer_link",
          "buyer_offer_submitted_agent",
          "seller_offer_review",
          "offer_decision_notification",
          "bond_intake_notification",
          "bond_originator_buyer_intro",
          "commercial_access_notification",
          "transaction_roleplayer_intro",
          "transaction_roleplayer_handoff",
          "workspace_invite",
          "branch_invite",
          "agent_invite",
          "appointment_scheduled",
          "appointment_confirmed",
          "appointment_updated",
          "appointment_cancelled",
          "appointment_rescheduled",
          "appointment_confirmation_required",
          "appointment_reminder",
          "appointment_documents_required",
          "arch9_launch_confirmation",
          "arch9_launch_internal_notification",
          "legacy_test",
        ],
      });
    }

    return jsonResponse(400, {
      error:
        "Unknown email request type. Legacy test fallback is disabled for untyped/unknown requests.",
      receivedType: type,
      supportedTypes: [
        "client_onboarding",
        "client_portal_link",
        "client_portal",
        "portal_link",
        "onboarding_submitted",
        "reservation_deposit",
        "reservation_deposit_received",
        "seller_onboarding",
        "seller_onboarding_submitted",
        "seller_mandate_sent",
        "seller_mandate_signed",
        "buyer_offer_link",
        "buyer_offer_submitted_agent",
        "seller_offer_review",
        "offer_decision_notification",
        "bond_intake_notification",
        "bond_originator_buyer_intro",
        "commercial_access_notification",
        "transaction_roleplayer_intro",
        "transaction_roleplayer_handoff",
        "workspace_invite",
        "branch_invite",
        "agent_invite",
        "appointment_scheduled",
        "appointment_confirmed",
        "appointment_updated",
        "appointment_cancelled",
        "appointment_rescheduled",
        "appointment_confirmation_required",
        "appointment_reminder",
        "appointment_documents_required",
        "arch9_launch_confirmation",
        "arch9_launch_internal_notification",
        "legacy_test",
      ],
    });
  } catch (err) {
    console.error("Unhandled function error", err);
    return jsonResponse(500, { error: String(err) });
  }
});
