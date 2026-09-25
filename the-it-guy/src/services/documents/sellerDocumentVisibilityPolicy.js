const SELLER_VISIBLE_VALUES = new Set([
  'seller_visible',
  'client_visible',
  'client',
  'seller',
  'public',
])

const INTERNAL_VALUES = new Set([
  'internal',
  'internal_only',
  'agent_only',
  'manager_only',
  'compliance_only',
])

const ROLE_PLAYER_VALUES = new Set([
  'shared_role_players',
  'role_player',
  'role_player_only',
  'professional_shared',
])

function normalize(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function resolveSellerDocumentVisibility(record = {}) {
  return normalize(
    record?.visibility ||
    record?.document_visibility ||
    record?.visibilityScope ||
    record?.visibility_scope ||
    record?.metadata?.visibility ||
    record?.metadata?.document_visibility,
  )
}

function recordExplicitlyClientVisible(record = {}) {
  return record?.clientVisible === true ||
    record?.client_visible === true ||
    record?.visibleToSeller === true ||
    record?.visible_to_seller === true
}

function recordExplicitlyClientHidden(record = {}) {
  return record?.clientVisible === false ||
    record?.client_visible === false ||
    record?.visibleToSeller === false ||
    record?.visible_to_seller === false
}

export function isSellerPortalVisibleRequirement(requirement = {}) {
  if (recordExplicitlyClientHidden(requirement)) return false
  const visibility = resolveSellerDocumentVisibility(requirement)
  if (INTERNAL_VALUES.has(visibility) || ROLE_PLAYER_VALUES.has(visibility)) return false
  if (recordExplicitlyClientVisible(requirement)) return true
  if (SELLER_VISIBLE_VALUES.has(visibility)) return true
  if (visibility) return false

  // Seller requirement engines pre-date explicit visibility on some records.
  // A requirement addressed to the seller remains visible; an unclassified
  // generic requirement does not cross the portal boundary.
  const audience = normalize(
    requirement?.expectedFromRole ||
    requirement?.expected_from_role ||
    requirement?.applies_to ||
    requirement?.appliesTo ||
    requirement?.requested_from ||
    requirement?.requestedFrom,
  )
  return audience.includes('seller')
}

function requirementReferenceValues(record = {}) {
  return [
    record?.id,
    record?.key,
    record?.requirement_key,
    record?.requirementKey,
    record?.requirement_id,
    record?.requirementId,
    record?.document_requirement_id,
    record?.documentRequirementId,
    record?.canonical_requirement_instance_id,
    record?.canonicalRequirementInstanceId,
  ].map(normalize).filter(Boolean)
}

function findLinkedRequirement(document = {}, requirements = []) {
  const documentReferences = new Set(requirementReferenceValues(document))
  if (!documentReferences.size) return null
  return requirements.find((requirement) =>
    requirementReferenceValues(requirement).some((reference) => documentReferences.has(reference)),
  ) || null
}

export function isSellerPortalVisibleDocument(document = {}, { requirement = null } = {}) {
  if (recordExplicitlyClientHidden(document)) return false
  const visibility = resolveSellerDocumentVisibility(document)
  if (INTERNAL_VALUES.has(visibility) || ROLE_PLAYER_VALUES.has(visibility)) return false
  if (recordExplicitlyClientVisible(document)) return true
  if (SELLER_VISIBLE_VALUES.has(visibility)) return true
  if (visibility) return false

  // Legacy uploads without a visibility value are only released when they are
  // attached to a requirement that is itself safe for the seller portal.
  return Boolean(requirement && isSellerPortalVisibleRequirement(requirement))
}

export function filterSellerPortalRequirements(requirements = []) {
  return (Array.isArray(requirements) ? requirements : [])
    .filter((requirement) => isSellerPortalVisibleRequirement(requirement))
}

export function filterSellerPortalDocuments(documents = [], requirements = []) {
  const safeRequirements = Array.isArray(requirements) ? requirements : []
  return (Array.isArray(documents) ? documents : [])
    .filter((document) => isSellerPortalVisibleDocument(document, {
      requirement: findLinkedRequirement(document, safeRequirements),
    }))
}

export function resolveSellerDocumentAudienceAccess(record = {}, audience = 'seller') {
  const normalizedAudience = normalize(audience)
  const visibility = resolveSellerDocumentVisibility(record)

  if (normalizedAudience === 'agent' || normalizedAudience === 'manager') return true
  if (normalizedAudience === 'compliance_reviewer' || normalizedAudience === 'compliance') {
    return visibility !== 'manager_only'
  }
  if (normalizedAudience === 'role_player' || normalizedAudience === 'professional') {
    return ROLE_PLAYER_VALUES.has(visibility)
  }
  return isSellerPortalVisibleDocument(record)
}
