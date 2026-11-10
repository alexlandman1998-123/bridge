import { buildDealSetup, buildDealSetupCommercialPayload, validateDealSetup } from '../core/transactions/dealSetupContract.js'
import { buildDealSetupDocumentRequirements } from '../core/transactions/dealSetupDocumentRequirements.js'
import { buildDealSetupReadiness } from '../core/transactions/dealSetupReadiness.js'
import { auditDealSetupCompatibility as auditDealSetupCompatibilityModel } from '../core/transactions/dealSetupCompatibilityAudit.js'
import { supabase } from '../lib/supabaseClient.js'
import { listTransactionBuyerParties } from './buyerProfileReuseService.js'
import {
  resolveTransactionDocumentRequirements,
  TRANSACTION_CANONICAL_PERSISTENCE_MODES,
} from './documents/transactionCanonicalDocumentRequirementService.js'
import { syncCanonicalRequiredDocumentsForTransactionContext } from './documents/documentRequestCanonicalTransactionSyncService.js'

const text = (value) => String(value || '').trim()

function resolveCanonicalTransactionType(transaction = {}) {
  if (text(transaction.development_id) || text(transaction.unit_id)) return 'developer_sale'
  return text(transaction.transaction_type) || null
}

export async function loadCanonicalDealSetup({ transactionId, client = supabase } = {}) {
  if (!text(transactionId)) throw new Error('Transaction is required.')
  if (!client) throw new Error('Supabase is not configured.')
  const [transactionResult, buyerParties] = await Promise.all([
    client.from('transactions').select('id, transaction_reference, transaction_origin_source, comment, seller_type, buyer_id, primary_buyer_participant_id, buyer_parties_model_version, development_id, unit_id, transaction_type, property_address_line_1, seller_name, purchaser_type, purchase_price, sales_price, deposit_amount, reservation_required, reservation_amount, finance_type, finance_managed_by, cash_amount, bond_amount, bank, bond_originator, deal_setup_terms_version, deal_setup_sync_status, deal_setup_sync_error, updated_at').eq('id', text(transactionId)).single(),
    listTransactionBuyerParties({ transactionId, client }),
  ])
  if (transactionResult.error) throw transactionResult.error
  const transaction = {
    ...transactionResult.data,
    transaction_type: resolveCanonicalTransactionType(transactionResult.data),
  }
  const setup = buildDealSetup({ transaction, buyerParties })
  return { setup, validation: validateDealSetup(setup), transaction, buyerParties }
}

export async function deriveDealSetupDocumentRequirements({ transactionId, client = supabase } = {}) {
  const dealSetup = await loadCanonicalDealSetup({ transactionId, client })
  const profileEntries = await Promise.all(dealSetup.buyerParties.map(async (party) => {
    const buyerId = party.buyer_party_id
    if (!buyerId) return [null, []]
    const result = await client.from('buyer_profile_documents').select('document_key').eq('buyer_id', buyerId).eq('is_active', true)
    if (result.error) throw result.error
    return [buyerId, result.data || []]
  }))
  return buildDealSetupDocumentRequirements({ setup: dealSetup.setup, profileDocumentsByBuyer: Object.fromEntries(profileEntries.filter(([buyerId]) => buyerId)) })
}

export async function getDealSetupReadiness({ transactionId, client = supabase } = {}) {
  const [deal, requirements] = await Promise.all([
    loadCanonicalDealSetup({ transactionId, client }),
    deriveDealSetupDocumentRequirements({ transactionId, client }),
  ])
  return buildDealSetupReadiness({ setup: deal.setup, requirements: requirements.requirements })
}

// The documents workspace and partner handoffs must be recalculated from the
// saved Deal Setup rather than from older onboarding snapshots.
export async function syncDealSetupDownstream({ transactionId, client = supabase } = {}) {
  const deal = await loadCanonicalDealSetup({ transactionId, client })
  const { setup, transaction } = deal
  const formData = {
    purchaser_type: setup.terms.purchaserType || null,
    purchase_finance_type: setup.finance.type || null,
    reservation_required: setup.terms.reservationRequired === true,
    reservation_amount: setup.terms.reservationAmount,
    cash_amount: setup.finance.cashAmount,
    bond_amount: setup.finance.bondAmount,
  }
  const documentResolution = await resolveTransactionDocumentRequirements({
    transactionId,
    transaction,
    formData,
    client,
    writeLegacyProjection: true,
    // Canonical requirement tables are intentionally service-role-only.
    // Browser-originated Deal Setup saves must use the authorised RPC rather
    // than attempting direct inserts/updates under the user's RLS role.
    persistenceMode: TRANSACTION_CANONICAL_PERSISTENCE_MODES.creationRpc,
  })
  const documentRequestSync = await syncCanonicalRequiredDocumentsForTransactionContext({
    client,
    transactionId,
    transaction,
    onboardingFormData: formData,
    audience: 'auto',
  })
  return { deal, documentResolution, documentRequestSync }
}

