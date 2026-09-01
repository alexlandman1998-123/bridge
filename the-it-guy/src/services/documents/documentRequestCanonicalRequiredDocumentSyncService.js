import {
  buildCanonicalDocumentRequestAudiencePlan,
} from '../../core/documents/documentRequestCanonicalPlanner.js'
import { DOCUMENT_REQUEST_CANONICAL_MATRIX } from '../../core/documents/documentRequestCanonicalMatrix.js'

export const DOCUMENT_REQUEST_CANONICAL_REQUIRED_DOCUMENT_SYNC_VERSION =
  'document_request_canonical_required_document_sync_v1'

const REQUIRED_DOCUMENT_SELECT =
  'id, transaction_id, document_key, document_label, is_required, is_uploaded, status, enabled, group_key, group_label, description, required_from_role, visibility_scope, allow_multiple, uploaded_document_id, uploaded_at, verified_at, rejected_at, notes, sort_order, canonical_requirement_instance_id, created_at, updated_at'

const PRESERVED_REQUIRED_DOCUMENT_STATUSES = new Set([
  'uploaded',
  'under_review',
  'accepted',
  'approved',
  'completed',
  'reupload_required',
  'rejected',
])

// These were umbrella labels from the pre-matrix generators.  They do not
// represent a distinct upload when the matrix requests the actual evidence.
const RETIRED_UMBRELLA_DOCUMENT_KEYS = new Set(['buyer_fica_pack', 'seller_fica_pack'])

const GROUP_LABELS = Object.freeze({
  sale: 'Sale',
  buyer_fica: 'Buyer & FICA',
  finance: 'Finance',
  transfer: 'Transfer',
})

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeAudience(value = 'client') {
  const normalized = normalizeKey(value)
  if (normalized === 'shared') return 'client'
  return normalized || 'client'
}

function normalizeRequiredDocumentStatus(value = '', fallback = 'missing') {
  const normalized = normalizeKey(value)
  return normalized || fallback
}

function missingSchema(error = null, token = '') {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  const code = String(error?.code || '').trim()
  return code === '42P01' || code === '42703' || (token && message.includes(token.toLowerCase()))
}

function isRequestableCanonicalRow(request = {}) {
  if (request.requestable === false) return false
  if (request.pendingPolicy) return false
  return request.clientVisible === true && ['buyer', 'seller'].includes(request.requestedFrom)
}

function visibilityScopeFromRequest(request = {}) {
  if (request.clientVisible) return 'client'
  if (request.attorneyVisible) return 'shared'
  return 'internal'
}

function groupKeyFromRequest(request = {}) {
  const key = normalizeKey(request.key)
  const blocker = normalizeKey(request.blocker)
  if (key === 'signed_otp') return 'sale'
  if (
    blocker === 'finance_ready' ||
    key.includes('bond') ||
    key.includes('fund') ||
    key.includes('income') ||
    key.includes('affordability') ||
    key.includes('grant')
  ) {
    return 'finance'
  }
  if (
    blocker === 'lodgement_ready' ||
    blocker === 'registration_ready' ||
    key.includes('transfer') ||
    key.includes('clearance') ||
    key.includes('title_deed') ||
    key.includes('compliance') ||
    key.includes('levy') ||
    key.includes('zoning') ||
    key.includes('occupation_certificate')
  ) {
    return 'transfer'
  }
  return 'buyer_fica'
}

function requiredDocumentStatusForRequest(request = {}, existing = null) {
  const existingStatus = normalizeRequiredDocumentStatus(existing?.status)
  if (PRESERVED_REQUIRED_DOCUMENT_STATUSES.has(existingStatus)) return existingStatus
  return request.requestable ? 'missing' : 'not_required'
}

function buildRequiredDocumentRowFromRequest({ transactionId, request, existing = null, index = 0 } = {}) {
  const groupKey = groupKeyFromRequest(request)
  const status = requiredDocumentStatusForRequest(request, existing)
  const requestable = request.requestable !== false
  const uploadedDocumentId = existing?.uploaded_document_id || existing?.uploadedDocumentId || null

  return {
    transaction_id: transactionId,
    document_key: request.key,
    document_label: request.label || request.title || request.key,
    is_required: requestable,
    is_uploaded: Boolean(existing?.is_uploaded || existing?.isUploaded || uploadedDocumentId),
    status,
    enabled: requestable,
    group_key: groupKey,
    group_label: GROUP_LABELS[groupKey] || 'Buyer & FICA',
    description: request.pendingPolicy
      ? 'Tracked by the legal document matrix but held until policy or attorney signoff allows requesting it.'
      : 'Required by the canonical legal document request matrix.',
    required_from_role: request.requestedFrom || request.ownerRole || 'client',
    visibility_scope: visibilityScopeFromRequest(request),
    allow_multiple: false,
    uploaded_document_id: uploadedDocumentId,
    uploaded_at: existing?.uploaded_at || existing?.uploadedAt || null,
    verified_at: existing?.verified_at || existing?.verifiedAt || null,
    rejected_at: existing?.rejected_at || existing?.rejectedAt || null,
    notes: existing?.notes || null,
    sort_order: request.sortOrder || index + 1,
    canonical_requirement_instance_id:
      existing?.canonical_requirement_instance_id || existing?.canonicalRequirementInstanceId || null,
  }
}

