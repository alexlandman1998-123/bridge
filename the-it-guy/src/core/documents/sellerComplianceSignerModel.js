export const SELLER_COMPLIANCE_SIGNER_MODEL_CONTRACT = 'arch9-seller-compliance-signer-model-v1'

export const SELLER_COMPLIANCE_SIGNER_STATUSES = Object.freeze({
  pending: 'pending',
  signed: 'signed',
  authorityUploaded: 'authority_uploaded',
  skippedByAuthority: 'skipped_by_authority',
})

export const SELLER_COMPLIANCE_SIGNER_ROLES = Object.freeze({
  seller: 'seller',
  seller1: 'seller_1',
  seller2: 'seller_2',
  spouse: 'spouse',
  director: 'director',
  trustee: 'trustee',
  executor: 'executor',
  representative: 'representative',
  authorisedSignatory: 'authorised_signatory',
})

const COMPLETE_STATUSES = new Set([
  SELLER_COMPLIANCE_SIGNER_STATUSES.signed,
  SELLER_COMPLIANCE_SIGNER_STATUSES.skippedByAuthority,
])

const VALID_STATUSES = new Set(Object.values(SELLER_COMPLIANCE_SIGNER_STATUSES))

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = key(value)
  if (['true', 'yes', 'y', '1', 'on', 'enabled'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'off', 'disabled'].includes(normalized)) return false
  return fallback
}

function isoDate(value, fallback = '') {
  const raw = text(value)
  if (!raw) return fallback
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : date.toISOString()
}

function normalizeRole(value, index = 0) {
  const role = key(value)
  if (role === 'seller') return index === 0 ? SELLER_COMPLIANCE_SIGNER_ROLES.seller1 : `seller_${index + 1}`
  if (role === 'wife' || role === 'husband' || role === 'partner') return SELLER_COMPLIANCE_SIGNER_ROLES.spouse
  if (role === 'company_director') return SELLER_COMPLIANCE_SIGNER_ROLES.director
  if (role === 'trust_trustee') return SELLER_COMPLIANCE_SIGNER_ROLES.trustee
  if (role === 'poa' || role === 'power_of_attorney') return SELLER_COMPLIANCE_SIGNER_ROLES.representative
  return role || (index === 0 ? SELLER_COMPLIANCE_SIGNER_ROLES.seller1 : `seller_${index + 1}`)
}

function roleLabel(role = '') {
  const normalized = key(role)
  const labels = {
    seller: 'Seller',
    seller_1: 'Seller 1',
    seller_2: 'Seller 2',
    spouse: 'Spouse / co-seller',
    director: 'Director',
    trustee: 'Trustee',
    executor: 'Executor',
    representative: 'Representative',
    authorised_signatory: 'Authorised signatory',
  }
  return labels[normalized] || normalized.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) || 'Signer'
}

function normalizeStatus(input = {}, required = true) {
  const status = key(input.status || input.signingStatus || input.signing_status)
  if (VALID_STATUSES.has(status)) return status
  if (text(input.signedAt || input.signed_at) || readSignatureValue(input)) {
    return SELLER_COMPLIANCE_SIGNER_STATUSES.signed
  }
  if (text(input.authorityDocumentId || input.authority_document_id || input.authority?.documentId || input.authority?.document_id)) {
    return SELLER_COMPLIANCE_SIGNER_STATUSES.authorityUploaded
  }
  return required ? SELLER_COMPLIANCE_SIGNER_STATUSES.pending : SELLER_COMPLIANCE_SIGNER_STATUSES.skippedByAuthority
}

function normalizeAudit(input = {}) {
  const audit = input.audit && typeof input.audit === 'object' ? input.audit : input
  return {
    ip: text(audit.ip || audit.ipAddress || audit.ip_address || audit.clientIp || audit.client_ip),
    userAgent: text(audit.userAgent || audit.user_agent),
    device: text(audit.device || audit.deviceType || audit.device_type),
    otpVerified: bool(audit.otpVerified ?? audit.otp_verified, false),
    otpVerifiedAt: isoDate(audit.otpVerifiedAt || audit.otp_verified_at),
  }
}