// The attorney workspace derives its operational plan from routing_profile_json.
// Deal Setup remains the owner of commercial terms, so a save must refresh that
// derived profile without replacing attorney-only routing decisions.
export async function syncDealSetupAttorneyHandoff({ transactionId, client = supabase } = {}) {
  if (!text(transactionId)) throw new Error('Transaction is required.')
  if (!client?.rpc) throw new Error('Supabase is not configured.')
  const result = await client.rpc('bridge_sync_deal_setup_attorney_handoff', {
    p_transaction_id: text(transactionId),
  })
  if (result.error) throw result.error
  return result.data || null
}

// Deliberately read-only. Phase 8 reports legacy gaps before a separately
// authorised migration/backfill writes to production transactions.
export async function auditDealSetupCompatibility({ transactionId, client = supabase } = {}) {
  const deal = await loadCanonicalDealSetup({ transactionId, client })
  return auditDealSetupCompatibilityModel({ transaction: deal.transaction, buyerParties: deal.buyerParties })
}

// Retry never rewrites commercial terms. The durable pending marker survives refresh.
export async function retryDealSetupReconciliation({ transactionId, termsVersion, client = supabase } = {}) {
  const current = await loadCanonicalDealSetup({ transactionId, client })
  if (!termsVersion || current.transaction.deal_setup_terms_version !== termsVersion) throw new Error('Deal Setup changed. Reload before retrying its updates.')
  const queued = await client.rpc('bridge_retry_deal_setup_reconciliation', {
    p_transaction_id: text(transactionId), p_terms_version: termsVersion,
  })
  if (queued.error) throw queued.error
  if (queued.data?.automatic !== true || !['pending', 'failed', 'complete'].includes(queued.data?.status)) throw new Error('Workflow recovery could not be confirmed. Reload Deal Setup.')
  const deal = await loadCanonicalDealSetup({ transactionId, client })
  return { ...deal, persistence: { saved: true, termsVersion }, reconciliation: { status: queued.data.status, automatic: true, failures: [] } }
}

export async function saveCanonicalDealTerms({ transactionId, terms = {}, finance = {}, expectedUpdatedAt, client = supabase } = {}) {
  if (!text(transactionId)) throw new Error('Transaction is required.')
  if (!client) throw new Error('Supabase is not configured.')
  if (!text(expectedUpdatedAt)) throw new Error('Reload Deal Setup before saving: its version is missing.')
  const current = await loadCanonicalDealSetup({ transactionId, client })
  if (current.setup.revision !== expectedUpdatedAt) throw new Error('Someone changed this transaction. Reload and review their changes before saving.')
  const termsVersion = crypto.randomUUID()
  const payload = {
    ...buildDealSetupCommercialPayload({ terms, finance }),
    transaction_type: resolveCanonicalTransactionType(current.transaction),
    deal_setup_terms_version: termsVersion, deal_setup_sync_status: 'pending', deal_setup_sync_error: null,
    updated_at: new Date().toISOString(),
  }
  const result = await client.from('transactions').update(payload).eq('id', text(transactionId)).eq('updated_at', expectedUpdatedAt).select('id,updated_at').maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('Someone changed this transaction. Reload and review their changes before saving.')
  const saved = { ...current.transaction, ...payload, updated_at: result.data.updated_at }
  const fallback = { ...current, transaction: saved, setup: buildDealSetup({ transaction: saved, buyerParties: current.buyerParties }), persistence: { saved: true, termsVersion }, reconciliation: { status: 'pending', failures: [] } }
  try { return await retryDealSetupReconciliation({ transactionId, termsVersion, client }) }
  catch (error) { return { ...fallback, reconciliation: { status: 'pending', failures: [{ section: 'updates', message: error.message }] } } }
}
