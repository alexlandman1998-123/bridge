import { resolveBuyerLeadDocumentTarget } from '../../core/documents/buyerLeadDocumentContract.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function rawPayload(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function stagedBuyerLeadDocumentRows(lead) {
  const payload = rawPayload(lead?.raw_enquiry_payload || lead?.rawEnquiryPayload)
  const rows = [
    ...(Array.isArray(payload.agentUploadedBuyerDocuments) ? payload.agentUploadedBuyerDocuments : []),
    ...(Array.isArray(payload.agent_uploaded_buyer_documents) ? payload.agent_uploaded_buyer_documents : []),
    ...(Array.isArray(lead?.agentUploadedBuyerDocuments) ? lead.agentUploadedBuyerDocuments : []),
    ...(Array.isArray(lead?.agent_uploaded_buyer_documents) ? lead.agent_uploaded_buyer_documents : []),
  ]
  const byPath = new Map()
  rows.filter((row) => row && typeof row === 'object').forEach((row, index) => {
    const pathKey = row.storagePath || row.storage_path
      ? `${row.storageBucket || row.storage_bucket || ''}:${row.storagePath || row.storage_path}`
      : `invalid:${index}`
    const previous = byPath.get(pathKey)
    if (!previous) {
      byPath.set(pathKey, row)
      return
    }
    const documentKey = (item) => String(item.key || item.documentType || item.document_type || '').trim()
    const canonicalId = (item) => String(item.canonicalDocumentId || item.canonical_document_id || '').trim()
    const conflicting = previous._reconciliationConflict ||
      (documentKey(previous) && documentKey(row) && documentKey(previous) !== documentKey(row)) ||
      canonicalId(previous) !== canonicalId(row)
    byPath.set(pathKey, conflicting ? { ...row, _reconciliationConflict: true } : row)
  })
  return [...byPath.values()]
}

function assertStagedFile(row, { organisationId, leadId }) {
  const bucket = String(row?.storageBucket || row?.storage_bucket || '').trim()
  const path = String(row?.storagePath || row?.storage_path || '').trim()
  const prefixes = [
    `organisations/${organisationId}/buyer-leads/${leadId}/`,
    `buyer-agent-documents/${organisationId}/${leadId}/`,
  ]
  if (!DOCUMENTS_BUCKET_CANDIDATES.includes(bucket) || !path || !prefixes.some((prefix) => path.startsWith(prefix)) || path.includes('/../')) {
    throw new Error('A staged buyer document has an invalid storage location.')
  }
  return { bucket, path }
}

export function buyerLeadDocumentIdempotencyKey({ leadId, bucket, path }) {
  return `buyer-lead:${leadId}:${bucket}:${path}`
}

function existingBuyerDocument(row) {
  return row && row.is_client_visible === true &&
    String(row.visibility_scope || '').toLowerCase() === 'shared' &&
    String(row.client_recipient_role || '').toLowerCase() === 'buyer' &&
    String(row.uploaded_by_party || '').toLowerCase() === 'buyer'
}

