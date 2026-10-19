import { documentRequirementParty } from '../../core/documents/documentRequirementIdentity.js'
const normalizedName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

export function requirementSubject(row) {
  if (row?.subject_id) return { subjectKind: row.subject_kind, subjectId: row.subject_id }
  if (row?.requested_from_contact_id) return { subjectKind: 'person', subjectId: row.requested_from_contact_id }
  return { subjectKind: 'party', subjectId: null }
}

// Exact identity/name matches only. Similar names are suggestions, never merges.
export function findDuplicateRequirements(requirements, context, payload, definitionLabel = '') {
  if (!context) return []
  const name = normalizedName(payload.label || definitionLabel)
  return requirements.filter(row => {
    if (row.context_type !== context.contextType || row.context_id !== context.contextId
      || documentRequirementParty(row) !== payload.party
      || (row.status === 'not_applicable' && row.applicability_override !== 'removed')) return false
    const subject = requirementSubject(row)
    if (subject.subjectKind !== (payload.subjectKind || 'party') || subject.subjectId !== (payload.subjectId || null)) return false
    if (payload.definitionKey && row.document_definition_key) return payload.definitionKey === row.document_definition_key
    const existingName = normalizedName(row.custom_label || row.document_definitions?.display_label)
    return Boolean(name && existingName === name)
  })
}
