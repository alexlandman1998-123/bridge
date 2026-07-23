function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export const LEGAL_TEMPLATE_APPROVAL_ERROR_CODE = 'LEGAL_TEMPLATE_APPROVAL_REQUIRED'
export const PHASE4_B3_RELEASE_CONTRACT = 'phase4-b3-integrity-v1'

export function readLegalTemplateApproval(template = {}) {
  const metadata = record(template.metadata_json || template.metadataJson)
  const nested = record(metadata.legal_review || metadata.legalReview)
  return {
    status: text(metadata.legal_review_status || metadata.legalApprovalStatus || nested.status).toLowerCase(),
    approvedAt: text(metadata.legal_approved_at || metadata.legalApprovedAt || nested.approvedAt),
    reference: text(metadata.legal_approval_reference || metadata.legalApprovalReference || nested.reference),
    contentDigest: text(metadata.legal_approval_content_digest || metadata.legalApprovalContentDigest || nested.contentDigest),
    reviewEvidenceDigest: text(metadata.legal_counsel_review_evidence_digest || metadata.legalCounselReviewEvidenceDigest || nested.reviewEvidenceDigest),
    revokedAt: text(metadata.legal_revoked_at || metadata.legalRevokedAt || nested.revokedAt),
    b1ManifestDigest: text(metadata.legal_b1_manifest_digest || metadata.legalB1ManifestDigest),
    b3AppliedAt: text(metadata.legal_b3_applied_at || metadata.legalB3AppliedAt),
    b3AppliedBy: text(metadata.legal_b3_applied_by || metadata.legalB3AppliedBy),
    b3ApplicationReference: text(metadata.legal_b3_application_reference || metadata.legalB3ApplicationReference),
    phase4B3ReleaseContract: text(metadata.legal_phase4_b3_release_contract || metadata.legalPhase4B3ReleaseContract),
  }
}

export function assessLegalTemplateApproval(template = {}, { expectedPacketType = '' } = {}) {
  const approval = readLegalTemplateApproval(template)
  const packetType = text(template.packet_type || template.packetType).toLowerCase()
  const status = text(template.status).toLowerCase()
  const approvedTime = Date.parse(approval.approvedAt)
  const b3AppliedTime = Date.parse(approval.b3AppliedAt)
  const reasons = []

  if (expectedPacketType && packetType !== text(expectedPacketType).toLowerCase()) reasons.push('PACKET_TYPE_MISMATCH')
  if (status !== 'published') reasons.push('TEMPLATE_NOT_PUBLISHED')
  // Match the Edge release gate exactly: a missing activity flag is not an
  // implicit approval for a legal template.
  if (template.is_active !== true && template.isActive !== true) reasons.push('TEMPLATE_NOT_ACTIVE')
  if (approval.status !== 'approved') reasons.push('LEGAL_REVIEW_NOT_APPROVED')
  if (!approval.approvedAt || !Number.isFinite(approvedTime)) reasons.push('LEGAL_APPROVAL_DATE_MISSING')
  if (Number.isFinite(approvedTime) && approvedTime > Date.now() + 5 * 60 * 1000) reasons.push('LEGAL_APPROVAL_DATE_IN_FUTURE')
  if (!approval.reference) reasons.push('LEGAL_APPROVAL_REFERENCE_MISSING')
  if (!approval.contentDigest) reasons.push('LEGAL_APPROVAL_CONTENT_DIGEST_MISSING')
  if (!approval.reviewEvidenceDigest) reasons.push('LEGAL_COUNSEL_REVIEW_EVIDENCE_MISSING')
  if (approval.revokedAt) reasons.push('LEGAL_APPROVAL_REVOKED')
  // A hand-written `approved` flag is not a runtime release. B3 is the
  // service-owned, audited promotion that binds the approval to its frozen
  // B1 review set; require it in the browser as well as in the Edge guard.
  if (!approval.b1ManifestDigest) reasons.push('LEGAL_B1_MANIFEST_BINDING_MISSING')
  if (!approval.b3AppliedAt || !Number.isFinite(b3AppliedTime)) reasons.push('LEGAL_B3_APPLICATION_TIME_MISSING')
  if (Number.isFinite(b3AppliedTime) && b3AppliedTime > Date.now() + 5 * 60 * 1000) reasons.push('LEGAL_B3_APPLICATION_TIME_IN_FUTURE')
  if (!approval.b3AppliedBy) reasons.push('LEGAL_B3_APPLIED_BY_MISSING')
  if (!approval.b3ApplicationReference) reasons.push('LEGAL_B3_APPLICATION_REFERENCE_MISSING')
  if (approval.phase4B3ReleaseContract !== PHASE4_B3_RELEASE_CONTRACT) reasons.push('LEGAL_B3_PHASE4_RELEASE_CONTRACT_MISSING')

  return {
    approved: reasons.length === 0,
    reasons,
    approval,
    templateId: text(template.id) || null,
    templateKey: text(template.template_key || template.templateKey) || null,
    packetType: packetType || null,
  }
}

export function assertLegalTemplateApproved(template = {}, options = {}) {
  const assessment = assessLegalTemplateApproval(template, options)
  if (assessment.approved) return assessment
  const error = new Error('Generation is locked until the selected legal template has a current, independently supplied legal approval.')
  error.code = assessment.reasons.some((reason) => reason.startsWith('LEGAL_B1_') || reason.startsWith('LEGAL_B3_'))
    ? 'LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED'
    : LEGAL_TEMPLATE_APPROVAL_ERROR_CODE
  error.details = assessment
  throw error
}