export function buildBuyerLeadDocumentReconciliationPlan({ lead, documents = [], organisationId, leadId, transactionId } = {}) {
  const rows = stagedBuyerLeadDocumentRows(lead)
  const plan = rows.map((row) => {
    const bucket = String(row.storageBucket || row.storage_bucket || '').trim()
    const path = String(row.storagePath || row.storage_path || '').trim()
    const canonicalId = String(row.canonicalDocumentId || row.canonical_document_id || '').trim()
    const key = String(row.key || row.documentType || row.document_type || '').trim()
    const base = { bucket, path, key, fileName: String(row.uploadedFileName || row.fileName || '').trim(), canonicalDocumentId: canonicalId }
    if (row._reconciliationConflict) return { ...base, status: 'manual_review', reason: 'conflicting_lead_metadata' }
    try {
      assertStagedFile(row, { organisationId, leadId })
    } catch {
      return { ...base, status: 'manual_review', reason: 'invalid_storage_location' }
    }
    if (!resolveBuyerLeadDocumentTarget(key).documentDefinitionKey) {
      return { ...base, status: 'manual_review', reason: 'unknown_document_type' }
    }
    const samePath = documents.filter((document) =>
      String(document.file_bucket || 'documents') === bucket && String(document.file_path || '') === path)
    const sameKey = documents.filter((document) =>
      String(document.upload_idempotency_key || '') === buyerLeadDocumentIdempotencyKey({ leadId, bucket, path }))
    if (samePath.length > 1 || sameKey.some((document) => String(document.file_path || '') !== path)) {
      return { ...base, status: 'manual_review', reason: 'conflicting_transaction_documents' }
    }
    const existing = samePath[0] || sameKey[0]
    if (canonicalId && (!existing || String(existing.id) !== canonicalId)) {
      return { ...base, status: 'manual_review', reason: 'missing_or_mismatched_canonical_document' }
    }
    if (existing) {
      return existingBuyerDocument(existing)
        ? { ...base, status: 'already_canonical', documentId: String(existing.id) }
        : { ...base, status: 'manual_review', reason: 'existing_document_not_buyer_visible' }
    }
    return { ...base, status: 'needs_handoff' }
  })
  return {
    transactionId,
    leadId,
    rows: plan,
    summary: {
      staged: rows.length,
      alreadyCanonical: plan.filter((row) => row.status === 'already_canonical').length,
      needsHandoff: plan.filter((row) => row.status === 'needs_handoff').length,
      manualReview: plan.filter((row) => row.status === 'manual_review').length,
    },
  }
}

export async function reconcileStagedBuyerLeadDocuments(client, context = {}, { dryRun = true } = {}) {
  const { transactionId, organisationId, leadId } = context
  if (!client || !UUID.test(transactionId || '') || !UUID.test(organisationId || '') || !UUID.test(leadId || '')) {
    throw new Error('A persisted buyer lead and transaction are required for document reconciliation.')
  }
  const transactionResult = await client.from('transactions')
    .select('id, organisation_id, originating_lead_id, originating_buyer_lead_id')
    .eq('id', transactionId).eq('organisation_id', organisationId).maybeSingle()
  if (transactionResult.error) throw transactionResult.error
  if (!transactionResult.data || ![transactionResult.data.originating_lead_id, transactionResult.data.originating_buyer_lead_id].includes(leadId)) {
    throw new Error('The buyer lead does not belong to this transaction.')
  }
  const leadResult = await client.from('leads').select('lead_id, organisation_id, raw_enquiry_payload')
    .eq('lead_id', leadId).eq('organisation_id', organisationId).maybeSingle()
  if (leadResult.error) throw leadResult.error
  if (!leadResult.data) throw new Error('The source buyer lead could not be read.')
  const documentsResult = await client.from('documents')
    .select('id, file_bucket, file_path, upload_idempotency_key, is_client_visible, visibility_scope, client_recipient_role, uploaded_by_party')
    .eq('transaction_id', transactionId)
  if (documentsResult.error) throw documentsResult.error
  const plan = buildBuyerLeadDocumentReconciliationPlan({
    lead: leadResult.data, documents: documentsResult.data || [], organisationId, leadId, transactionId,
  })
  if (dryRun || !plan.summary.needsHandoff) return plan
  if (plan.summary.manualReview) {
    throw new Error('Some buyer files need manual review. No historical files were handed off.')
  }
  for (const row of plan.rows.filter((entry) => entry.status === 'needs_handoff')) {
    const storageResult = await client.storage.from(row.bucket).info(row.path)
    if (storageResult.error || !storageResult.data) {
      throw new Error('A staged buyer file could not be verified in storage. No historical files were handed off.')
    }
  }
  await promoteStagedBuyerLeadDocuments(client, context)
  const refreshed = await reconcileStagedBuyerLeadDocuments(client, context, { dryRun: true })
  if (refreshed.summary.needsHandoff || refreshed.summary.manualReview) {
    throw new Error('Buyer document reconciliation needs review after handoff.')
  }
  return { ...refreshed, handedOff: plan.summary.needsHandoff }
}

