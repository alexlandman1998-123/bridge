export const LEGAL_CLAUSE_PACK_SIGNATURE_RELEASE_VERSION = 'sa_legal_clause_pack_signature_release_v1'

const LEGAL_REVIEWER_ROLES = new Set(['attorney', 'platform_admin'])
const OPERATIONAL_REVIEWER_ROLES = new Set(['agent', ...LEGAL_REVIEWER_ROLES])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sortedUnique(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))].sort()
}

function sameValues(left = [], right = []) {
  const normalizedLeft = sortedUnique(left)
  const normalizedRight = sortedUnique(right)
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index])
}

export function resolveLegalSignatureReleaseReadiness(version = null) {
  const summary = asRecord(version?.validation_summary_json || version?.validationSummaryJson)
  const generationPayload = asRecord(summary.generationPayload || summary.generation_payload)
  return asRecord(
    summary.legalClausePackTransactionReadiness ||
      summary.legal_clause_pack_transaction_readiness ||
      generationPayload.legalClausePackTransactionReadiness ||
      generationPayload.legal_clause_pack_transaction_readiness,
  )
}

export function resolveLegalSignatureReleaseFingerprint(version = null) {
  const summary = asRecord(version?.validation_summary_json || version?.validationSummaryJson)
  const provenance = asRecord(summary.render_provenance || summary.renderProvenance)
  const frozenSnapshot = asRecord(summary.frozen_render_snapshot || summary.frozenRenderSnapshot)
  return normalizeText(
    provenance.contentFingerprint ||
      provenance.content_fingerprint ||
      frozenSnapshot.contentFingerprint ||
      frozenSnapshot.content_fingerprint,
  )
}

export function resolveLegalSignatureReleaseApproval(version = null) {
  const summary = asRecord(version?.validation_summary_json || version?.validationSummaryJson)
  return asRecord(
    summary.legal_signature_release ||
      summary.legalSignatureRelease ||
      summary.approval_snapshot?.legalSignatureRelease ||
      summary.approval_snapshot?.legal_signature_release,
  )
}

export function buildLegalSignatureReleaseApproval({
  version = null,
  reviewerRole = '',
  reviewerId = null,
  reviewerName = null,
  reviewedAt = new Date().toISOString(),
} = {}) {
  const readiness = resolveLegalSignatureReleaseReadiness(version)
  const attorneyReviewItems = Array.isArray(readiness.attorneyReviewItems) ? readiness.attorneyReviewItems : []
  return {
    schemaVersion: LEGAL_CLAUSE_PACK_SIGNATURE_RELEASE_VERSION,
    decision: 'approved',
    reviewedAt,
    reviewedByRole: normalizeKey(reviewerRole) || null,
    reviewedByUserId: normalizeText(reviewerId) || null,
    reviewedByName: normalizeText(reviewerName) || null,
    reviewerKind: attorneyReviewItems.length ? 'legal_specialist' : 'operational',
    packetVersionId: normalizeText(version?.id) || null,
    packetVersionNumber: Number(version?.version_number || version?.versionNumber || 0) || null,
    contentFingerprint: resolveLegalSignatureReleaseFingerprint(version) || null,
    readinessVersion: normalizeText(readiness.schemaVersion) || null,
    selectionKey: normalizeText(readiness.selectionKey) || null,
    attorneyReviewCodes: sortedUnique(attorneyReviewItems.map((item) => item?.code)),
  }
}

export function resolveLegalClausePackSignatureRelease({
  packet = null,
  version = null,
  actorRole = '',
} = {}) {
  const packetType = normalizeKey(packet?.packet_type || packet?.packetType)
  const readiness = resolveLegalSignatureReleaseReadiness(version)
  const governed = packetType === 'otp' && readiness.runtimeEnforced === true
  const attorneyReviewItems = Array.isArray(readiness.attorneyReviewItems) ? readiness.attorneyReviewItems : []
  const attorneyReviewCodes = sortedUnique(attorneyReviewItems.map((item) => item?.code))
  const requiresLegalSpecialist = attorneyReviewItems.length > 0
  const normalizedActorRole = normalizeKey(actorRole)
  const canApprove = governed && (
    requiresLegalSpecialist
      ? LEGAL_REVIEWER_ROLES.has(normalizedActorRole)
      : OPERATIONAL_REVIEWER_ROLES.has(normalizedActorRole)
  )
  const approval = resolveLegalSignatureReleaseApproval(version)
  const currentVersionId = normalizeText(version?.id)
  const currentFingerprint = resolveLegalSignatureReleaseFingerprint(version)
  const approvalVersionId = normalizeText(approval.packetVersionId || approval.packet_version_id)
  const approvalFingerprint = normalizeText(approval.contentFingerprint || approval.content_fingerprint)
  const approvalReviewCodes = Array.isArray(approval.attorneyReviewCodes)
    ? approval.attorneyReviewCodes
    : Array.isArray(approval.attorney_review_codes)
      ? approval.attorney_review_codes
      : []
  const approvalReviewerRole = normalizeKey(approval.reviewedByRole || approval.reviewed_by_role)
  const approvalRoleAuthorised = requiresLegalSpecialist
    ? LEGAL_REVIEWER_ROLES.has(approvalReviewerRole)
    : OPERATIONAL_REVIEWER_ROLES.has(approvalReviewerRole)
  const approvedDecision = normalizeKey(approval.decision) === 'approved'
  const matchesVersion = Boolean(currentVersionId && approvalVersionId && currentVersionId === approvalVersionId)
  const matchesFingerprint = currentFingerprint
    ? Boolean(approvalFingerprint && approvalFingerprint === currentFingerprint)
    : matchesVersion
  const matchesReviewScope = sameValues(attorneyReviewCodes, approvalReviewCodes)
  const approved = governed && approvedDecision && approvalRoleAuthorised && matchesVersion && matchesFingerprint && matchesReviewScope
  const invalidApprovalRole = governed && approvedDecision && !approvalRoleAuthorised
  const staleApproval = governed && approvedDecision && approvalRoleAuthorised && !approved
  const blockers = []

  if (governed) {
    if (readiness.canGenerate !== true) {
      blockers.push('Regenerate the OTP after resolving its transaction-readiness blockers.')
    }
    if (!approved) {
      if (invalidApprovalRole) {
        blockers.push(requiresLegalSpecialist
          ? 'The recorded approval was not completed by an attorney. Attorney approval is still required.'
          : 'The recorded approval was not completed by an authorised reviewer.')
      } else if (staleApproval) {
        blockers.push('The legal approval belongs to an older OTP version. Review and approve the current version.')
      } else if (requiresLegalSpecialist) {
        blockers.push('An attorney must review the flagged legal items and approve this OTP before signature release.')
      } else {
        blockers.push('Approve the current OTP version before sending it for signature.')
      }
    }
  }

  return {
    schemaVersion: LEGAL_CLAUSE_PACK_SIGNATURE_RELEASE_VERSION,
    governed,
    readiness,
    attorneyReviewItems,
    attorneyReviewCodes,
    requiresLegalSpecialist,
    actorRole: normalizedActorRole || null,
    canApprove,
    approval,
    approvalRoleAuthorised,
    approved,
    invalidApprovalRole,
    staleApproval,
    canSendForSignature: !governed || (readiness.canGenerate === true && approved),
    blockers,
  }
}