function normalizeAuthority(input = {}) {
  const authority = input.authority && typeof input.authority === 'object' ? input.authority : input
  return {
    reason: key(authority.reason || authority.authorityReason || authority.authority_reason),
    label: text(authority.label || authority.authorityLabel || authority.authority_label),
    documentId: text(authority.documentId || authority.document_id || authority.authorityDocumentId || authority.authority_document_id),
    documentName: text(authority.documentName || authority.document_name || authority.fileName || authority.file_name),
    uploadedAt: isoDate(authority.uploadedAt || authority.uploaded_at),
    reviewedAt: isoDate(authority.reviewedAt || authority.reviewed_at),
    reviewedBy: text(authority.reviewedBy || authority.reviewed_by),
    reviewStatus: key(authority.reviewStatus || authority.review_status),
  }
}

function normalizeAuthorityRequirement(input = {}) {
  const requirement = input.authorityRequirement && typeof input.authorityRequirement === 'object'
    ? input.authorityRequirement
    : input.authority_requirement && typeof input.authority_requirement === 'object'
      ? input.authority_requirement
      : input
  return {
    required: bool(requirement.required ?? requirement.is_required ?? input.authorityRequired ?? input.authority_required, false),
    reason: key(requirement.reason || requirement.authorityReason || requirement.authority_reason),
    key: key(requirement.key || requirement.requirementKey || requirement.requirement_key),
    label: text(requirement.label || requirement.name || requirement.requirementName || requirement.requirement_name),
    reviewRequired: bool(requirement.reviewRequired ?? requirement.review_required, false),
  }
}

function readSignatureValue(input = {}) {
  if (input.signature && typeof input.signature === 'object') {
    return text(input.signature.value || input.signature.dataUrl || input.signature.data_url)
  }
  return text(input.signature || input.signatureValue || input.signature_value || input.signatureImage || input.signature_image)
}

function normalizeSignature(input = {}) {
  return {
    value: readSignatureValue(input),
    type: key(input.signatureType || input.signature_type || input.signature?.type) || (text(input.signatureImage || input.signature_image) ? 'drawn' : ''),
  }
}

export function normalizeSellerComplianceSigner(input = {}, index = 0) {
  const required = bool(input.required ?? input.is_required, true)
  const role = normalizeRole(input.role || input.signerRole || input.signer_role, index)
  const signature = normalizeSignature(input)
  const status = normalizeStatus(input, required)
  const signedAt = isoDate(input.signedAt || input.signed_at)
  const authority = normalizeAuthority(input)
  const authorityRequirement = normalizeAuthorityRequirement(input)
  const id = text(input.id || input.signerId || input.signer_id) || `${role}-${index + 1}`
  const complete = !required || COMPLETE_STATUSES.has(status)

  return {
    id,
    name: text(input.name || input.signerName || input.signer_name || input.fullName || input.full_name) || roleLabel(role),
    email: text(input.email || input.signerEmail || input.signer_email).toLowerCase(),
    mobile: text(input.mobile || input.phone || input.signerMobile || input.signer_mobile || input.signerPhone || input.signer_phone),
    role,
    roleLabel: roleLabel(role),
    capacity: text(input.capacity || input.signingCapacity || input.signing_capacity),
    order: Number(input.order || input.signingOrder || input.signing_order) || index + 1,
    required,
    status,
    complete,
    signedAt: status === SELLER_COMPLIANCE_SIGNER_STATUSES.signed ? signedAt : '',
    signature,
    audit: normalizeAudit(input),
    authority,
    authorityRequired: authorityRequirement.required,
    authorityRequirement,
    source: text(input.source || input.sourcePath || input.source_path),
  }
}

export function normalizeSellerComplianceSigners(signers = []) {
  return (Array.isArray(signers) ? signers : [])
    .map((signer, index) => normalizeSellerComplianceSigner(signer, index))
    .sort((left, right) => left.order - right.order)
}

