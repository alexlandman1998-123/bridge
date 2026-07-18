const SATISFIED_STATUSES = new Set(['approved', 'completed', 'verified'])
const RECEIVED_STATUSES = new Set(['uploaded', 'under_review', ...SATISFIED_STATUSES])
const OPEN_STATUSES = new Set(['required', 'requested', 'rejected', 'expired'])

function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizeSellerDocumentRequirementKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function requirementId(row = {}) {
  return normalizeText(row.id || row.requirement_id || row.requirementId)
}

function documentRequirementId(row = {}) {
  return normalizeText(row.requirement_id || row.requirementId)
}

function requirementKey(row = {}) {
  return normalizeSellerDocumentRequirementKey(row.requirement_key || row.key)
}

function documentKey(row = {}) {
  return normalizeSellerDocumentRequirementKey(
    row.requirement_key || row.requirementKey || row.document_type || row.documentType,
  )
}

export function documentExactlyMatchesSellerRequirement(document = {}, requirement = {}) {
  const targetId = requirementId(requirement)
  const linkedId = documentRequirementId(document)
  if (linkedId) return Boolean(targetId && linkedId === targetId)
  const targetKey = requirementKey(requirement)
  return Boolean(targetKey && documentKey(document) === targetKey)
}

export function resolveExactSellerRequirement({ requirements = [], requirementKey: key = '', requirementId: id = '' } = {}) {
  const normalizedId = normalizeText(id)
  const normalizedKey = normalizeSellerDocumentRequirementKey(key)
  const rows = Array.isArray(requirements) ? requirements : []
  if (normalizedId) return rows.find((row) => requirementId(row) === normalizedId) || null
  if (normalizedKey) return rows.find((row) => requirementKey(row) === normalizedKey) || null
  return null
}

export function assertSellerUploadTarget({
  listingId = '',
  requirement = null,
  requirementKey: suppliedKey = '',
  canonicalRequirement = null,
  canonicalRequirementInstanceId = '',
} = {}) {
  const expectedListingId = normalizeText(listingId)
  const normalizedSuppliedKey = normalizeSellerDocumentRequirementKey(suppliedKey)
  const canonicalId = normalizeText(canonicalRequirementInstanceId)

  if (normalizedSuppliedKey && !requirement) {
    throw new Error('The selected seller document request is no longer valid. Refresh the portal and try again.')
  }
  if (requirement) {
    const ownerListingId = normalizeText(requirement.private_listing_id || requirement.privateListingId)
    if (ownerListingId && ownerListingId !== expectedListingId) throw new Error('The document request belongs to another listing.')
    if (normalizedSuppliedKey && requirementKey(requirement) !== normalizedSuppliedKey) {
      throw new Error('The selected document does not match the requested document type.')
    }
    const status = normalizeSellerDocumentRequirementKey(requirement.status)
    if (['not_applicable', 'approved', 'completed'].includes(status)) throw new Error('This document request is already closed.')
    if (requirement.is_required === false) throw new Error('This document request is no longer required.')
    const visibility = normalizeSellerDocumentRequirementKey(requirement.document_visibility || requirement.visibility)
    if (visibility && visibility !== 'seller_visible') throw new Error('This document request is not available in the seller portal.')
  }

  if (canonicalId) {
    if (!canonicalRequirement || normalizeText(canonicalRequirement.id) !== canonicalId) {
      throw new Error('The canonical document request is invalid or unavailable.')
    }
    const contextMatches = normalizeText(canonicalRequirement.context_type) === 'private_listing'
      && [canonicalRequirement.context_id, canonicalRequirement.listing_id].map(normalizeText).includes(expectedListingId)
    if (!contextMatches) throw new Error('The canonical document request belongs to another listing.')
    const canonicalKey = normalizeSellerDocumentRequirementKey(canonicalRequirement.document_definition_key)
    if (requirement && canonicalKey && canonicalKey !== requirementKey(requirement)) {
      throw new Error('The canonical and seller document requests do not match.')
    }
    if (normalizedSuppliedKey && canonicalKey && canonicalKey !== normalizedSuppliedKey) {
      throw new Error('The canonical request does not match the selected document type.')
    }
    const uploadRoles = Array.isArray(canonicalRequirement.uploadable_by_roles) ? canonicalRequirement.uploadable_by_roles : []
    if (uploadRoles.length && !uploadRoles.map(normalizeSellerDocumentRequirementKey).includes('seller')) {
      throw new Error('This canonical document request cannot be uploaded by the seller.')
    }
  }
  return true
}

export function buildSellerDocumentAssuranceReport({ requirements = [], documents = [] } = {}) {
  const allRequirementRows = Array.isArray(requirements) ? requirements : []
  const requirementRows = allRequirementRows.filter((row) =>
    row?.is_required !== false && normalizeSellerDocumentRequirementKey(row?.status) !== 'not_applicable')
  const documentRows = Array.isArray(documents) ? documents : []
  const details = requirementRows.map((requirement) => {
    const matches = documentRows.filter((document) => documentExactlyMatchesSellerRequirement(document, requirement))
    const approvedEvidence = matches.filter((document) => SATISFIED_STATUSES.has(normalizeSellerDocumentRequirementKey(document.status)))
    const receivedEvidence = matches.filter((document) => RECEIVED_STATUSES.has(normalizeSellerDocumentRequirementKey(document.status)))
    const status = normalizeSellerDocumentRequirementKey(requirement.status)
    const verifiedSatisfierId = normalizeText(
      requirement.satisfied_by_document_id || requirement.satisfiedByDocumentId || requirement.canonical_satisfied_by_document_id,
    )
    const satisfied = approvedEvidence.length > 0 || (SATISFIED_STATUSES.has(status) && Boolean(verifiedSatisfierId))
    const falseCompletion = SATISFIED_STATUSES.has(status) && !satisfied
    return {
      requirement,
      matches,
      approvedEvidence,
      receivedEvidence,
      satisfied,
      received: receivedEvidence.length > 0,
      falseCompletion,
      open: OPEN_STATUSES.has(status) && !satisfied,
    }
  })
  const unmatchedDocuments = documentRows.filter((document) =>
    documentRequirementId(document) && !allRequirementRows.some((requirement) => documentExactlyMatchesSellerRequirement(document, requirement)))
  const missing = details.filter((item) => !item.satisfied)
  return {
    ready: missing.length === 0,
    totalRequired: details.length,
    satisfiedCount: details.filter((item) => item.satisfied).length,
    receivedCount: details.filter((item) => item.received).length,
    missingCount: missing.length,
    missing,
    falseCompletions: details.filter((item) => item.falseCompletion),
    unmatchedDocuments,
    details,
  }
}

export { RECEIVED_STATUSES, SATISFIED_STATUSES }
