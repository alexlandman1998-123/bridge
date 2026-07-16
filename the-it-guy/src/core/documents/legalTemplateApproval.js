function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export const LEGAL_TEMPLATE_APPROVAL_ERROR_CODE = 'LEGAL_TEMPLATE_APPROVAL_REQUIRED'

export function readLegalTemplateApproval(template = {}) {
  const metadata = record(template.metadata_json || template.metadataJson)
  const nested = record(metadata.legal_review || metadata.legalReview)
  return {
    status: text(metadata.legal_review_status || metadata.legalApprovalStatus || nested.status).toLowerCase(),
    approvedAt: text(metadata.legal_approved_at || metadata.legalApprovedAt || nested.approvedAt),
    reference: text(metadata.legal_approval_reference || metadata.legalApprovalReference || nested.reference),
    revokedAt: text(metadata.legal_revoked_at || metadata.legalRevokedAt || nested.revokedAt),
  }
}

export function assessLegalTemplateApproval(template = {}, { expectedPacketType = '' } = {}) {
  const approval = readLegalTemplateApproval(template)
  const packetType = text(template.packet_type || template.packetType).toLowerCase()
  const status = text(template.status).toLowerCase()
  const approvedTime = Date.parse(approval.approvedAt)
  const reasons = []

  if (expectedPacketType && packetType !== text(expectedPacketType).toLowerCase()) reasons.push('PACKET_TYPE_MISMATCH')
  if (status !== 'published') reasons.push('TEMPLATE_NOT_PUBLISHED')
  if (template.is_active === false || template.isActive === false) reasons.push('TEMPLATE_NOT_ACTIVE')
  if (approval.status !== 'approved') reasons.push('LEGAL_REVIEW_NOT_APPROVED')
  if (!approval.approvedAt || !Number.isFinite(approvedTime)) reasons.push('LEGAL_APPROVAL_DATE_MISSING')
  if (Number.isFinite(approvedTime) && approvedTime > Date.now() + 5 * 60 * 1000) reasons.push('LEGAL_APPROVAL_DATE_IN_FUTURE')
  if (!approval.reference) reasons.push('LEGAL_APPROVAL_REFERENCE_MISSING')
  if (approval.revokedAt) reasons.push('LEGAL_APPROVAL_REVOKED')

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
  error.code = LEGAL_TEMPLATE_APPROVAL_ERROR_CODE
  error.details = assessment
  throw error
}
