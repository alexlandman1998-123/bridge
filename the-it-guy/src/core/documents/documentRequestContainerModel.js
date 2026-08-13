import { resolveDocumentRequestUploadOwnership } from './documentRequestUploadOwnershipModel.js'

export const DOCUMENT_REQUEST_CONTAINER_MODEL_VERSION = 'document_request_container_model_v1'

const CLIENT_VISIBLE = 'client_visible'
const SHARED_ROLE_PLAYERS = 'shared_role_players'
const INTERNAL_ONLY = 'internal_only'
const REQUIRED_SOURCE = 'transaction_required_documents'
const REQUEST_SOURCE = 'document_requests'

const OPEN_STATUSES = new Set(['required', 'requested', 'missing', 'rejected'])
const UPLOADED_STATUSES = new Set(['uploaded', 'under_review', 'reviewed'])
const COMPLETE_STATUSES = new Set(['approved', 'complete', 'completed', 'verified', 'accepted'])
const BOND_ORIGINATOR_VISIBLE_CONTAINER_KEYS = new Set([
  'bond_approval',
  'grant_signed',
  'income_affordability_documents',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function normalizeRole(value = '', fallback = 'client') {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (normalized === 'bond') return 'bond_originator'
  if (normalized === 'both' || normalized === 'buyer_seller' || normalized === 'both_buyer_and_seller') return 'buyer_and_seller'
  return normalized
}

function normalizeVisibility(value = '', fallback = SHARED_ROLE_PLAYERS) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (normalized === 'client' || normalized === CLIENT_VISIBLE) return CLIENT_VISIBLE
  if (normalized === 'shared' || normalized === SHARED_ROLE_PLAYERS || normalized === 'professional_shared') return SHARED_ROLE_PLAYERS
  if (normalized === 'internal' || normalized === INTERNAL_ONLY) return INTERNAL_ONLY
  return normalized
}

function normalizeStatus(value = '', fallback = 'requested') {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (normalized === 'not_uploaded') return 'missing'
  if (normalized === 'pending') return 'requested'
  if (normalized === 'awaiting_review') return 'under_review'
  if (normalized === 'approved') return 'approved'
  return normalized
}

function normalizePriority(value = '', fallback = 'required') {
  const normalized = normalizeKey(value)
  if (['urgent', 'required', 'important', 'normal', 'optional'].includes(normalized)) return normalized
  return fallback
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function hasLinkedDocument(row = {}) {
  return Boolean(
    row.linkedDocument ||
      row.uploadedDocument ||
      row.uploaded_document ||
      row.requestedDocumentId ||
      row.requested_document_id ||
      row.uploadedDocumentId ||
      row.uploaded_document_id ||
      row.uploaded_document ||
      row.uploaded_document_id ||
      row.uploaded_at ||
      row.uploadedAt ||
      row.is_uploaded ||
      row.isUploaded,
  )
}

export function resolveDocumentRequestContainerAudience({ requestedFrom = '', visibility = '', createdByRole = '' } = {}) {
  const normalizedRequestedFrom = normalizeRole(requestedFrom, 'client')
  const normalizedVisibility = normalizeVisibility(visibility)
  const requester = normalizeRole(createdByRole, '')
  const audiences = ['agent', 'attorney', 'internal']

  if (requester) audiences.push(requester)
  if (normalizedVisibility === INTERNAL_ONLY) return Object.freeze(unique(['internal', requester].filter(Boolean)))
  if (normalizedRequestedFrom === 'buyer' || normalizedRequestedFrom === 'buyer_and_seller' || normalizedRequestedFrom === 'client') {
    audiences.push('buyer')
  }
  if (normalizedRequestedFrom === 'seller' || normalizedRequestedFrom === 'buyer_and_seller' || normalizedRequestedFrom === 'client') {
    audiences.push('seller')
  }
  if (normalizedRequestedFrom === 'bond_originator' || requester === 'bond_originator') {
    audiences.push('bond_originator')
  }
  if (normalizedVisibility === SHARED_ROLE_PLAYERS) {
    audiences.push('bond_originator')
  }
  return Object.freeze(unique(audiences))
}

function maybeAddBondOriginatorAudience(audiences = [], documentKey = '', row = {}) {
  if (row.originatorVisible === true || row.originator_visible === true || BOND_ORIGINATOR_VISIBLE_CONTAINER_KEYS.has(normalizeKey(documentKey))) {
    audiences.push('bond_originator')
  }
  return audiences
}

export function resolveDefaultDocumentRequestVisibility(requestedFrom = '', explicitVisibility = '') {
  if (normalizeText(explicitVisibility)) {
    return normalizeVisibility(explicitVisibility)
  }
  const normalizedRequestedFrom = normalizeRole(requestedFrom, 'buyer')
  if (['buyer', 'seller', 'buyer_and_seller', 'client'].includes(normalizedRequestedFrom)) {
    return CLIENT_VISIBLE
  }
  return SHARED_ROLE_PLAYERS
}

export function normalizeRequiredDocumentContainer(row = {}, options = {}) {
  const transactionId = normalizeText(row.transactionId || row.transaction_id || options.transactionId)
  const documentKey = normalizeKey(
    row.canonicalDocumentRequestKey ||
      row.canonical_document_request_key ||
      row.documentKey ||
      row.document_key ||
      row.key ||
      row.id ||
      row.requirement_key,
  )
  const requestedFrom = normalizeRole(row.requestedFrom || row.requested_from || row.requiredFromRole || row.required_from_role || row.expectedFromRole || row.required_from || row.ownerRole, 'buyer')
  const visibility = normalizeVisibility(row.visibility || row.visibility_scope || row.default_visibility || CLIENT_VISIBLE, CLIENT_VISIBLE)
  const rawStatus = normalizeStatus(row.status || row.requiredDocumentStatus || row.required_document_status || (hasLinkedDocument(row) ? 'uploaded' : 'required'), 'required')
  const status = hasLinkedDocument(row) && OPEN_STATUSES.has(rawStatus) ? 'uploaded' : rawStatus
  const containerId = normalizeText(row.sourceId || row.id || row.requirementId || row.requirement_id || documentKey)
  const uploadOwnership = resolveDocumentRequestUploadOwnership({
    documentKey,
    ownerRole: row.requestedByRole || row.requested_by_role || row.ownerRole || row.owner_role || requestedFrom,
    requestedFrom,
    visibility,
  })

  return Object.freeze({
    id: `required:${transactionId || 'transaction'}:${documentKey || containerId}`,
    source: REQUIRED_SOURCE,
    sourceId: containerId,
    transactionId,
    canonicalKey: documentKey,
    documentKey,
    title: normalizeText(row.label || row.documentLabel || row.document_label || row.requirement_name || row.name || 'Required document'),
    description: normalizeText(row.description || row.requirement_description),
    category: normalizeText(row.groupLabel || row.group_label || row.group || row.groupKey || row.group_key || 'Required Documents'),
    requestedFrom,
    requestedByRole: normalizeRole(row.requestedByRole || row.requested_by_role || row.ownerRole || row.owner_role, requestedFrom),
    visibility,
    priority: row.is_required === false || row.isRequired === false ? 'optional' : 'required',
    status,
    blocker: normalizeKey(row.blocker || row.blocksStage || row.blocks_stage),
    dueDate: normalizeText(row.dueDate || row.due_date || row.requestDueAt || row.request_due_at),
    requestGroupId: null,
    linkedDocumentId: normalizeText(row.uploadedDocumentId || row.uploaded_document_id || row.requestedDocumentId || row.requested_document_id),
    parentDocumentKey: normalizeKey(row.parentDocumentKey || row.parent_document_key || row.canonicalParentKey || row.canonical_parent_key),
    childRequirementKey: normalizeKey(row.childRequirementKey || row.child_requirement_key || row.requirementKey || row.requirement_key),
    childContainer: row.childContainer === true || row.child_container === true,
    parentContainer: row.parentContainer === true || row.parent_container === true,
    uploadSpec: COMPLETE_STATUSES.has(status)
      ? null
      : {
          type: 'required_document',
          documentKey,
          requirementId: containerId,
        },
    uploadOwnership,
    responsiblePartyRole: uploadOwnership.responsiblePartyRole,
    uploadableByRoles: uploadOwnership.uploadableByRoles,
    uploadOnBehalfAllowed: uploadOwnership.uploadOnBehalfAllowed,
    visibleTo: Object.freeze(unique(maybeAddBondOriginatorAudience(
      [...resolveDocumentRequestContainerAudience({ requestedFrom, visibility })],
      documentKey,
      row,
    ))),
    blocksReadiness: OPEN_STATUSES.has(status),
    hasUploadedDocument: hasLinkedDocument(row) || UPLOADED_STATUSES.has(status) || COMPLETE_STATUSES.has(status),
    createdAt: normalizeText(row.createdAt || row.created_at),
    updatedAt: normalizeText(row.updatedAt || row.updated_at),
  })
}

export function normalizeAdditionalDocumentRequestContainer(row = {}, options = {}) {
  const transactionId = normalizeText(row.transactionId || row.transaction_id || options.transactionId)
  const requestId = normalizeText(row.sourceId || row.id || row.requestId || row.request_id || row.title || row.document_type || 'additional_request')
  const requestedFrom = normalizeRole(row.requestedFrom || row.requested_from || row.assignedToRole || row.assigned_to_role, 'buyer')
  const createdByRole = normalizeRole(row.createdByRole || row.created_by_role || row.requestedByRole || row.requested_by_role, 'attorney')
  const visibility = resolveDefaultDocumentRequestVisibility(requestedFrom, row.visibility || row.visibility_scope)
  const rawStatus = normalizeStatus(row.status || (hasLinkedDocument(row) ? 'uploaded' : 'requested'), 'requested')
  const status = hasLinkedDocument(row) && OPEN_STATUSES.has(rawStatus) ? 'uploaded' : rawStatus
  const title = normalizeText(row.title || row.documentName || row.document_name || row.documentType || row.document_type || 'Additional document request')
  const documentKey = normalizeKey(row.documentKey || row.document_key || row.documentType || row.document_type || title)
  const uploadOwnership = resolveDocumentRequestUploadOwnership({
    documentKey,
    ownerRole: createdByRole,
    requestedFrom,
    visibility,
  })

  return Object.freeze({
    id: `request:${requestId}`,
    source: REQUEST_SOURCE,
    sourceId: requestId,
    transactionId,
    canonicalKey: normalizeKey(row.canonicalDocumentRequestKey || row.canonical_document_request_key),
    documentKey,
    title,
    description: normalizeText(row.description || row.notes),
    category: normalizeText(row.category || 'Additional Requests'),
    requestedFrom,
    requestedByRole: createdByRole,
    visibility,
    priority: normalizePriority(row.priority, 'required'),
    status,
    blocker: normalizeKey(row.blocker || row.blocksStage || row.blocks_stage || 'additional_document_request'),
    dueDate: normalizeText(row.dueDate || row.due_date),
    requestGroupId: normalizeText(row.requestGroupId || row.request_group_id),
    linkedDocumentId: normalizeText(row.requestedDocumentId || row.requested_document_id || row.uploadedDocumentId || row.uploaded_document_id),
    uploadSpec: COMPLETE_STATUSES.has(status)
      ? null
      : {
          type: 'additional_request',
          requestId,
        },
    uploadOwnership,
    responsiblePartyRole: uploadOwnership.responsiblePartyRole,
    uploadableByRoles: uploadOwnership.uploadableByRoles,
    uploadOnBehalfAllowed: uploadOwnership.uploadOnBehalfAllowed,
    visibleTo: resolveDocumentRequestContainerAudience({ requestedFrom, visibility, createdByRole }),
    blocksReadiness: OPEN_STATUSES.has(status) && normalizePriority(row.priority, 'required') !== 'optional',
    hasUploadedDocument: hasLinkedDocument(row) || UPLOADED_STATUSES.has(status) || COMPLETE_STATUSES.has(status),
    createdAt: normalizeText(row.createdAt || row.created_at),
    updatedAt: normalizeText(row.updatedAt || row.updated_at),
  })
}

export function filterDocumentRequestContainersForAudience(containers = [], audience = 'internal') {
  const normalizedAudience = normalizeRole(audience, 'internal')
  if (normalizedAudience === 'admin' || normalizedAudience === 'internal_admin') return containers
  if (normalizedAudience === 'client') {
    return containers.filter((container) => container.visibleTo.includes('buyer') || container.visibleTo.includes('seller'))
  }
  return containers.filter((container) => container.visibleTo.includes(normalizedAudience))
}

export function summarizeDocumentRequestContainers(containers = []) {
  return Object.freeze({
    total: containers.length,
    canonicalRequired: containers.filter((container) => container.source === REQUIRED_SOURCE).length,
    additionalRequests: containers.filter((container) => container.source === REQUEST_SOURCE).length,
    blocking: containers.filter((container) => container.blocksReadiness).length,
    uploaded: containers.filter((container) => container.hasUploadedDocument).length,
    byRequestedFrom: Object.freeze(containers.reduce((acc, container) => {
      acc[container.requestedFrom] = (acc[container.requestedFrom] || 0) + 1
      return acc
    }, {})),
    byAudience: Object.freeze(containers.reduce((acc, container) => {
      for (const audience of container.visibleTo || []) {
        acc[audience] = (acc[audience] || 0) + 1
      }
      return acc
    }, {})),
    byStatus: Object.freeze(containers.reduce((acc, container) => {
      acc[container.status] = (acc[container.status] || 0) + 1
      return acc
    }, {})),
  })
}

export function buildDocumentRequestContainerModel({
  transactionId = '',
  requiredDocuments = [],
  additionalRequests = [],
  audience = 'internal',
} = {}) {
  const allContainers = [
    ...requiredDocuments.map((row) => normalizeRequiredDocumentContainer(row, { transactionId })),
    ...additionalRequests.map((row) => normalizeAdditionalDocumentRequestContainer(row, { transactionId })),
  ]
  const deduped = []
  const seen = new Set()
  for (const container of allContainers) {
    if (seen.has(container.id)) continue
    seen.add(container.id)
    deduped.push(container)
  }
  const containers = filterDocumentRequestContainersForAudience(deduped, audience)
  return Object.freeze({
    version: DOCUMENT_REQUEST_CONTAINER_MODEL_VERSION,
    audience: normalizeRole(audience, 'internal'),
    containers: Object.freeze(containers),
    allContainers: Object.freeze(deduped),
    summary: summarizeDocumentRequestContainers(containers),
    allSummary: summarizeDocumentRequestContainers(deduped),
  })
}