export function buildSellerComplianceSigningState({ signers = [] } = {}) {
  const rows = normalizeSellerComplianceSigners(signers)
  const requiredRows = rows.filter((signer) => signer.required)
  const completedRows = requiredRows.filter((signer) => signer.complete)
  const signedRows = requiredRows.filter((signer) => signer.status === SELLER_COMPLIANCE_SIGNER_STATUSES.signed)
  const authorityUploadedRows = requiredRows.filter((signer) => signer.status === SELLER_COMPLIANCE_SIGNER_STATUSES.authorityUploaded)
  const remainingRows = requiredRows.filter((signer) => !signer.complete)
  const nextSigner = remainingRows.find((signer) => signer.status === SELLER_COMPLIANCE_SIGNER_STATUSES.pending) || remainingRows[0] || null
  const complete = requiredRows.length > 0 && remainingRows.length === 0
  const status = complete
    ? 'complete'
    : authorityUploadedRows.length
      ? 'authority_review_required'
      : 'pending'

  return {
    contract: SELLER_COMPLIANCE_SIGNER_MODEL_CONTRACT,
    status,
    complete,
    signers: rows,
    signerCount: rows.length,
    requiredCount: requiredRows.length,
    completedCount: completedRows.length,
    signedCount: signedRows.length,
    remainingCount: remainingRows.length,
    authorityUploadedCount: authorityUploadedRows.length,
    skippedByAuthorityCount: requiredRows.filter((signer) => signer.status === SELLER_COMPLIANCE_SIGNER_STATUSES.skippedByAuthority).length,
    percent: requiredRows.length ? Math.round((completedRows.length / requiredRows.length) * 100) : 0,
    nextSigner,
    waitingOn: remainingRows.map((signer) => ({
      id: signer.id,
      name: signer.name,
      role: signer.role,
      roleLabel: signer.roleLabel,
      status: signer.status,
    })),
  }
}

function updateSigner(signers = [], signerId = '', updater = (signer) => signer) {
  const target = text(signerId)
  return normalizeSellerComplianceSigners(signers).map((signer) => {
    if (signer.id !== target && signer.role !== key(target) && signer.email !== text(target).toLowerCase()) return signer
    return normalizeSellerComplianceSigner(updater(signer), signer.order - 1)
  })
}

export function recordSellerComplianceSignerSignature(signers = [], signerId = '', signatureInput = {}) {
  const signedAt = isoDate(signatureInput.signedAt || signatureInput.signed_at, new Date().toISOString())
  return updateSigner(signers, signerId, (signer) => ({
    ...signer,
    status: SELLER_COMPLIANCE_SIGNER_STATUSES.signed,
    signedAt,
    signature: signatureInput.signature || signatureInput.signatureValue || signatureInput.signature_value || signer.signature?.value,
    signatureType: signatureInput.signatureType || signatureInput.signature_type || signer.signature?.type || 'drawn',
    audit: {
      ...signer.audit,
      ...normalizeAudit(signatureInput),
    },
  }))
}

export function recordSellerComplianceSignerAuthority(signers = [], signerId = '', authorityInput = {}) {
  return updateSigner(signers, signerId, (signer) => ({
    ...signer,
    status: SELLER_COMPLIANCE_SIGNER_STATUSES.authorityUploaded,
    authority: {
      ...signer.authority,
      ...normalizeAuthority(authorityInput),
    },
  }))
}

export function approveSellerComplianceSignerAuthority(signers = [], signerId = '', reviewInput = {}) {
  return updateSigner(signers, signerId, (signer) => ({
    ...signer,
    status: SELLER_COMPLIANCE_SIGNER_STATUSES.skippedByAuthority,
    authority: {
      ...signer.authority,
      reviewStatus: 'approved',
      reviewedAt: isoDate(reviewInput.reviewedAt || reviewInput.reviewed_at, new Date().toISOString()),
      reviewedBy: text(reviewInput.reviewedBy || reviewInput.reviewed_by),
    },
  }))
}
