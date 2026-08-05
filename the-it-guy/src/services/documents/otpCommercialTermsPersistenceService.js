import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function requireClient(client = supabase) {
  if (!client || (client === supabase && !isSupabaseConfigured)) {
    throw new Error('OTP commercial terms persistence requires a configured Supabase connection.')
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

export async function recordOtpCommissionVariation({
  transactionId,
  routeVariant,
  mandateCommissionSnapshot = {},
  proposedOtpCommission = {},
  approvalStatus = 'pending_approval',
  approvalReference = '',
  reason = '',
  actorId = '',
  client = supabase,
} = {}) {
  const db = requireClient(client)
  const result = await db.rpc('bridge_record_otp_commission_variation', {
    p_transaction_id: normalizeText(transactionId),
    p_route_variant: normalizeText(routeVariant),
    p_mandate_commission_snapshot: mandateCommissionSnapshot || {},
    p_proposed_otp_commission: proposedOtpCommission || {},
    p_approval_status: normalizeText(approvalStatus) || 'pending_approval',
    p_approval_reference: normalizeText(approvalReference) || null,
    p_reason: normalizeText(reason) || null,
    p_actor_id: normalizeText(actorId) || null,
  })
  const data = throwIfError(result, 'Unable to record OTP commission variation.')
  if (!data?.success) throw new Error(data?.code || 'OTP commission variation was not recorded.')
  return data
}

export async function upsertOtpCostObligationItem({
  transactionId,
  routeVariant,
  item = {},
  actorId = '',
  client = supabase,
} = {}) {
  const db = requireClient(client)
  const result = await db.rpc('bridge_upsert_otp_cost_obligation_item', {
    p_transaction_id: normalizeText(transactionId),
    p_route_variant: normalizeText(routeVariant),
    p_item: item || {},
    p_actor_id: normalizeText(actorId) || null,
  })
  const data = throwIfError(result, 'Unable to upsert OTP cost obligation item.')
  if (!data?.success) throw new Error(data?.code || 'OTP cost obligation item was not upserted.')
  return data
}

export async function upsertMatterAttorneyCostQuoteState({
  transactionId,
  transactionAttorneyAssignmentId,
  routeVariant,
  quoteStatus = 'pending_upload',
  documentDefinitionKey = 'buyer_transfer_cost_invoice',
  financialDocumentMetadataId = '',
  fileUrl = '',
  amount = null,
  actorId = '',
  client = supabase,
} = {}) {
  const db = requireClient(client)
  const result = await db.rpc('bridge_upsert_matter_attorney_cost_quote_state', {
    p_transaction_id: normalizeText(transactionId),
    p_transaction_attorney_assignment_id: normalizeText(transactionAttorneyAssignmentId),
    p_route_variant: normalizeText(routeVariant),
    p_quote_status: normalizeText(quoteStatus) || 'pending_upload',
    p_document_definition_key: normalizeText(documentDefinitionKey) || 'buyer_transfer_cost_invoice',
    p_financial_document_metadata_id: normalizeText(financialDocumentMetadataId) || null,
    p_file_url: normalizeText(fileUrl) || null,
    p_amount: amount === null || amount === undefined || amount === '' ? null : Number(amount),
    p_actor_id: normalizeText(actorId) || null,
  })
  const data = throwIfError(result, 'Unable to upsert matter attorney cost quote state.')
  if (!data?.success) throw new Error(data?.code || 'Matter attorney cost quote state was not upserted.')
  return data
}

export async function listOtpCommercialTermsPersistenceReadiness({
  transactionId = '',
  organisationId = '',
  client = supabase,
} = {}) {
  const db = requireClient(client)
  let query = db
    .from('otp_commercial_terms_persistence_readiness_v1')
    .select('*')

  if (transactionId) query = query.eq('transaction_id', normalizeText(transactionId))
  if (organisationId) query = query.eq('organisation_id', normalizeText(organisationId))

  return throwIfError(await query, 'Unable to load OTP commercial terms persistence readiness.') || []
}
