import { BUYER_LEAD_DOCUMENT_TYPES, resolveBuyerLeadDocumentTarget } from '../../core/documents/buyerLeadDocumentContract.js'

const buyerSources = new Set([
  'agent_buyer_document_upload',
  'client_portal_atomic_upload',
  'client_portal_requested_document_upload',
])

const sourceKeyByDefinition = new Map(BUYER_LEAD_DOCUMENT_TYPES.map((entry) => [
  resolveBuyerLeadDocumentTarget(entry.key).documentDefinitionKey,
  entry.key,
]))
const labelBySourceKey = new Map(BUYER_LEAD_DOCUMENT_TYPES.map((entry) => [entry.key, entry.label]))

function value(input) { return String(input || '').trim() }

function isBuyerVisibleDocument(row) {
  if (!row || !buyerSources.has(value(row.source))) return false
  if (row.is_client_visible !== true || value(row.visibility_scope).toLowerCase() !== 'shared') return false
  return value(row.client_recipient_role).toLowerCase() === 'buyer' ||
    value(row.uploaded_by_party).toLowerCase() === 'buyer'
}

function canonicalUpload(row) {
  const key = sourceKeyByDefinition.get(value(row.document_type)) || value(row.document_type)
  const linked = Boolean(row.canonical_requirement_instance_id)
  const reviewStatus = value(row.review_status || row.status).toLowerCase()
  const reviewed = ['approved', 'completed'].includes(reviewStatus) && linked
  const rejected = ['rejected', 'declined'].includes(reviewStatus)
  const awaitingMatch = value(row.source) === 'agent_buyer_document_upload' && !linked
  return {
    id: value(row.id),
    key,
    label: labelBySourceKey.get(key) || value(row.name) || 'Buyer document',
    fileName: value(row.file_name || row.name),
    storageBucket: value(row.file_bucket) || 'documents',
    storagePath: value(row.file_path),
    uploadedAt: value(row.uploaded_at || row.created_at),
    source: value(row.source),
    canonicalRequirementInstanceId: value(row.canonical_requirement_instance_id),
    status: rejected ? 'rejected' : reviewed ? 'approved' : awaitingMatch ? 'uploaded_unmatched' : 'under_review',
    statusLabel: rejected ? 'Needs replacement' : reviewed ? 'Approved' : awaitingMatch ? 'Uploaded · awaiting matching' : 'Awaiting review',
    isCanonical: true,
  }
}

function stagedUpload(row, { hasTransaction }) {
  const key = value(row.key || row.documentType || row.document_type)
  const savedOnTransaction = Boolean(value(row.canonicalDocumentId || row.canonical_document_id))
  return {
    id: value(row.canonicalDocumentId || row.id),
    key,
    label: value(row.label) || labelBySourceKey.get(key) || 'Buyer document',
    fileName: value(row.uploadedFileName || row.fileName),
    storageBucket: value(row.storageBucket || row.storage_bucket),
    storagePath: value(row.storagePath || row.storage_path),
    uploadedAt: value(row.uploadedAt),
    source: 'agent_buyer_document_upload',
    canonicalRequirementInstanceId: '',
    status: savedOnTransaction ? 'canonical_refresh_pending' : hasTransaction ? 'handoff_pending' : 'staged',
    statusLabel: savedOnTransaction ? 'Saved on transaction · refreshing' : hasTransaction ? 'Awaiting transaction handoff' : 'Stored on buyer lead',
    isCanonical: false,
  }
}

export function buildBuyerLeadDocumentReadModel({ leadRows = [], canonicalRows = [], hasTransaction = false } = {}) {
  const uploadsByPath = new Map()
  for (const row of leadRows) {
    if (!row || !value(row.storagePath || row.storage_path)) continue
    const normalized = stagedUpload(row, { hasTransaction })
    uploadsByPath.set(`${normalized.storageBucket}:${normalized.storagePath}`, normalized)
  }
  for (const row of canonicalRows) {
    if (!isBuyerVisibleDocument(row) || !value(row.file_path)) continue
    const normalized = canonicalUpload(row)
    uploadsByPath.set(`${normalized.storageBucket}:${normalized.storagePath}`, normalized)
  }
  const uploads = [...uploadsByPath.values()]
    .sort((a, b) => Date.parse(b.uploadedAt || 0) - Date.parse(a.uploadedAt || 0))
  return {
    uploads,
    canonicalCount: uploads.filter((row) => row.isCanonical).length,
    stagedCount: uploads.filter((row) => !row.isCanonical).length,
    unmatchedCount: uploads.filter((row) => row.status === 'uploaded_unmatched').length,
  }
}

export async function fetchBuyerLeadCanonicalDocumentRows(client, { transactionId, organisationId, leadId } = {}) {
  if (!client || !transactionId || !organisationId || !leadId) throw new Error('Buyer lead document context is incomplete.')
  const transactionResult = await client.from('transactions')
    .select('id, organisation_id, originating_lead_id, originating_buyer_lead_id')
    .eq('id', transactionId).eq('organisation_id', organisationId).maybeSingle()
  if (transactionResult.error) throw transactionResult.error
  const transaction = transactionResult.data
  if (!transaction || ![transaction.originating_lead_id, transaction.originating_buyer_lead_id].includes(leadId)) {
    throw new Error('This buyer lead is not linked to the selected transaction.')
  }
  const documentsResult = await client.from('documents')
    .select('id, name, file_name, file_path, file_bucket, category, document_type, status, review_status, source, uploaded_at, created_at, canonical_requirement_instance_id, client_recipient_role, uploaded_by_party, visibility_scope, is_client_visible')
    .eq('transaction_id', transactionId)
  if (documentsResult.error) throw documentsResult.error
  return (documentsResult.data || []).filter(isBuyerVisibleDocument)
}
