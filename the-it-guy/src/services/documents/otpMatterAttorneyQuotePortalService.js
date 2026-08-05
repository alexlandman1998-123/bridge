import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { upsertMatterAttorneyCostQuoteState } from './otpCommercialTermsPersistenceService'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function requireClient(client = supabase) {
  if (!client || (client === supabase && !isSupabaseConfigured)) {
    throw new Error('Matter attorney quote portal requires a configured Supabase connection.')
  }
  return client
}

function throwIfError(result, fallback) {
  if (!result?.error) return result?.data
  const error = new Error(result.error.message || fallback)
  error.code = result.error.code || ''
  error.details = result.error.details || ''
  throw error
}

export function assertMatterQuotePortalAccess({
  portalContext = {},
  transactionId = '',
  transactionAttorneyAssignmentId = '',
  actorRole = '',
} = {}) {
  const role = normalizeKey(actorRole || portalContext.actorRole || portalContext.role)
  const scopedTransactionId = normalizeText(portalContext.transactionId || portalContext.transaction_id)
  const scopedAssignmentIds = list(
    portalContext.allowedTransactionAttorneyAssignmentIds ||
      portalContext.allowed_transaction_attorney_assignment_ids,
  ).map(normalizeText)
  const targetTransactionId = normalizeText(transactionId)
  const targetAssignmentId = normalizeText(transactionAttorneyAssignmentId)

  if (!targetTransactionId || !targetAssignmentId) {
    throw new Error('transaction_and_assignment_required')
  }
  if (!['attorney', 'buyer', 'service'].includes(role)) {
    throw new Error('invalid_matter_quote_portal_role')
  }
  if (scopedTransactionId && scopedTransactionId !== targetTransactionId) {
    throw new Error('matter_quote_transaction_scope_mismatch')
  }
  if (scopedAssignmentIds.length && !scopedAssignmentIds.includes(targetAssignmentId)) {
    throw new Error('matter_quote_assignment_scope_mismatch')
  }
  if (role === 'buyer' && !scopedTransactionId) {
    throw new Error('buyer_matter_quote_transaction_scope_required')
  }

  return Object.freeze({
    actorRole: role,
    transactionId: targetTransactionId,
    transactionAttorneyAssignmentId: targetAssignmentId,
  })
}

export async function loadMatterAttorneyQuotePortalState({
  transactionId = '',
  transactionAttorneyAssignmentId = '',
  documentDefinitionKey = '',
  portalContext = {},
  actorRole = '',
  client = supabase,
} = {}) {
  const db = requireClient(client)
  const access = assertMatterQuotePortalAccess({
    portalContext,
    transactionId,
    transactionAttorneyAssignmentId,
    actorRole,
  })
  let query = db
    .from('matter_attorney_cost_quote_states')
    .select('*')
    .eq('transaction_id', access.transactionId)
    .eq('transaction_attorney_assignment_id', access.transactionAttorneyAssignmentId)
    .eq('source_scope', 'transaction_matter')
    .neq('quote_status', 'superseded')
    .order('updated_at', { ascending: false })

  if (documentDefinitionKey) {
    query = query.eq('document_definition_key', normalizeKey(documentDefinitionKey))
  }

  return throwIfError(await query, 'Unable to load matter attorney quote portal state.') || []
}

async function runMatterQuotePortalStatusUpdate({
  transactionId = '',
  transactionAttorneyAssignmentId = '',
  routeVariant = '',
  quoteStatus = 'pending_upload',
  documentDefinitionKey = 'buyer_transfer_cost_invoice',
  financialDocumentMetadataId = '',
  fileUrl = '',
  amount = null,
  actorId = '',
  actorRole = '',
  portalContext = {},
  client = supabase,
} = {}) {
  assertMatterQuotePortalAccess({
    portalContext,
    transactionId,
    transactionAttorneyAssignmentId,
    actorRole,
  })

  return upsertMatterAttorneyCostQuoteState({
    transactionId,
    transactionAttorneyAssignmentId,
    routeVariant,
    quoteStatus,
    documentDefinitionKey,
    financialDocumentMetadataId,
    fileUrl,
    amount,
    actorId,
    client,
  })
}

export async function uploadMatterAttorneyQuoteDocument({
  documentDefinitionKey = 'buyer_transfer_cost_invoice',
  ...params
} = {}) {
  return runMatterQuotePortalStatusUpdate({
    ...params,
    quoteStatus: 'uploaded',
    documentDefinitionKey,
    actorRole: params.actorRole || 'attorney',
  })
}

export async function reviseMatterAttorneyQuoteDocument({
  documentDefinitionKey = 'buyer_transfer_cost_invoice',
  ...params
} = {}) {
  return runMatterQuotePortalStatusUpdate({
    ...params,
    quoteStatus: 'revised',
    documentDefinitionKey,
    actorRole: params.actorRole || 'attorney',
  })
}

export async function markMatterAttorneyQuoteViewed({
  documentDefinitionKey = 'buyer_transfer_cost_invoice',
  ...params
} = {}) {
  return runMatterQuotePortalStatusUpdate({
    ...params,
    quoteStatus: 'buyer_viewed',
    documentDefinitionKey,
    actorRole: params.actorRole || 'buyer',
  })
}

export async function submitMatterAttorneyQuoteQuery({
  documentDefinitionKey = 'buyer_transfer_cost_invoice',
  queryText = '',
  ...params
} = {}) {
  return runMatterQuotePortalStatusUpdate({
    ...params,
    quoteStatus: 'buyer_queried',
    documentDefinitionKey,
    actorRole: params.actorRole || 'buyer',
    metadata: { queryText: normalizeText(queryText) },
  })
}

export async function acknowledgeMatterAttorneyQuote({
  documentDefinitionKey = 'buyer_transfer_cost_invoice',
  ...params
} = {}) {
  return runMatterQuotePortalStatusUpdate({
    ...params,
    quoteStatus: 'acknowledged',
    documentDefinitionKey,
    actorRole: params.actorRole || 'buyer',
  })
}
