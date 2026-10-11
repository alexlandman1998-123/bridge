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
