import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { buildOtpCommercialTermsRuntimeInput } from '../../core/documents/otpCommercialTermsRuntimePhase26'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function requireClient(client = supabase) {
  if (!client || (client === supabase && !isSupabaseConfigured)) {
    throw new Error('OTP commercial terms runtime wiring requires a configured Supabase connection.')
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

async function maybeSingle(query, fallback) {
  const data = throwIfError(await query, fallback)
  return Array.isArray(data) ? data[0] || null : data || null
}

async function listRows(query, fallback) {
  return throwIfError(await query, fallback) || []
}

export async function loadOtpCommercialTermsRuntimeRecords({
  transactionId = '',
  routeVariant = '',
  organisationId = '',
  client = supabase,
} = {}) {
  const db = requireClient(client)
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')

  const transaction = await maybeSingle(
    db
      .from('transactions')
      .select('*')
      .eq('id', normalizedTransactionId)
      .maybeSingle(),
    'Unable to load transaction for OTP commercial runtime wiring.',
  )
  const listingId = normalizeText(transaction?.listing_id || transaction?.listingId || transaction?.private_listing_id)

  const [
    listing,
    sellerOnboarding,
    commissionVariationRows,
    costObligationRows,
    matterAttorneyQuoteRows,
    attorneyAssignments,
    readinessRows,
  ] = await Promise.all([
    listingId
      ? maybeSingle(
          db
            .from('private_listings')
            .select('*')
            .eq('id', listingId)
            .maybeSingle(),
          'Unable to load listing for OTP commercial runtime wiring.',
        )
      : Promise.resolve(null),
    listingId
      ? maybeSingle(
          db
            .from('private_listing_seller_onboarding')
            .select('*')
            .eq('listing_id', listingId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          'Unable to load seller onboarding for OTP commercial runtime wiring.',
        )
      : Promise.resolve(null),
    listRows(
      db
        .from('otp_commission_variations')
        .select('*')
        .eq('transaction_id', normalizedTransactionId)
        .eq('is_current', true)
        .order('updated_at', { ascending: false }),
      'Unable to load OTP commission variations.',
    ),
    listRows(
      db
        .from('otp_cost_obligation_items')
        .select('*')
        .eq('transaction_id', normalizedTransactionId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false }),
      'Unable to load OTP cost obligation items.',
    ),
    listRows(
      db
        .from('matter_attorney_cost_quote_states')
        .select('*')
        .eq('transaction_id', normalizedTransactionId)
        .neq('quote_status', 'superseded')
        .order('updated_at', { ascending: false }),
      'Unable to load matter attorney cost quote states.',
    ),
    listRows(
      db
        .from('transaction_attorney_assignments')
        .select('*')
        .eq('transaction_id', normalizedTransactionId)
        .neq('assignment_status', 'removed')
        .order('created_at', { ascending: true }),
      'Unable to load transaction attorney assignments.',
    ),
    listRows(
      db
        .from('otp_commercial_terms_persistence_readiness_v1')
        .select('*')
        .eq('transaction_id', normalizedTransactionId),
      'Unable to load OTP commercial terms persistence readiness.',
    ),
  ])

  return {
    transaction: transaction || { id: normalizedTransactionId, organisation_id: organisationId },
    listing: listing || {},
    sellerOnboarding: sellerOnboarding || {},
    commissionVariationRows,
    costObligationRows,
    matterAttorneyQuoteRows,
    attorneyAssignments,
    readinessRows,
    routeVariant,
  }
}

export async function buildOtpCommercialTermsRuntimeInputForTransaction({
  transactionId = '',
  routeVariant = '',
  organisationId = '',
  client = supabase,
  wiredAt = new Date().toISOString(),
} = {}) {
  const records = await loadOtpCommercialTermsRuntimeRecords({
    transactionId,
    routeVariant,
    organisationId,
    client,
  })

  return buildOtpCommercialTermsRuntimeInput({
    ...records,
    wiredAt,
  })
}