function existingRowsByDocumentKey(existingRows = []) {
  return new Map((existingRows || []).map((row) => [normalizeKey(row.document_key || row.key), row]))
}

function matrixManagedDocumentKeys() {
  return new Set([
    ...DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.map((requirement) => normalizeKey(requirement.key)),
    ...RETIRED_UMBRELLA_DOCUMENT_KEYS,
  ])
}

function canDeactivateStaleRow(row = {}) {
  const status = normalizeRequiredDocumentStatus(row.status)
  return !PRESERVED_REQUIRED_DOCUMENT_STATUSES.has(status) && !row.is_uploaded && !row.isUploaded && !row.uploaded_document_id
}

export function buildCanonicalRequiredDocumentRows({
  transactionId,
  scenario = {},
  audience = 'client',
  existingRows = [],
  requestPendingPolicy = false,
  includePendingPolicyRows = false,
} = {}) {
  if (!transactionId) throw new Error('transactionId is required.')
  const normalizedAudience = normalizeAudience(audience)
  const plan = buildCanonicalDocumentRequestAudiencePlan(scenario, normalizedAudience, {
    requestPendingPolicy,
  })
  const existingByKey = existingRowsByDocumentKey(existingRows)
  const requests = plan.requests.filter((request) => {
    if (includePendingPolicyRows && request.pendingPolicy) return request.clientVisible === true
    return isRequestableCanonicalRow(request)
  })
  const rows = requests.map((request, index) =>
    buildRequiredDocumentRowFromRequest({
      transactionId,
      request,
      existing: existingByKey.get(normalizeKey(request.key)) || null,
      index,
    }),
  )

  return {
    version: DOCUMENT_REQUEST_CANONICAL_REQUIRED_DOCUMENT_SYNC_VERSION,
    transactionId,
    audience: normalizedAudience,
    scenarioTokens: plan.scenarioTokens,
    requestPlan: plan,
    rows,
    skippedPendingPolicyKeys: plan.requests
      .filter((request) => request.pendingPolicy && !requests.some((rowRequest) => rowRequest.key === request.key))
      .map((request) => request.key),
  }
}

async function fetchExistingRequiredDocumentRows(client, transactionId) {
  const query = await client
    .from('transaction_required_documents')
    .select(REQUIRED_DOCUMENT_SELECT)
    .eq('transaction_id', transactionId)

  if (query.error) {
    if (missingSchema(query.error, 'transaction_required_documents')) return []
    throw query.error
  }
  return query.data || []
}

export async function syncCanonicalRequiredDocumentRows({
  client,
  transactionId,
  scenario = {},
  audience = 'client',
  requestPendingPolicy = false,
  includePendingPolicyRows = false,
  dryRun = false,
} = {}) {
  if (!client?.from) throw new Error('client is required.')
  if (!transactionId) throw new Error('transactionId is required.')

  const existingRows = await fetchExistingRequiredDocumentRows(client, transactionId)
  const plan = buildCanonicalRequiredDocumentRows({
    transactionId,
    scenario,
    audience,
    existingRows,
    requestPendingPolicy,
    includePendingPolicyRows,
  })

  if (dryRun || !plan.rows.length) {
    return {
      ...plan,
      dryRun: Boolean(dryRun),
      synced: 0,
      persistedRows: [],
    }
  }

  const write = await client
    .from('transaction_required_documents')
    .upsert(plan.rows, { onConflict: 'transaction_id,document_key' })
    .select(REQUIRED_DOCUMENT_SELECT)

  if (write.error) {
    if (missingSchema(write.error, 'transaction_required_documents')) {
      return {
        ...plan,
        skipped: true,
        reason: 'transaction_required_documents_missing',
        synced: 0,
        persistedRows: [],
      }
    }
    throw write.error
  }

  // Recalculation is a reconciliation, not an append-only import.  Only
  // deactivate matrix-owned, unsatisfied rows so an uploaded legacy document
  // is never hidden or discarded by a rules correction.
  const activeKeys = new Set(plan.rows.map((row) => normalizeKey(row.document_key)))
  const managedKeys = matrixManagedDocumentKeys()
  const staleIds = existingRows
    .filter((row) => managedKeys.has(normalizeKey(row.document_key)))
    .filter((row) => !activeKeys.has(normalizeKey(row.document_key)))
    .filter(canDeactivateStaleRow)
    .map((row) => row.id)
    .filter(Boolean)

  if (staleIds.length) {
    const staleWrite = await client
      .from('transaction_required_documents')
      .update({
        is_required: false,
        enabled: false,
        is_uploaded: false,
        status: 'not_required',
      })
      .in('id', staleIds)
    if (staleWrite.error) throw staleWrite.error
  }

  return {
    ...plan,
    dryRun: false,
    synced: (write.data?.length || plan.rows.length) + staleIds.length,
    persistedRows: write.data || [],
    deactivatedStaleRowIds: staleIds,
  }
}
