import { buildDealSetup, validateDealSetup } from '../core/transactions/dealSetupContract.js'
import { buildDealSetupDocumentRequirements } from '../core/transactions/dealSetupDocumentRequirements.js'
import { buildDealSetupReadiness } from '../core/transactions/dealSetupReadiness.js'
import { auditDealSetupCompatibility as auditDealSetupCompatibilityModel } from '../core/transactions/dealSetupCompatibilityAudit.js'
import { supabase } from '../lib/supabaseClient.js'
import { listTransactionBuyerParties } from './buyerProfileReuseService.js'

const text = (value) => String(value || '').trim()

export async function loadCanonicalDealSetup({ transactionId, client = supabase } = {}) {
  if (!text(transactionId)) throw new Error('Transaction is required.')
  if (!client) throw new Error('Supabase is not configured.')
  const [transactionResult, buyerParties] = await Promise.all([
    client.from('transactions').select('id, buyer_id, development_id, unit_id, property_address_line_1, seller_name, purchaser_type, purchase_price, sales_price, deposit_amount, reservation_required, reservation_amount, finance_type, finance_managed_by, cash_amount, bond_amount, bank, bond_originator, updated_at').eq('id', text(transactionId)).single(),
    listTransactionBuyerParties({ transactionId, client }),
  ])
  if (transactionResult.error) throw transactionResult.error
  const setup = buildDealSetup({ transaction: transactionResult.data, buyerParties })
  return { setup, validation: validateDealSetup(setup), transaction: transactionResult.data, buyerParties }
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

// Deliberately read-only. Phase 8 reports legacy gaps before a separately
// authorised migration/backfill writes to production transactions.
export async function auditDealSetupCompatibility({ transactionId, client = supabase } = {}) {
  const deal = await loadCanonicalDealSetup({ transactionId, client })
  const transactionResult = await client.from('transactions').select('id, buyer_id, purchaser_type, finance_type, buyer_parties_model_version').eq('id', text(transactionId)).single()
  if (transactionResult.error) throw transactionResult.error
  return auditDealSetupCompatibilityModel({ transaction: transactionResult.data, buyerParties: deal.buyerParties })
}

export async function saveCanonicalDealTerms({ transactionId, terms = {}, finance = {}, client = supabase } = {}) {
  if (!text(transactionId)) throw new Error('Transaction is required.')
  if (!client) throw new Error('Supabase is not configured.')
  const payload = {
    purchaser_type: text(terms.purchaserType) || null,
    purchase_price: terms.purchasePrice === '' ? null : Number(terms.purchasePrice) || null,
    deposit_amount: terms.depositAmount === '' ? null : Number(terms.depositAmount) || null,
    finance_type: text(finance.type) || null,
    finance_managed_by: text(finance.managedBy) || null,
    cash_amount: finance.cashAmount === '' ? null : Number(finance.cashAmount) || null,
    bond_amount: finance.bondAmount === '' ? null : Number(finance.bondAmount) || null,
    bank: text(finance.bank) || null,
    updated_at: new Date().toISOString(),
  }
  const result = await client.from('transactions').update(payload).eq('id', text(transactionId)).select('id').single()
  if (result.error) throw result.error
  return loadCanonicalDealSetup({ transactionId, client })
}
