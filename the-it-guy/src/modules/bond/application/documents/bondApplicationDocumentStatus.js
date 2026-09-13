function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function getBondApplicationDocumentIdentity(value = {}) {
  return normalizeKey(value.document_key || value.key || value.requirement_key || value.documentType || value.document_type)
}

export function normalizeBondApplicationDocumentStatus(value) {
  const status = normalizeKey(value)
  if (['accepted', 'approved', 'verified', 'complete', 'completed'].includes(status)) return 'accepted'
  if (['uploaded', 'received'].includes(status)) return 'uploaded'
  if (['under_review', 'pending_review', 'review', 'pending'].includes(status)) return 'uploaded_pending_review'
  if (['rejected', 'reupload_required', 'replacement_required', 'needs_replacement', 'invalid'].includes(status)) return 'rejected'
  if (['not_required', 'inactive', 'cancelled', 'canceled', 'superseded'].includes(status)) return 'not_currently_required'
  return 'missing'
}

export function isBuyerVisibleDocument(document = {}) {
  const role = normalizeKey(document.uploaded_by_role || document.uploadedByRole || document.required_from_role || document.requiredFromRole)
  const party = normalizeKey(document.uploaded_by_party || document.uploadedByParty || document.requested_from || document.requestedFrom)
  const scope = normalizeKey(document.visibility_scope || document.visibilityScope)
  const category = normalizeKey(document.category || document.group_key || document.groupKey)
  if (role && !['client', 'buyer', 'primary_applicant', 'co_applicant', 'surety'].includes(role)) return false
  if (party && !['buyer', 'client', 'primary_applicant', 'co_applicant', 'surety'].includes(party)) return false
  if (category.includes('seller') || category.includes('attorney')) return false
  if (scope && ['internal', 'admin', 'seller'].includes(scope)) return false
  if (document.is_client_visible === false || document.clientVisible === false) return false
  return true
}

function documentStatus(document = {}) {
  if (document.archived_at || document.deleted_at) return 'not_currently_required'
  const statuses = [document.status, document.requiredDocumentStatus, document.review_status]
    .filter((value) => String(value || '').trim()).map(normalizeBondApplicationDocumentStatus)
  if (statuses.includes('not_currently_required')) return 'not_currently_required'
  if (statuses.includes('rejected')) return 'rejected'
  return normalizeBondApplicationDocumentStatus(document.review_status || document.status || document.requiredDocumentStatus)
}

export function isDocumentAccepted(document = {}) {
  return documentStatus(document) === 'accepted'
}

export function isDocumentUploaded(document = {}) {
  const status = documentStatus(document)
  if (['rejected', 'not_currently_required'].includes(status)) return false
  return ['accepted', 'uploaded', 'uploaded_pending_review'].includes(status) || Boolean(document.id || document.file_path || document.storage_path)
}

export function getBondApplicationDocumentBuyerStatus({ requirement, matchedDocuments = [] } = {}) {
  if (!requirement?.active) return 'not_currently_required'
  const documents = matchedDocuments.filter(Boolean)
  if (!documents.length) return 'missing'
  const acceptedCount = documents.filter(isDocumentAccepted).length
  const uploadedCount = documents.filter(isDocumentUploaded).length
  const rejectedCount = documents.filter((document) =>
    documentStatus(document) === 'rejected',
  ).length
  const minimum = Math.max(Number(requirement.minimumFileCount || 1), 1)
  if (rejectedCount > 0 && uploadedCount < minimum) return 'rejected'
  if (requirement.satisfactionMode === 'accepted') {
    if (acceptedCount >= minimum) return 'satisfied'
    if (uploadedCount > 0) return uploadedCount >= minimum ? 'uploaded_pending_review' : 'partially_satisfied'
    return 'missing'
  }
  if (uploadedCount >= minimum) return documents.some((document) =>
    documentStatus(document) === 'uploaded_pending_review',
  ) ? 'uploaded_pending_review' : 'satisfied'
  return uploadedCount > 0 ? 'partially_satisfied' : 'missing'
}

export function getBondApplicationDocumentBuyerStatusLabel(status) {
  if (status === 'satisfied') return 'Already received'
  if (status === 'uploaded_pending_review') return 'Under review'
  if (status === 'rejected') return 'Needs attention'
  if (status === 'partially_satisfied') return 'Partially received'
  if (status === 'not_currently_required') return 'No longer required'
  return 'Still required'
}

export { normalizeKey as normalizeBondApplicationDocumentKey }
