import { buildListingSellerCanonicalUpdate } from "./listingSellerCanonicalUpdateModel.js";

export const SELLER_PARTICIPANT_ROLES = Object.freeze([
  ["primary_owner", "Primary owner"],
  ["co_owner", "Co-owner"],
  ["spouse", "Spouse"],
  ["director", "Director"],
  ["trustee", "Trustee"],
  ["executor", "Executor"],
  ["authorised_representative", "Authorised representative"],
  ["signatory", "Signatory"],
]);

export const SELLER_CHANGE_SENSITIVITIES = Object.freeze([
  ["legal_identity", "Legal identity"],
  ["ownership", "Ownership"],
  ["authority", "Authority to sign"],
  ["financial", "Financial information"],
  ["compliance", "Compliance information"],
  ["general", "General details"],
]);

const SENSITIVITY_PATTERNS = Object.freeze({
  legal_identity:
    /(?:name|identity|idNumber|passport|registrationNumber|dateOfBirth|nationality)/i,
  ownership:
    /(?:owner|ownership|titleDeed|shareholding|beneficialOwner|marital|spouse)/i,
  authority:
    /(?:authority|signatory|director|trustee|executor|powerOfAttorney|resolution)/i,
  financial: /(?:bank|bond|account|tax|income|sourceOfFunds|price|commission)/i,
  compliance: /(?:fica|popi|compliance|sanction|pep|proofOfAddress)/i,
});

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value) => String(value ?? "").trim();

export function classifySellerChangeSensitivity(fields = []) {
  const joined = (Array.isArray(fields) ? fields : []).join(" ");
  return (
    Object.entries(SENSITIVITY_PATTERNS).find(([, pattern]) =>
      pattern.test(joined),
    )?.[0] || "general"
  );
}

export function normalizeSellerCollaborationWorkspace(payload = {}) {
  const participants = Array.isArray(payload?.participants)
    ? payload.participants
    : [];
  const changeRequests = Array.isArray(payload?.changeRequests)
    ? payload.changeRequests
    : [];
  const notifications = Array.isArray(payload?.notifications)
    ? payload.notifications
    : [];
  return {
    participants: participants.map((row) => ({
      ...row,
      id: text(row.id),
      displayName: text(row.display_name || row.displayName),
      role: text(row.participant_role || row.role),
      invitationStatus: text(
        row.invitation_delivery_status || row.invitationStatus || "pending",
      ),
      invitationError: text(row.invitation_error || row.invitationError),
    })),
    changeRequests: changeRequests.map((row) => ({
      ...row,
      id: text(row.id),
      participantId: text(row.participant_id || row.participantId),
      participantName: text(row.participantName || row.participant_name),
      sensitivity: text(row.sensitivity || "general"),
      status: text(row.status || "pending"),
      proposedPatch: object(row.proposed_patch || row.proposedPatch),
      changedFields: Array.isArray(row.changed_fields)
        ? row.changed_fields
        : Array.isArray(row.changedFields)
          ? row.changedFields
          : [],
      canReview: row.canReview !== false,
    })),
    notifications,
    pendingCount: changeRequests.filter((row) => text(row.status) === "pending")
      .length,
    conflictCount: changeRequests.filter(
      (row) => text(row.status) === "conflict",
    ).length,
    failedDeliveryCount:
      participants.filter(
        (row) =>
          text(row.invitation_delivery_status || row.invitationStatus) ===
          "failed",
      ).length +
      notifications.filter((row) => text(row.status) === "failed").length,
  };
}

export function buildSellerChangeReviewCanonicalPayload({
  listing = {},
  request = {},
  reviewPatch = null,
} = {}) {
  const proposedPatch = object(
    reviewPatch || request.proposedPatch || request.proposed_patch,
  );
  const update = buildListingSellerCanonicalUpdate({
    listing,
    formPatch: proposedPatch,
    mutationType: "seller_proposed_change_approved",
    source: "seller_collaboration_review",
  });
  return {
    mutationId: update.mutationId,
    formData: update.nextFormData,
    canonicalFacts: update.canonicalFacts,
    canonicalReadiness: update.readiness,
    listingPatch: update.listingPatch,
    onboardingStatus: update.onboardingStatus,
    sellerType: update.sellerType,
    ownershipStructure: update.ownershipStructure,
    maritalRegime: update.maritalRegime,
  };
}

export function buildSellerParticipantInvitationUrl(origin, invitationToken) {
  const base = text(origin).replace(/\/$/, "");
  return `${base}/seller/collaboration/invite/${encodeURIComponent(text(invitationToken))}`;
}

export default {
  SELLER_CHANGE_SENSITIVITIES,
  SELLER_PARTICIPANT_ROLES,
  buildSellerChangeReviewCanonicalPayload,
  buildSellerParticipantInvitationUrl,
  classifySellerChangeSensitivity,
  normalizeSellerCollaborationWorkspace,
};
