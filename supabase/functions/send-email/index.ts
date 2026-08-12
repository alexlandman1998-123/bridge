import { handleClientOnboardingEmail } from "./handlers/clientOnboarding.ts";
import { handleLegacyTestEmail } from "./handlers/legacyTest.ts";
import { handleOnboardingSubmittedEmail } from "./handlers/onboardingSubmitted.ts";
import { handleReservationDepositEmail } from "./handlers/reservationDeposit.ts";
import { handleReservationDepositReceivedEmail } from "./handlers/reservationDepositReceived.ts";
import { handleSellerOnboardingEmail } from "./handlers/sellerOnboarding.ts";
import { handleSellerOnboardingSubmittedEmail } from "./handlers/sellerOnboardingSubmitted.ts";
import { handleAppointmentEmail } from "./handlers/appointment.ts";
import { handleWorkspaceInviteEmail } from "./handlers/workspaceInvite.ts";
import { handleBuyerOfferLinkEmail } from "./handlers/buyerOfferLink.ts";
import { handleBuyerOfferSubmittedAgentEmail } from "./handlers/buyerOfferSubmittedAgent.ts";
import { handleLeadPropertyShareEmail } from "./handlers/leadPropertyShare.ts";
import { handleBuyerViewingAvailabilityRequestEmail } from "./handlers/viewingAvailabilityRequest.ts";
import { handleSellerViewingAvailabilityRequestEmail } from "./handlers/sellerViewingAvailabilityRequest.ts";
import { handleLeadAcknowledgementEmail } from "./handlers/leadAcknowledgement.ts";
import { handleKingstonsValuationDownloadEmail } from "./handlers/kingstonsValuationDownload.ts";
import { handleLeadOperationsNotificationEmail } from "./handlers/leadOperationsNotification.ts";
import { handleAdditionalDocumentRequestEmail } from "./handlers/additionalDocumentRequest.ts";
import {
  handleArch9LaunchConfirmationEmail,
  handleArch9LaunchInternalNotificationEmail,
} from "./handlers/arch9LaunchConfirmation.ts";
import { handlePublicDemoEnquiryNotificationEmail } from "./handlers/publicDemoEnquiry.ts";
import { handleBondIntakeNotificationEmail } from "./handlers/bondIntakeNotification.ts";
import { handleBondOriginatorBuyerIntroEmail } from "./handlers/bondOriginatorBuyerIntro.ts";
import { handleCommercialAccessNotificationEmail } from "./handlers/commercialAccessNotification.ts";
import { handleCommercialLandlordOnboardingEmail } from "./handlers/commercialLandlordOnboarding.ts";
import { handleOfferDecisionNotificationEmail } from "./handlers/offerDecisionNotification.ts";
import { handleOrganisationPartnerInvitationEmail } from "./handlers/organisationPartnerInvitation.ts";
import { handleSellerOfferReviewEmail } from "./handlers/sellerOfferReview.ts";
import {
  handleTransactionRoleplayerHandoffEmail,
  handleTransactionRoleplayerIntroEmail,
} from "./handlers/transactionRoleplayerIntro.ts";
import { handleTransactionPartnerInvitationEmail } from "./handlers/transactionPartnerInvitation.ts";
import { handleNotificationReminderDispatchEmail } from "./handlers/notificationReminderDispatch.ts";
import { handleAttorneyQuoteEmail } from "./handlers/attorneyQuote.ts";
import { handleTransactionOperationsNotificationEmail } from "./handlers/transactionOperationsNotification.ts";
import { handleClientSellerPortalNotificationEmail } from "./handlers/clientSellerPortalNotification.ts";
import { handleBondAttorneyLegalNotificationEmail } from "./handlers/bondAttorneyLegalNotification.ts";
import { handleWeeklyDigestNotificationEmail } from "./handlers/weeklyDigestNotification.ts";
import { handleCommercialEnterpriseNotificationEmail } from "./handlers/commercialEnterpriseNotification.ts";
import { handleTransactionProgressDispatchEmail } from "./handlers/transactionProgressDispatch.ts";
import { handleNotificationControlsOperation } from "./handlers/notificationControlsOperations.ts";
import type {
  SendAdditionalDocumentRequestPayload,
  SendAppointmentEmailPayload,
  SendArch9LaunchConfirmationPayload,
  SendArch9LaunchInternalNotificationPayload,
  SendAttorneyQuotePayload,
  SendBondAttorneyLegalNotificationPayload,
  SendBondIntakeNotificationPayload,
  SendBondOriginatorBuyerIntroPayload,
  SendBuyerOfferLinkPayload,
  SendBuyerOfferSubmittedAgentPayload,
  SendBuyerViewingAvailabilityRequestPayload,
  SendClientOnboardingPayload,
  SendClientSellerPortalNotificationPayload,
  SendCommercialAccessNotificationPayload,
  SendCommercialEnterpriseNotificationPayload,
  SendCommercialLandlordOnboardingPayload,
  SendKingstonsValuationDownloadPayload,
  SendLeadAcknowledgementPayload,
  SendLeadOperationsNotificationPayload,
  SendLeadPropertySharePayload,
  SendLegacyTestPayload,
  SendNotificationControlsPayload,
  SendNotificationReminderDispatchPayload,
  SendOfferDecisionNotificationPayload,
  SendOnboardingSubmittedPayload,
  SendOrganisationPartnerInvitationPayload,
  SendPublicDemoEnquiryNotificationPayload,
  SendReservationDepositPayload,
  SendReservationDepositReceivedPayload,
  SendSellerOfferReviewPayload,
  SendSellerOnboardingPayload,
  SendSellerOnboardingSubmittedPayload,
  SendSellerViewingAvailabilityRequestPayload,
  SendTransactionOperationsNotificationPayload,
  SendTransactionPartnerInvitationPayload,
  SendTransactionProgressDispatchPayload,
  SendTransactionRoleplayerHandoffPayload,
  SendTransactionRoleplayerIntroPayload,
  SendWeeklyDigestNotificationPayload,
  SendWorkspaceInvitePayload,
} from "./types.ts";
import { corsHeaders, jsonResponse } from "./utils/http.ts";
import { assessControlledTestRecipient } from "./utils/controlledTestRecipient.ts";
import { normalizeText } from "./utils/text.ts";
import {
  FINAL_SIGNED_LEGAL_DOCUMENT_DELIVERY_ROUTE_RETIRED,
  isRetiredFinalSignedLegalDocumentEmailType,
} from "./legalDocumentEgress.ts";

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

    // The generic endpoint cannot prove that a requested download link belongs
    // to a completed packet/version. Do this before the controlled-recipient
    // shortcut so every attempt receives the same fail-closed route result.
    if (isRetiredFinalSignedLegalDocumentEmailType(type)) {
      return jsonResponse(409, {
        success: false,
        error:
          "Final signed legal documents must be delivered through the packet-bound canonical final-delivery endpoint.",
        errorCode: FINAL_SIGNED_LEGAL_DOCUMENT_DELIVERY_ROUTE_RETIRED,
      });
    }

    const recipientSafety = assessControlledTestRecipient({
      email: recipient,
      recipientName: payload.recipientName ?? payload.recipient_name ??
        payload.buyerName ?? payload.sellerName,
      metadata: payload.metadata,
    });

    console.log("[send-email] incoming request", {
      resolvedType: type || null,
      hasType: Boolean(type),
      recipient: recipient || null,
      transactionId: transactionId || null,
      payloadKeys,
    });

    if (recipientSafety.suppressed) {
      console.log("[send-email] controlled test recipient suppressed", {
        resolvedType: type || null,
        recipient: recipient || null,
        transactionId: transactionId || null,
        reason: recipientSafety.reason,
      });
      return jsonResponse(202, {
        ok: true,
        suppressed: true,
        reason: recipientSafety.reason,
        message: recipientSafety.message,
      });
    }

    if (
      ["attorney_quote", "attorney_quote_email"].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "attorney_quote",
        transactionId: null,
      });
      return await handleAttorneyQuoteEmail(
        req,
        payload as SendAttorneyQuotePayload,
      );
    }

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

    if (
      "client_portal_link" === type || "client_portal" === type ||
      "portal_link" === type
    ) {
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

    if (
      [
        "kingstons_valuation_download",
        "kingstons_formal_valuation_download",
        "valuation_download",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "kingstons_valuation_download",
        recipient: recipient || null,
      });
      return await handleKingstonsValuationDownloadEmail(
        {
          ...(payload as SendKingstonsValuationDownloadPayload),
          type: "kingstons_valuation_download",
        },
      );
    }

    if (
      ["seller_onboarding", "seller_onboarding_link", "seller_portal_link"]
        .includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: type === "seller_portal_link"
          ? "seller_portal_link"
          : "seller_onboarding",
        recipient: recipient || null,
      });
      return await handleSellerOnboardingEmail(
        {
          ...(payload as SendSellerOnboardingPayload),
          type: type === "seller_portal_link"
            ? "seller_portal_link"
            : (payload as SendSellerOnboardingPayload).type,
          emailKind: type === "seller_portal_link"
            ? normalizeText(
              (payload as SendSellerOnboardingPayload).emailKind,
            ) || "portal_documents"
            : (payload as SendSellerOnboardingPayload).emailKind,
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

    if (
      ["seller_mandate_sent", "seller_mandate", "otp_signing"].includes(type)
    ) {
      // Signing invitations must be authorised against the packet, its exact
      // generated PDF, and its active signer token. The generic email router
      // has none of that context, so retaining this route would let callers
      // bypass the guarded send-mandate-signing-email endpoint.
      return jsonResponse(409, {
        success: false,
        error:
          "Signing invitations must be sent through the packet-bound delivery endpoint.",
        errorCode: type === "otp_signing"
          ? "OTP_SIGNING_DELIVERY_ROUTE_RETIRED"
          : "MANDATE_SIGNING_DELIVERY_ROUTE_RETIRED",
      });
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
        "lead_acknowledgement",
        "lead_acknowledgement_email",
        "property_enquiry_acknowledgement",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "lead_acknowledgement",
        recipient: recipient || null,
      });
      return await handleLeadAcknowledgementEmail(
        payload as SendLeadAcknowledgementPayload,
      );
    }

    if (
      [
        "new_enquiry_assigned_agent",
        "new_enquiry_unassigned_manager",
        "lead_assigned",
        "lead_reassigned",
        "lead_unassigned",
        "lead_claimed_confirmation",
        "buyer_viewing_times_submitted_agent",
        "lead_operations_notification",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "lead_operations_notification",
        requestedType: type,
        recipient: recipient || null,
        leadId: normalizeText(payload.leadId ?? payload.lead_id) || null,
      });
      return await handleLeadOperationsNotificationEmail({
        ...(payload as SendLeadOperationsNotificationPayload),
        type: type as SendLeadOperationsNotificationPayload["type"],
      });
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
        "buyer_viewing_availability_request",
        "buyer_viewing_request",
        "viewing_availability_request",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "buyer_viewing_availability_request",
        recipient: recipient || null,
        leadId: normalizeText(payload.leadId ?? payload.lead_id) || null,
      });
      return await handleBuyerViewingAvailabilityRequestEmail({
        ...(payload as SendBuyerViewingAvailabilityRequestPayload),
        type: type as SendBuyerViewingAvailabilityRequestPayload["type"],
      });
    }

    if (
      [
        "seller_viewing_availability_request",
        "seller_viewing_request",
        "viewing_access_availability_request",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "seller_viewing_availability_request",
        recipient: recipient || null,
        leadId: normalizeText(payload.leadId ?? payload.lead_id) || null,
      });
      return await handleSellerViewingAvailabilityRequestEmail({
        ...(payload as SendSellerViewingAvailabilityRequestPayload),
        type: type as SendSellerViewingAvailabilityRequestPayload["type"],
      });
    }

    if (
      [
        "additional_document_request",
        "document_request",
        "transaction_document_request",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "additional_document_request",
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleAdditionalDocumentRequestEmail({
        ...(payload as SendAdditionalDocumentRequestPayload),
        type: "additional_document_request",
        transactionId,
      });
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
        "organisation_partner_invitation",
        "organization_partner_invitation",
        "partner_organisation_invitation",
        "partner_organization_invitation",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "organisation_partner_invitation",
        recipient: recipient || null,
      });
      return await handleOrganisationPartnerInvitationEmail({
        ...(payload as SendOrganisationPartnerInvitationPayload),
        type: "organisation_partner_invitation",
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
      [
        "notification_controls_apply_queue",
        "notification_preferences_apply_queue",
        "notification_queue_controls",
        "notification_observability_snapshot",
        "notification_controls_snapshot",
        "notification_health_snapshot",
      ].includes(type)
    ) {
      console.log("[send-email] routing operation", {
        route: "notification_controls",
        type,
      });
      return await handleNotificationControlsOperation(
        req,
        payload as SendNotificationControlsPayload,
      );
    }

    if (
      [
        "notification_reminder_dispatch",
        "notification_reminder_dispatcher",
        "dispatch_notification_reminders",
        "notification_reminders_dispatch",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "notification_reminder_dispatch",
        requestedType: type,
      });
      return await handleNotificationReminderDispatchEmail(
        req,
        {
          ...(payload as SendNotificationReminderDispatchPayload),
          type: "notification_reminder_dispatch",
        },
      );
    }

    if (
      ["transaction_progress_dispatch", "transaction_progress_resend"].includes(
        type,
      )
    ) {
      console.log("[send-email] routing template", {
        route: "transaction_progress_dispatch",
        transactionId: transactionId || null,
      });
      return await handleTransactionProgressDispatchEmail(
        req,
        {
          ...(payload as SendTransactionProgressDispatchPayload),
          type: type as SendTransactionProgressDispatchPayload["type"],
          transactionId,
        },
      );
    }

    if (
      [
        "transaction_operations_notification",
        "transaction_operations_dispatch",
        "transaction_operations_resend",
        "transaction_operations_notifications_dispatch",
        "transaction_created",
        "transaction_owner_changed",
        "transaction_roleplayer_assigned",
        "transaction_roleplayer_reassigned",
        "transaction_partner_accepted",
        "transaction_partner_declined",
        "attorney_invite_accepted",
        "bond_originator_invite_accepted",
        "transaction_stage_changed",
        "transaction_stalled",
        "transaction_cancelled",
        "transaction_archived",
        "transaction_reactivated",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "transaction_operations_notification",
        type,
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleTransactionOperationsNotificationEmail(
        req,
        {
          ...(payload as SendTransactionOperationsNotificationPayload),
          type: type as SendTransactionOperationsNotificationPayload["type"],
          transactionId,
        },
      );
    }

    if (
      [
        "client_seller_portal_notification",
        "client_seller_portal_dispatch",
        "client_seller_portal_resend",
        "client_seller_portal_notifications_dispatch",
        "offer_viewed_by_seller",
        "offer_not_reviewed_reminder",
        "offer_review_overdue_escalation",
        "seller_mandate_viewed_unsigned_reminder",
        "seller_mandate_signing_overdue_escalation",
        "buyer_onboarding_opened",
        "buyer_onboarding_started_not_submitted_reminder",
        "buyer_onboarding_overdue_escalation",
        "buyer_onboarding_submitted_confirmation",
        "client_portal_message_received",
        "client_portal_document_uploaded",
        "client_portal_document_rejected",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "client_seller_portal_notification",
        type,
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleClientSellerPortalNotificationEmail(
        req,
        {
          ...(payload as SendClientSellerPortalNotificationPayload),
          type: type as SendClientSellerPortalNotificationPayload["type"],
          transactionId,
        },
      );
    }

    if (
      [
        "bond_attorney_legal_notification",
        "bond_attorney_legal_dispatch",
        "bond_attorney_legal_resend",
        "bond_attorney_legal_notifications_dispatch",
        "bond_application_submitted",
        "bond_application_status_changed",
        "bond_additional_documents_requested",
        "bond_document_uploaded",
        "bond_bank_offer_received",
        "bond_bank_offer_buyer_decision",
        "bond_grant_received",
        "bond_grant_published",
        "bond_delivery_failed",
        "attorney_instruction_ready",
        "attorney_instruction_accepted",
        "attorney_instruction_declined",
        "attorney_assignment_changed",
        "attorney_matter_stage_changed",
        "attorney_client_financial_document_published",
        "legal_packet_generated",
        "legal_packet_sent_for_signing",
        "legal_signer_viewed",
        "legal_signer_signed",
        "legal_packet_completed",
        "legal_signing_dispatch_failed",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "bond_attorney_legal_notification",
        type,
        recipient: recipient || null,
        transactionId: transactionId || null,
      });
      return await handleBondAttorneyLegalNotificationEmail(
        req,
        {
          ...(payload as SendBondAttorneyLegalNotificationPayload),
          type: type as SendBondAttorneyLegalNotificationPayload["type"],
          transactionId,
        },
      );
    }

    if (
      [
        "weekly_digest_notification",
        "weekly_digest_dispatch",
        "weekly_digest_resend",
        "weekly_digest_notifications_dispatch",
        "agent_weekly_lead_digest",
        "agent_weekly_transaction_digest",
        "agent_weekly_task_digest",
        "manager_weekly_team_digest",
        "principal_weekly_business_digest",
        "seller_weekly_listing_digest",
        "buyer_weekly_transaction_digest",
        "attorney_weekly_matter_digest",
        "bond_originator_weekly_pipeline_digest",
        "commercial_weekly_pipeline_digest",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "weekly_digest_notification",
        type,
        recipient: recipient || null,
      });
      return await handleWeeklyDigestNotificationEmail(
        req,
        {
          ...(payload as SendWeeklyDigestNotificationPayload),
          type: type as SendWeeklyDigestNotificationPayload["type"],
        },
      );
    }

    if (
      [
        "commercial_enterprise_notification",
        "commercial_enterprise_dispatch",
        "commercial_enterprise_resend",
        "commercial_enterprise_notifications_dispatch",
        "agency_public_intake_received",
        "commercial_access_requested",
        "commercial_access_decision",
        "commercial_broker_assigned",
        "commercial_canvassing_prospect_created",
        "commercial_requirement_created",
        "commercial_requirement_stage_changed",
        "commercial_deal_created",
        "commercial_deal_stage_changed",
        "commercial_viewing_scheduled",
        "commercial_viewing_status_changed",
        "commercial_document_request_created",
        "commercial_document_uploaded",
        "commercial_heads_of_terms_status_changed",
        "commercial_transaction_status_changed",
        "enterprise_member_scope_changed",
        "enterprise_branch_team_assignment_changed",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "commercial_enterprise_notification",
        type,
        recipient: recipient || null,
      });
      return await handleCommercialEnterpriseNotificationEmail(
        req,
        {
          ...(payload as SendCommercialEnterpriseNotificationPayload),
          type: type as SendCommercialEnterpriseNotificationPayload["type"],
        },
      );
    }

    if (
      [
        "workspace_invite",
        "team_invite",
        "branch_invite",
        "agent_invite",
        "developer_access_invite",
      ]
        .includes(type) &&
      (payload as SendWorkspaceInvitePayload).to
    ) {
      console.log("[send-email] routing template", {
        route: "workspace_invite",
        requestedType: type,
        recipient: recipient || null,
      });
      return await handleWorkspaceInviteEmail(
        payload as SendWorkspaceInvitePayload,
      );
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
        "arch9_training_request",
        "partner_training_request",
      ].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "arch9_launch_internal_notification",
        recipient: recipient || null,
      });
      return await handleArch9LaunchInternalNotificationEmail({
        ...(payload as SendArch9LaunchInternalNotificationPayload),
        type: type as SendArch9LaunchInternalNotificationPayload["type"],
      });
    }

    if (
      ["public_demo_enquiry", "demo_enquiry_notification"].includes(type)
    ) {
      console.log("[send-email] routing template", {
        route: "public_demo_enquiry",
        recipient: recipient || null,
      });
      return await handlePublicDemoEnquiryNotificationEmail(
        payload as SendPublicDemoEnquiryNotificationPayload,
      );
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
          "attorney_quote",
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
          "new_enquiry_assigned_agent",
          "new_enquiry_unassigned_manager",
          "lead_assigned",
          "lead_reassigned",
          "lead_unassigned",
          "lead_claimed_confirmation",
          "buyer_viewing_times_submitted_agent",
          "lead_operations_notification",
          "lead_property_share",
          "property_collection",
          "buyer_viewing_availability_request",
          "seller_viewing_availability_request",
          "additional_document_request",
          "document_request",
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
          "developer_access_invite",
          "notification_controls_apply_queue",
          "notification_preferences_apply_queue",
          "notification_queue_controls",
          "notification_observability_snapshot",
          "notification_controls_snapshot",
          "notification_health_snapshot",
          "notification_reminder_dispatch",
          "transaction_progress_dispatch",
          "transaction_progress_resend",
          "transaction_operations_notification",
          "transaction_operations_dispatch",
          "transaction_operations_resend",
          "transaction_operations_notifications_dispatch",
          "transaction_created",
          "transaction_owner_changed",
          "transaction_roleplayer_assigned",
          "transaction_roleplayer_reassigned",
          "transaction_partner_accepted",
          "transaction_partner_declined",
          "attorney_invite_accepted",
          "bond_originator_invite_accepted",
          "transaction_stage_changed",
          "transaction_stalled",
          "transaction_cancelled",
          "transaction_archived",
          "transaction_reactivated",
          "client_seller_portal_notification",
          "client_seller_portal_dispatch",
          "client_seller_portal_resend",
          "client_seller_portal_notifications_dispatch",
          "offer_viewed_by_seller",
          "offer_not_reviewed_reminder",
          "offer_review_overdue_escalation",
          "seller_mandate_viewed_unsigned_reminder",
          "seller_mandate_signing_overdue_escalation",
          "buyer_onboarding_opened",
          "buyer_onboarding_started_not_submitted_reminder",
          "buyer_onboarding_overdue_escalation",
          "buyer_onboarding_submitted_confirmation",
          "client_portal_message_received",
          "client_portal_document_uploaded",
          "client_portal_document_rejected",
          "bond_attorney_legal_notification",
          "bond_attorney_legal_dispatch",
          "bond_attorney_legal_resend",
          "bond_attorney_legal_notifications_dispatch",
          "bond_application_submitted",
          "bond_application_status_changed",
          "bond_additional_documents_requested",
          "bond_document_uploaded",
          "bond_bank_offer_received",
          "bond_bank_offer_buyer_decision",
          "bond_grant_received",
          "bond_grant_published",
          "bond_delivery_failed",
          "attorney_instruction_ready",
          "attorney_instruction_accepted",
          "attorney_instruction_declined",
          "attorney_assignment_changed",
          "attorney_matter_stage_changed",
          "attorney_client_financial_document_published",
          "legal_packet_generated",
          "legal_packet_sent_for_signing",
          "legal_signer_viewed",
          "legal_signer_signed",
          "legal_packet_completed",
          "legal_signing_dispatch_failed",
          "weekly_digest_notification",
          "weekly_digest_dispatch",
          "weekly_digest_resend",
          "weekly_digest_notifications_dispatch",
          "agent_weekly_lead_digest",
          "agent_weekly_transaction_digest",
          "agent_weekly_task_digest",
          "manager_weekly_team_digest",
          "principal_weekly_business_digest",
          "seller_weekly_listing_digest",
          "buyer_weekly_transaction_digest",
          "attorney_weekly_matter_digest",
          "bond_originator_weekly_pipeline_digest",
          "commercial_weekly_pipeline_digest",
          "commercial_enterprise_notification",
          "commercial_enterprise_dispatch",
          "commercial_enterprise_resend",
          "commercial_enterprise_notifications_dispatch",
          "agency_public_intake_received",
          "commercial_access_requested",
          "commercial_access_decision",
          "commercial_broker_assigned",
          "commercial_canvassing_prospect_created",
          "commercial_requirement_created",
          "commercial_requirement_stage_changed",
          "commercial_deal_created",
          "commercial_deal_stage_changed",
          "commercial_viewing_scheduled",
          "commercial_viewing_status_changed",
          "commercial_document_request_created",
          "commercial_document_uploaded",
          "kingstons_valuation_download",
          "kingstons_formal_valuation_download",
          "valuation_download",
          "commercial_heads_of_terms_status_changed",
          "commercial_transaction_status_changed",
          "enterprise_member_scope_changed",
          "enterprise_branch_team_assignment_changed",
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
          "arch9_training_request",
          "public_demo_enquiry",
          "legacy_test",
        ],
      });
    }

    return jsonResponse(400, {
      error:
        "Unknown email request type. Legacy test fallback is disabled for untyped/unknown requests.",
      receivedType: type,
      supportedTypes: [
        "attorney_quote",
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
        "new_enquiry_assigned_agent",
        "new_enquiry_unassigned_manager",
        "lead_assigned",
        "lead_reassigned",
        "lead_unassigned",
        "lead_claimed_confirmation",
        "buyer_viewing_times_submitted_agent",
        "lead_operations_notification",
        "lead_property_share",
        "property_collection",
        "additional_document_request",
        "document_request",
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
        "developer_access_invite",
        "notification_controls_apply_queue",
        "notification_preferences_apply_queue",
        "notification_queue_controls",
        "notification_observability_snapshot",
        "notification_controls_snapshot",
        "notification_health_snapshot",
        "notification_reminder_dispatch",
        "transaction_progress_dispatch",
        "transaction_progress_resend",
        "transaction_operations_notification",
        "transaction_operations_dispatch",
        "transaction_operations_resend",
        "transaction_operations_notifications_dispatch",
        "transaction_created",
        "transaction_owner_changed",
        "transaction_roleplayer_assigned",
        "transaction_roleplayer_reassigned",
        "transaction_partner_accepted",
        "transaction_partner_declined",
        "attorney_invite_accepted",
        "bond_originator_invite_accepted",
        "transaction_stage_changed",
        "transaction_stalled",
        "transaction_cancelled",
        "transaction_archived",
        "transaction_reactivated",
        "client_seller_portal_notification",
        "client_seller_portal_dispatch",
        "client_seller_portal_resend",
        "client_seller_portal_notifications_dispatch",
        "offer_viewed_by_seller",
        "offer_not_reviewed_reminder",
        "offer_review_overdue_escalation",
        "seller_mandate_viewed_unsigned_reminder",
        "seller_mandate_signing_overdue_escalation",
        "buyer_onboarding_opened",
        "buyer_onboarding_started_not_submitted_reminder",
        "buyer_onboarding_overdue_escalation",
        "buyer_onboarding_submitted_confirmation",
        "client_portal_message_received",
        "client_portal_document_uploaded",
        "client_portal_document_rejected",
        "bond_attorney_legal_notification",
        "bond_attorney_legal_dispatch",
        "bond_attorney_legal_resend",
        "bond_attorney_legal_notifications_dispatch",
        "bond_application_submitted",
        "bond_application_status_changed",
        "bond_additional_documents_requested",
        "bond_document_uploaded",
        "bond_bank_offer_received",
        "bond_bank_offer_buyer_decision",
        "bond_grant_received",
        "bond_grant_published",
        "bond_delivery_failed",
        "attorney_instruction_ready",
        "attorney_instruction_accepted",
        "attorney_instruction_declined",
        "attorney_assignment_changed",
        "attorney_matter_stage_changed",
        "attorney_client_financial_document_published",
        "legal_packet_generated",
        "legal_packet_sent_for_signing",
        "legal_signer_viewed",
        "legal_signer_signed",
        "legal_packet_completed",
        "legal_signing_dispatch_failed",
        "weekly_digest_notification",
        "weekly_digest_dispatch",
        "weekly_digest_resend",
        "weekly_digest_notifications_dispatch",
        "agent_weekly_lead_digest",
        "agent_weekly_transaction_digest",
        "agent_weekly_task_digest",
        "manager_weekly_team_digest",
        "principal_weekly_business_digest",
        "seller_weekly_listing_digest",
        "buyer_weekly_transaction_digest",
        "attorney_weekly_matter_digest",
        "bond_originator_weekly_pipeline_digest",
        "commercial_weekly_pipeline_digest",
        "commercial_enterprise_notification",
        "commercial_enterprise_dispatch",
        "commercial_enterprise_resend",
        "commercial_enterprise_notifications_dispatch",
        "agency_public_intake_received",
        "commercial_access_requested",
        "commercial_access_decision",
        "commercial_broker_assigned",
        "commercial_canvassing_prospect_created",
        "commercial_requirement_created",
        "commercial_requirement_stage_changed",
        "commercial_deal_created",
        "commercial_deal_stage_changed",
        "commercial_viewing_scheduled",
        "commercial_viewing_status_changed",
        "commercial_document_request_created",
        "commercial_document_uploaded",
        "kingstons_valuation_download",
        "kingstons_formal_valuation_download",
        "valuation_download",
        "commercial_heads_of_terms_status_changed",
        "commercial_transaction_status_changed",
        "enterprise_member_scope_changed",
        "enterprise_branch_team_assignment_changed",
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
        "arch9_training_request",
        "public_demo_enquiry",
        "legacy_test",
      ],
    });
  } catch (err) {
    console.error("Unhandled function error", err);
    return jsonResponse(500, { error: String(err) });
  }
});
