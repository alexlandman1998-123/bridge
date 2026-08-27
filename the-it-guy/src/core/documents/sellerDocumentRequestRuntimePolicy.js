import { resolveDocumentRequestUploadOwnership } from './documentRequestUploadOwnershipModel.js'

export const SELLER_DOCUMENT_REQUEST_RUNTIME_POLICY_VERSION = 'seller_document_request_runtime_policy_v1'

export const DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS = Object.freeze([
  'property_acquisition_record',
  'capital_improvement_records',
])

const DEFERRED_SELLER_UPLOAD_KEYS = new Set(DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS)

// These are captured as structured onboarding facts, not uploaded files.
export const SELLER_CAPTURE_ONLY_REQUIREMENT_KEYS = Object.freeze([
  'body_corporate_details',
  'hoa_contact_details',
  'hoa_details',
])

const SELLER_CAPTURE_ONLY_KEYS = new Set(SELLER_CAPTURE_ONLY_REQUIREMENT_KEYS)

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function resolveSellerDocumentRequestKey(requirement = {}) {
  return normalizeKey(
    requirement?.canonicalDocumentRequestKey ||
      requirement?.canonical_document_request_key ||
      requirement?.documentRequestCanonicalKey ||
      requirement?.document_request_canonical_key ||
      requirement?.key ||
      requirement?.requirementKey ||
      requirement?.requirement_key ||
      requirement?.documentKey ||
      requirement?.document_key ||
      requirement?.documentType ||
      requirement?.document_type ||
      requirement?.id ||
      '',
  )
}

export function isDeferredSellerUploadRequirement(requirement = {}) {
  return DEFERRED_SELLER_UPLOAD_KEYS.has(resolveSellerDocumentRequestKey(requirement))
}

export function isSellerCaptureOnlyRequirement(requirement = {}) {
  return SELLER_CAPTURE_ONLY_KEYS.has(resolveSellerDocumentRequestKey(requirement))
}

export function isPendingSellerDocumentPolicyRequirement(requirement = {}) {
  const level = normalizeKey(
    requirement?.canonicalDocumentRequestLevel ||
      requirement?.canonical_document_request_level ||
      requirement?.requiredLevel ||
      requirement?.required_level ||
      requirement?.level ||
      '',
  )
  return level.startsWith('pending_policy_') || requirement?.pendingPolicy === true || requirement?.pending_policy === true
}

export function isProfessionalOnlySellerRequirement(requirement = {}) {
  const visibility = normalizeKey(
    requirement?.canonicalDocumentRequestVisibility ||
      requirement?.canonical_document_request_visibility ||
      requirement?.canonicalRequestVisibility ||
      requirement?.visibilityScope ||
      requirement?.visibility_scope ||
      requirement?.visibility ||
      requirement?.document_visibility ||
      '',
  )
  if (visibility === 'professional_shared' || visibility === 'internal' || visibility === 'internal_only') return true

  return resolveDocumentRequestUploadOwnership({
    documentKey: resolveSellerDocumentRequestKey(requirement),
    ownerRole:
      requirement?.canonicalDocumentRequestOwnerRole ||
      requirement?.canonical_document_request_owner_role ||
      requirement?.ownerRole ||
      requirement?.owner_role ||
      '',
    requestedFrom:
      requirement?.requestedFrom ||
      requirement?.requested_from ||
      requirement?.expectedFromRole ||
      requirement?.expected_from_role ||
      'seller',
    visibility,
  }).professionalOnly
}

export function isSellerClientUploadRequirementAllowed(requirement = {}) {
  if (isDeferredSellerUploadRequirement(requirement)) return false
  if (isSellerCaptureOnlyRequirement(requirement)) return false
  if (isPendingSellerDocumentPolicyRequirement(requirement)) return false
  if (isProfessionalOnlySellerRequirement(requirement)) return false
  return true
}

export function filterSellerClientUploadRequirements(requirements = []) {
  return (Array.isArray(requirements) ? requirements : []).filter(isSellerClientUploadRequirementAllowed)
}
