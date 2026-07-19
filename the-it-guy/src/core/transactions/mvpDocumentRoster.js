export const MVP_DOCUMENT_ROSTER_VERSION = 'arch9_mvp_document_roster_v1'

const COMPLETE_STATUSES = new Set(['approved', 'complete', 'completed', 'signed', 'verified', 'satisfied', 'waived', 'not_applicable'])
const STATUS_RANK = Object.freeze({
  rejected: 5,
  approved: 4,
  completed: 4,
  verified: 4,
  signed: 4,
  uploaded: 3,
  under_review: 3,
  requested: 2,
  pending: 1,
})

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeStatus(value, uploaded = false) {
  const status = key(value)
  if (status) return status
  return uploaded ? 'uploaded' : 'pending'
}

function isComplete(status) {
  return COMPLETE_STATUSES.has(key(status))
}

function bestStatus(primary, secondary) {
  const primaryStatus = normalizeStatus(primary)
  const secondaryStatus = normalizeStatus(secondary)
  return (STATUS_RANK[secondaryStatus] || 0) > (STATUS_RANK[primaryStatus] || 0) ? secondaryStatus : primaryStatus
}

function normalizeRequirement(row = {}) {
  const documentKey = key(row.documentKey || row.document_key || row.key || row.documentType || row.document_type)
  return {
    id: text(row.id),
    documentKey,
    label: text(row.documentLabel || row.document_label || row.label || row.title) || documentKey || 'Required document',
    description: text(row.description),
    requiredFromRole: key(row.requiredFromRole || row.required_from_role || row.requestedFrom || row.requested_from || 'client'),
    groupKey: key(row.groupKey || row.group_key || row.category || 'transaction_documents'),
    groupLabel: text(row.groupLabel || row.group_label),
    isRequired: row.isRequired ?? row.is_required ?? row.required ?? true,
    enabled: row.enabled !== false,
    allowMultiple: Boolean(row.allowMultiple ?? row.allow_multiple),
    status: normalizeStatus(row.status || row.requiredDocumentStatus || row.required_document_status, Boolean(row.isUploaded ?? row.is_uploaded)),
    source: row.source || 'transaction_required_documents',
    linkedRequestId: text(row.linkedRequestId || row.linked_request_id),
  }
}

function normalizeRequest(row = {}) {
  return normalizeRequirement({
    ...row,
    documentKey: row.documentKey || row.document_key || row.documentType || row.document_type,
    label: row.title || row.label || row.documentType || row.document_type,
    requiredFromRole: row.requestedFrom || row.requested_from || row.assignedToRole || row.assigned_to_role,
    groupKey: row.category || 'additional_requests',
    isRequired: row.priority !== 'optional' && row.required !== false,
    enabled: true,
    source: 'document_request',
  })
}

/** Merges atomic transaction requirements and later document requests into one gate-safe checklist. */
export function buildMvpDocumentRoster({ requiredDocuments = [], documentRequests = [] } = {}) {
  const requirements = (Array.isArray(requiredDocuments) ? requiredDocuments : [])
    .map(normalizeRequirement)
    .filter((item) => item.documentKey)
  const requests = (Array.isArray(documentRequests) ? documentRequests : [])
    .map(normalizeRequest)
    .filter((item) => item.documentKey)
  const requestsByKey = new Map()
  for (const request of requests) {
    const existing = requestsByKey.get(request.documentKey)
    if (!existing || (STATUS_RANK[request.status] || 0) >= (STATUS_RANK[existing.status] || 0)) requestsByKey.set(request.documentKey, request)
  }

  const roster = requirements.map((requirement) => {
    const request = requestsByKey.get(requirement.documentKey) || null
    const status = request ? bestStatus(requirement.status, request.status) : requirement.status
    return {
      ...requirement,
      status,
      complete: isComplete(status),
      linkedRequestId: request?.id || requirement.linkedRequestId || null,
      source: request ? 'atomic_requirement_with_request' : requirement.source,
    }
  })
  const knownKeys = new Set(roster.map((item) => item.documentKey))
  for (const request of requests) {
    if (knownKeys.has(request.documentKey)) continue
    roster.push({ ...request, complete: isComplete(request.status) })
  }

  const required = roster.filter((item) => item.enabled && item.isRequired !== false)
  const outstanding = required.filter((item) => !item.complete)
  return {
    version: MVP_DOCUMENT_ROSTER_VERSION,
    requirements: roster,
    summary: {
      total: roster.length,
      required: required.length,
      complete: required.filter((item) => item.complete).length,
      outstanding: outstanding.length,
      rejected: required.filter((item) => item.status === 'rejected').length,
      uploadedForReview: required.filter((item) => ['uploaded', 'under_review'].includes(item.status)).length,
    },
    blockers: outstanding.map((item) => ({
      key: `document:${item.documentKey}`,
      documentKey: item.documentKey,
      ownerRole: item.requiredFromRole || 'transaction_coordinator',
      reason: item.status === 'rejected'
        ? `${item.label} was rejected and needs attention.`
        : `${item.label} is still required.`,
    })),
  }
}
