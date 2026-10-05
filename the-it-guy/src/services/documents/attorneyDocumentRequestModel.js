export const ATTORNEY_REQUEST_STATES = [
  { key: 'all', label: 'All requests' },
  { key: 'requested', label: 'Awaiting document' },
  { key: 'pending_review', label: 'Review needed' },
  { key: 'rejected', label: 'Correction needed' },
  { key: 'completed', label: 'Completed' },
]

const value = (row, camel, snake) => row?.[camel] ?? row?.[snake]
const canonicalId = row => value(row, 'canonicalRequirementInstanceId', 'canonical_requirement_instance_id') || ''
const normalized = text => String(text || '').trim().toLowerCase()
const recipientRoles = new Set(['buyer', 'seller', 'developer', 'agent', 'attorney', 'bond_originator'])

export function getAttorneyRequestUploadAudience(request, selectedVisibility) {
  const recipient = normalized(value(request, 'requestedFrom', 'requested_from'))
  return {
    visibilityScope: selectedVisibility === 'internal' ? 'internal' : selectedVisibility === 'client_visible' ? 'client' : 'professional_shared',
    clientRecipientRole: recipient === 'buyer' ? 'buyer' : ['seller', 'developer'].includes(recipient) ? 'seller' : null,
  }
}

export function buildAttorneyRequestRequirementOptions(requiredRows = [], requests = []) {
  const openIds = new Set(requests.filter(request => !['completed', 'cancelled', 'reviewed'].includes(normalized(request.status))).map(canonicalId).filter(Boolean))
  const seen = new Set()
  return requiredRows.flatMap(row => {
    const requirement = row.requirement || row.requiredDocument || row
    const id = canonicalId(requirement) || canonicalId(row)
    const role = normalized(requirement.requiredFromRole || requirement.expectedFromRole || requirement.requestedFromRole || requirement.requested_from_role || requirement.required_from_role)
    const recipient = role === 'transferring_attorney' ? 'attorney' : role
    if (!id || seen.has(id) || !recipientRoles.has(recipient)) return []
    seen.add(id)
    const status = normalized(requirement.status || row.status)
    const disabled = openIds.has(id) || ['uploaded', 'under_review', 'pending_review', 'approved', 'verified', 'completed', 'waived', 'not_applicable'].includes(status)
    const title = row.displayName || requirement.label || requirement.documentLabel || requirement.document_label || requirement.key || 'Required document'
    const party = requirement.partyName || requirement.entityName || row.requiredParty || recipient.replaceAll('_', ' ')
    return [{ id, title, label: `${title} · ${party}`, requestedFrom: recipient, disabled,
      documentType: requirement.key || requirement.documentKey || row.requiredDocumentKey || '',
      category: row.categoryLabel || row.category || 'Additional Requests', requirement,
      laneKey: requirement.laneKey || requirement.lane_key || requirement.owningWorkflow || row.relatedWorkflow || '',
      unavailableReason: openIds.has(id) ? 'Request already open' : disabled ? 'Already received or complete' : '',
    }]
  })
}

export function buildAttorneyDocumentRequestRows({ requests = [], documents = [], requiredRows = [], now = new Date() } = {}) {
  const fileLookup = new Map(documents.map(row => {
    const document = row.linkedDocument || row.raw || row.document || row
    return [document.id || row.id, { document, fileUrl: row.fileUrl || document.url || '', row }]
  }))
  const requirementLookup = new Map(requiredRows.map(row => {
    const requirement = row.requirement || row.requiredDocument || row
    return [canonicalId(requirement) || canonicalId(row), { requirement, row }]
  }))
  return requests.map(request => {
    const documentId = value(request, 'requestedDocumentId', 'requested_document_id') || ''
    const file = fileLookup.get(documentId)
    const linked = requirementLookup.get(canonicalId(request))
    const requirement = linked?.requirement || null
    const currentDocumentId = value(requirement, 'uploadedDocumentId', 'uploaded_document_id') || value(requirement, 'satisfiedByDocumentId', 'satisfied_by_document_id') || linked?.row?.linkedDocument?.id || ''
    const stale = Boolean(currentDocumentId && currentDocumentId !== documentId)
    const originalStatus = normalized(request.status)
    const state = originalStatus === 'cancelled' ? 'cancelled'
      : ['completed', 'reviewed', 'approved'].includes(originalStatus) ? 'completed'
        : originalStatus === 'rejected' ? 'rejected'
          : ['uploaded', 'under_review', 'pending_review'].includes(originalStatus) ? 'pending_review' : 'requested'
    const statusLabel = ATTORNEY_REQUEST_STATES.find(option => option.key === state)?.label || 'Cancelled'
    const dueDate = value(request, 'dueDate', 'due_date') || ''
    const overdue = ['requested', 'rejected'].includes(state) && dueDate && `${dueDate}T23:59:59` < localDateTime(now)
    return {
      id: request.id, documentRequestId: request.id, rawRequest: request,
      displayName: request.title || request.documentType || request.document_type || 'Additional document',
      status: state, statusLabel, requirement, canonicalRequirementInstanceId: canonicalId(request),
      document: file?.document || null, fileUrl: file?.fileUrl || '', documentId,
      hasFile: Boolean(file && (file.fileUrl || file.document.file_path || file.document.filePath)),
      canReview: Boolean(file && documentId && state === 'pending_review' && !stale), stale,
      requestedFrom: value(request, 'requestedFrom', 'requested_from') || request.assignedToRole || 'other',
      visibility: request.visibility || request.visibility_scope || 'shared_role_players',
      dueDate, overdue: Boolean(overdue), priority: request.additionalPriority || request.priority || 'normal',
      notes: request.notes || request.description || '',
      correctionReason: value(request, 'rejectedReason', 'rejected_reason') || requirement?.rejectionReason || requirement?.rejection_reason || '',
      category: request.category || '', requiredDocumentKey: request.documentType || request.document_type || '',
      relatedWorkflow: requirement?.owningWorkflow || file?.document.lane_key || '',
      updatedAt: value(request, 'updatedAt', 'updated_at') || value(request, 'createdAt', 'created_at') || '',
    }
  }).sort((left, right) => Number(right.overdue) - Number(left.overdue) || right.updatedAt.localeCompare(left.updatedAt))
}

function localDateTime(date) {
  const pad = part => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
