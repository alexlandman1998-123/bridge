import {
  createTransactionDocumentRequests,
  fetchTransactionDocumentRequests,
  updateTransactionDocumentRequestStatus,
} from '../lib/api'

function isAdditionalDocumentRequest(request = {}) {
  const requestType = String(request?.requestType || request?.request_type || '').trim().toLowerCase()
  const category = String(request?.category || '').trim().toLowerCase()
  return requestType === 'additional_document_request' || category === 'additional requests'
}

export async function createAdditionalDocumentRequest(payload = {}) {
  const requests = [payload]
  const created = await createTransactionDocumentRequests({
    transactionId: payload.transactionId,
    createdByRole: payload.createdByRole,
    requests: requests.map((item) => ({
      title: item.documentName || item.title,
      notes: item.notes || item.reason || '',
      priority: item.priority || 'normal',
      dueDate: item.dueDate || null,
      requestedFrom: item.requestedFrom || 'buyer',
      visibility: item.visibility || 'shared_role_players',
      requestType: 'additional_document_request',
      status: item.status || 'requested',
      category: item.category || 'Additional Requests',
    })),
  })
  return Array.isArray(created) ? created[0] || null : null
}

export async function getAdditionalDocumentRequests(transactionId) {
  const requests = await fetchTransactionDocumentRequests(transactionId)
  return (requests || []).filter(isAdditionalDocumentRequest)
}

export async function updateAdditionalDocumentRequest(requestId, payload = {}) {
  return updateTransactionDocumentRequestStatus({
    requestId,
    status: payload.status || 'requested',
    rejectedReason: payload.rejectedReason || payload.reason || null,
    completedAt: payload.completedAt || null,
  })
}

export async function cancelAdditionalDocumentRequest(requestId) {
  return updateAdditionalDocumentRequest(requestId, { status: 'cancelled' })
}

export async function markAdditionalDocumentRequestUploaded(requestId) {
  return updateAdditionalDocumentRequest(requestId, { status: 'uploaded' })
}

export async function completeAdditionalDocumentRequest(requestId) {
  return updateAdditionalDocumentRequest(requestId, { status: 'completed' })
}

export async function rejectAdditionalDocumentRequest(requestId, reason = '') {
  return updateAdditionalDocumentRequest(requestId, { status: 'rejected', rejectedReason: reason || null })
}
