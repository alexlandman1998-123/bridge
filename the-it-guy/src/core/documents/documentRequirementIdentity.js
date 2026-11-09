// A custom name belongs to this requirement, never to the global legal matrix.
export function documentRequirementTypeKey(requirement = {}) {
  return requirement.document_definition_key || (requirement.id ? `custom_${requirement.id}` : '')
}

export function documentRequirementIdentity(requirement = {}) {
  return [
    requirement.context_type || '',
    requirement.context_id || '',
    requirement.document_definition_key || `custom:${requirement.id || ''}`,
    requirement.requested_from_contact_id || '',
  ].join('::')
}

export function preservesManualRequirement(requirement = {}) {
  return requirement.requirement_origin === 'manual' || requirement.applicability_override === 'removed'
}

export function effectiveDocumentRequirements(requirements = []) {
  return requirements.filter((requirement) => requirement.applicability_override !== 'removed' && requirement.status !== 'not_applicable')
}

export function documentRequirementLabel(requirement = {}, definition = {}) {
  return requirement.custom_label || definition.display_label || requirement.document_definition_key || 'Supporting document'
}

export function documentRequirementParty(row) {
  const role = String(row?.requested_from_role || '').trim().toLowerCase()
  // Transaction/onboarding compatibility rows use client for the buyer.
  // Explicit seller ownership must never enter the buyer's checklist.
  if (['client', 'purchaser', 'buying_client'].includes(role)) return 'buyer'
  if (['vendor', 'selling_client'].includes(role)) return 'seller'
  return role
}

// null permits legacy type matching; false is an explicit conflicting link.
export function matchDocumentRequirementLink(document = {}, requirement = {}) {
  const legacyId = document.requirement_id || document.requirementId
  const canonicalId = document.canonical_requirement_instance_id || document.canonicalRequirementInstanceId
  if (!legacyId && !canonicalId) return null
  if (legacyId && legacyId !== (requirement.id || requirement.requirement_id || requirement.requirementId)) return false
  const targetCanonicalId = requirement.canonical_requirement_instance_id || requirement.canonicalRequirementInstanceId ||
    (requirement.context_type ? requirement.id : '')
  if (canonicalId && canonicalId !== targetCanonicalId) return false
  return true
}

export function isDocumentRequirementRequired(requirement = {}) {
  if (requirement.required === false || requirement.is_required === false || requirement.isRequired === false) return false
  const level = String(requirement.requirement_level || requirement.requirementLevel || '').trim().toLowerCase()
  return !['optional', 'recommended'].includes(level)
}
