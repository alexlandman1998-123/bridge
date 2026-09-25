import { invokeEdgeFunction, supabase } from "../../lib/supabaseClient.js";
import {
  buildSellerChangeReviewCanonicalPayload,
  buildSellerParticipantInvitationUrl,
  normalizeSellerCollaborationWorkspace,
} from "./listingSellerCollaborationModel.js";

const requireClient = () => {
  if (!supabase)
    throw new Error(
      "Seller collaboration requires a configured Supabase connection.",
    );
  return supabase;
};

async function rpc(name, args) {
  const { data, error } = await requireClient().rpc(name, args);
  if (error) throw error;
  return data;
}

export async function getListingSellerCollaborationWorkspace(listingId) {
  return normalizeSellerCollaborationWorkspace(
    await rpc("bridge_listing_seller_collaboration_workspace", {
      p_listing_id: listingId,
    }),
  );
}

export async function inviteListingSellerParticipant({
  listingId,
  displayName,
  email,
  role,
  authorityScope = [],
  visibleSections = [],
  propertyTitle = "",
  agencyName = "",
}) {
  const prepared = await rpc("bridge_create_listing_seller_participant", {
    p_listing_id: listingId,
    p_display_name: displayName,
    p_email: email,
    p_participant_role: role,
    p_authority_scope: authorityScope,
    p_visible_sections: visibleSections.length
      ? visibleSections
      : ["listing", "tasks", "documents", "messages"],
  });
  const participant = prepared?.participant;
  const invitationUrl = buildSellerParticipantInvitationUrl(
    window.location.origin,
    prepared?.invitationToken,
  );
  try {
    const delivery = await invokeEdgeFunction("send-email", {
      body: {
        type: "seller_portal_link",
        emailKind: "seller_participant",
        to: email,
        listingId,
        recipientRole: "seller_participant",
        recipientName: displayName,
        sellerName: displayName,
        propertyTitle,
        agencyName,
        onboardingLink: invitationUrl,
        portalLink: invitationUrl,
        subject: `Your Seller Portal access for ${propertyTitle || "the property"}`,
      },
    });
    if (delivery?.error || delivery?.data?.error)
      throw delivery.error || new Error(delivery.data.error);
    await rpc("bridge_record_listing_seller_invitation_delivery", {
      p_participant_id: participant.id,
      p_status: "sent",
      p_error: null,
    });
  } catch (error) {
    await rpc("bridge_record_listing_seller_invitation_delivery", {
      p_participant_id: participant.id,
      p_status: "failed",
      p_error: error?.message || String(error),
    }).catch(() => null);
    error.participant = participant;
    error.retryable = true;
    throw error;
  }
  return { participant, invitationUrl };
}

export async function activateListingSellerParticipant(
  invitationToken,
  password,
) {
  return rpc("bridge_activate_listing_seller_participant", {
    p_invitation_token: invitationToken,
    p_password: password,
  });
}

export async function verifyListingSellerParticipant(participantId, password) {
  return rpc("bridge_verify_listing_seller_participant", {
    p_participant_id: participantId,
    p_password: password,
  });
}

export async function getListingSellerParticipantPayload(
  participantId,
  accessToken,
) {
  return rpc("bridge_listing_seller_participant_payload", {
    p_participant_id: participantId,
    p_access_token: accessToken,
  });
}

export async function submitListingSellerChange({
  participantId,
  accessToken,
  sensitivity,
  proposedPatch,
  changedFields,
  expectedVersion,
}) {
  return rpc("bridge_submit_listing_seller_change", {
    p_participant_id: participantId,
    p_access_token: accessToken,
    p_sensitivity: sensitivity,
    p_proposed_patch: proposedPatch,
    p_changed_fields: changedFields,
    p_expected_participant_version: expectedVersion,
  });
}

export async function reviewListingSellerChange({
  request,
  listing,
  decision,
  note = "",
  reviewPatch = null,
}) {
  const canonicalUpdate =
    decision === "approve"
      ? buildSellerChangeReviewCanonicalPayload({
          listing,
          request,
          reviewPatch,
        })
      : null;
  return rpc("bridge_review_listing_seller_change", {
    p_change_request_id: request.id,
    p_decision: decision,
    p_review_note: note || null,
    p_canonical_update: canonicalUpdate,
  });
}

export async function queueListingSellerActionNotification({
  participantId,
  type,
  subject,
  message,
}) {
  return rpc("bridge_queue_listing_seller_action_notification", {
    p_participant_id: participantId,
    p_notification_type: type,
    p_subject: subject,
    p_message: message,
  });
}

export async function retryListingSellerNotification(notificationEventId) {
  return rpc("bridge_retry_listing_seller_notification", {
    p_notification_event_id: notificationEventId,
  });
}

export default {
  activateListingSellerParticipant,
  getListingSellerCollaborationWorkspace,
  getListingSellerParticipantPayload,
  inviteListingSellerParticipant,
  queueListingSellerActionNotification,
  retryListingSellerNotification,
  reviewListingSellerChange,
  submitListingSellerChange,
  verifyListingSellerParticipant,
};