export async function promoteStagedBuyerLeadDocuments(client, {
  transactionId,
  organisationId,
  leadId,
  lead = null,
} = {}) {
  if (!client || !UUID.test(transactionId || '') || !UUID.test(organisationId || '') || !UUID.test(leadId || '')) {
    throw new Error('A persisted buyer lead and transaction are required for document handoff.')
  }
  const transactionQuery = await client.from('transactions')
    .select('id, organisation_id, originating_lead_id, originating_buyer_lead_id')
    .eq('id', transactionId).eq('organisation_id', organisationId).maybeSingle()
  if (transactionQuery.error) throw transactionQuery.error
  const transaction = transactionQuery.data
  if (!transaction || ![transaction.originating_lead_id, transaction.originating_buyer_lead_id].includes(leadId)) {
    throw new Error('The buyer lead does not belong to this transaction.')
  }

  // Fetch the persisted lead rather than relying on the conversion screen's
  // potentially stale snapshot. A failed lead save must never be promoted.
  const leadQuery = await client.from('leads')
    .select('lead_id, organisation_id, raw_enquiry_payload')
    .eq('lead_id', leadId).eq('organisation_id', organisationId).maybeSingle()
  if (leadQuery.error) throw leadQuery.error
  if (!leadQuery.data) throw new Error('The source buyer lead could not be read.')
  const rows = stagedBuyerLeadDocumentRows(leadQuery.data)
  const outcomes = []
  for (const row of rows) {
    if (row._reconciliationConflict) throw new Error('Conflicting buyer lead document metadata needs manual review.')
    if (row.canonicalDocumentId || row.canonical_document_id) continue
    const { bucket, path } = assertStagedFile(row, { organisationId, leadId })
    const idempotencyKey = buyerLeadDocumentIdempotencyKey({ leadId, bucket, path })
    const existing = await client.from('documents').select('id, is_client_visible, visibility_scope, client_recipient_role, uploaded_by_party')
      .eq('transaction_id', transactionId).eq('upload_idempotency_key', idempotencyKey).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data?.id) {
      if (!existingBuyerDocument(existing.data)) throw new Error('An existing buyer document needs manual audience review.')
      outcomes.push({ id: existing.data.id, deduplicated: true })
      continue
    }
    const existingPath = await client.from('documents').select('id, is_client_visible, visibility_scope, client_recipient_role, uploaded_by_party')
      .eq('transaction_id', transactionId).eq('file_bucket', bucket).eq('file_path', path).maybeSingle()
    if (existingPath.error) throw existingPath.error
    if (existingPath.data) {
      if (!existingBuyerDocument(existingPath.data)) throw new Error('A document at this path needs manual audience review.')
      outcomes.push({ id: existingPath.data.id, deduplicated: true })
      continue
    }
    const target = resolveBuyerLeadDocumentTarget(row.key || row.documentType || row.document_type, {
      financeType: lead?.financeType || lead?.finance_type,
      purchaserType: lead?.purchaserType || lead?.purchaser_type,
      partyId: row.partyId || row.party_id,
      partyRole: row.partyRole || row.party_role,
    })
    const insert = await client.from('documents').insert({
      transaction_id: transactionId,
      name: String(row.uploadedFileName || row.fileName || row.label || 'Buyer document').slice(0, 255),
      file_path: path,
      file_bucket: bucket,
      category: 'Buyer',
      document_type: target.documentDefinitionKey || target.sourceKey || 'buyer_document',
      status: 'uploaded',
      visibility_scope: 'shared',
      is_client_visible: true,
      client_recipient_role: 'buyer',
      uploaded_by_party: 'buyer',
      source: 'agent_buyer_document_upload',
      upload_idempotency_key: idempotencyKey,
      // Do not set a requirement instance or complete a request. Party and
      // requirement matching must be resolved independently and exactly.
    }).select('id').single()
    if (insert.error?.code === '23505') {
      const duplicate = await client.from('documents').select('id, is_client_visible, visibility_scope, client_recipient_role, uploaded_by_party')
        .eq('transaction_id', transactionId).eq('upload_idempotency_key', idempotencyKey).maybeSingle()
      if (duplicate.error) throw duplicate.error
      if (duplicate.data?.id) {
        if (!existingBuyerDocument(duplicate.data)) throw new Error('An existing buyer document needs manual audience review.')
        outcomes.push({ id: duplicate.data.id, deduplicated: true })
        continue
      }
    }
    if (insert.error) throw insert.error
    outcomes.push({ id: insert.data.id, deduplicated: false })
  }
  return outcomes
}
