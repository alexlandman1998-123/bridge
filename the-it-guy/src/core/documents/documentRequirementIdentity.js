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

// null permits legacy type/alias matching only when the file has no request link.
export function matchDocumentRequirementLink(document = {}, requirement = {}) {
  const text = value => String(value || '').trim()
  const linkedId = text(document.requirement_id || document.requirementId)
  const targetId = text(requirement.requirement_id || requirement.requirementId || requirement.id)
  const linkedCanonicalId = text(document.canonical_requirement_instance_id || document.canonicalRequirementInstanceId)
  const targetCanonicalId = text(requirement.canonical_requirement_instance_id || requirement.canonicalRequirementInstanceId ||
    (requirement.context_type ? requirement.id : ''))
  if (linkedId && (!targetId || linkedId !== targetId)) return false
  if (linkedCanonicalId && targetCanonicalId) return linkedCanonicalId === targetCanonicalId
  if (linkedId) return true
  return linkedCanonicalId ? false : null
}

export function isDocumentRequirementRequired(requirement = {}) {
  const level = String(requirement.requirement_level || requirement.requirementLevel || '').trim().toLowerCase()
  return requirement.required !== false && requirement.is_required !== false && requirement.isRequired !== false &&
    !['optional', 'recommended'].includes(level)
}
