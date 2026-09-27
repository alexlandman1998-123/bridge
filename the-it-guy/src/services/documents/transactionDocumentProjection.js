// The canonical register is the only source of transaction requirement rows.
// Legacy checklist-shaped fields below are a presentation adapter for the
// existing matter workspace, not a second requirement engine.
export function projectMatterDocumentRequirements(projection) {
  if (!projection || !Array.isArray(projection.requirements)) return null
  return projection.requirements.map((requirement) => {
    const key = String(requirement.document_definition_key || '').trim()
    const packKey = String(requirement.pack_key || '').trim()
    const role = String(requirement.requested_from_role || '').trim()
    const definition = requirement.document_definitions || {}
    return {
      id: requirement.id,
      canonicalRequirementInstanceId: requirement.id,
      key,
      label: definition.display_label || key.replaceAll('_', ' '),
      description: definition.description || '',
      groupKey: packKey,
      visibleSection: packKey,
      expectedFromRole: role,
      requiredFromRole: role,
      status: requirement.status,
      isBlocking: requirement.requirement_level === 'blocker',
      uploadedDocumentId: requirement.satisfied_by_document_id || null,
      rejectionReason: requirement.rejection_reason || '',
      source: 'canonical_projection',
    }
  })
}

export function mergeProjectedDocuments(documents = [], projection = null) {
  if (!projection || !Array.isArray(projection.documents)) return documents
  const byId = new Map()
  for (const document of [...projection.documents, ...documents]) {
    if (document?.id) byId.set(String(document.id), document)
  }
  return [...byId.values()]
}
