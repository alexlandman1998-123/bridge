export const ATTORNEY_DOCUMENT_VERSION_KINDS = [
  { value: 'draft', label: 'Working draft' },
  { value: 'final', label: 'Ready for signature' },
  { value: 'signed', label: 'Signed copy' },
  { value: 'evidence', label: 'Supporting evidence' },
]

export function isAttorneyWorkingCopy(document = {}) {
  return ['draft', 'final'].includes(document.attorney_version_kind) || document.document_type === 'attorney_working_copy'
}

// History is shown separately. Unsigned drafts never enter evidence matching,
// readiness counts, request review or legal-task completion.
export function getCurrentAttorneyEvidenceDocuments(documents = []) {
  const latest = new Map()
  for (const document of documents) {
    if (isAttorneyWorkingCopy(document)) continue
    const root = `${document.transaction_id || ''}:${document.attorney_version_root_id || document.id}`
    const previous = latest.get(root)
    if (!previous || Number(document.attorney_version_number || 1) > Number(previous.attorney_version_number || 1)) latest.set(root, document)
  }
  return [...latest.values()]
}

export function buildAttorneyDocumentVersionGroups({ documents = [], requirements = [] } = {}) {
  const groups = new Map()
  for (const document of documents) {
    if (!document.attorney_version_root_id) continue
    const key = `${document.transaction_id}:${document.attorney_version_root_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(document)
  }
  return [...groups.entries()].map(([id, versions]) => {
    versions.sort((a, b) => Number(b.attorney_version_number) - Number(a.attorney_version_number))
    const current = versions[0]
    const requirementId = current.attorney_target_requirement_id || ''
    const requirement = requirements.find(row => String(row.canonicalRequirementInstanceId || row.canonical_requirement_instance_id || row.id) === String(requirementId))
    return {
      id, current, versions, requirement,
      title: requirement?.label || requirement?.displayName || current.attorney_version_document_type?.replaceAll('_', ' ') || current.name,
      requirementId,
      laneKey: current.lane_key,
      activeEvidenceId: requirement?.linkedDocument?.id || requirement?.uploadedDocumentId || requirement?.uploaded_document_id || requirement?.satisfiedByDocumentId || requirement?.satisfied_by_document_id || '',
    }
  }).filter(group => group.versions.length > 1 || group.current.attorney_version_kind !== 'evidence')
    .sort((a, b) => String(b.current.created_at || '').localeCompare(String(a.current.created_at || '')))
}

export function buildAttorneyVersionUploadContext(document = {}) {
  return {
    attorneyPreviousVersionId: document.id || null,
    canonicalRequirementInstanceId: document.attorney_target_requirement_id || document.canonical_requirement_instance_id || null,
    documentRequestId: document.attorney_target_request_id || null,
    documentType: document.attorney_version_document_type || document.document_type || '',
    category: document.category || 'Drafting Documents',
    attorneyLaneKey: document.lane_key || null,
    relatedEntityType: document.related_entity_type || null,
    relatedEntityId: document.related_entity_id || null,
    uploadedByParty: document.uploaded_by_party || 'attorney',
    visibilityScope: isAttorneyWorkingCopy(document) ? 'internal' : document.visibility_scope || 'internal',
    clientRecipientRole: document.client_recipient_role || null,
  }
}

export function mergeSavedAttorneyDocumentVersion(documents = [], saved) {
  return [saved, ...documents.filter(document => document.id !== saved.id).map(document => {
    if (document.id !== saved.attorney_version_previous_id || document.attorney_version_root_id) return document
    return { ...document, attorney_version_root_id: saved.attorney_version_root_id, attorney_version_number: 1,
      attorney_version_kind: 'evidence', attorney_version_document_type: document.document_type,
      attorney_target_requirement_id: saved.attorney_target_requirement_id, attorney_target_request_id: saved.attorney_target_request_id,
    }
  })]
}
