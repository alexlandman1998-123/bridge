import { supabase } from '../../lib/supabaseClient'
import { SOUTH_AFRICAN_LEGAL_DEAL_FACTS_VERSION } from '../../core/documents/southAfricanLegalDealFacts'

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingLegalFactsColumn(error = null) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return error?.code === '42703' || message.includes('legal_deal_facts') || message.includes('schema cache')
}

export async function saveTransactionLegalDealFacts({ transactionId, facts, actorUserId = null } = {}) {
  const resolvedTransactionId = normalizeText(transactionId)
  if (!resolvedTransactionId || !facts || typeof facts !== 'object') {
    return { persisted: false, skipped: true }
  }
  if (!supabase) return { persisted: false, schemaUnavailable: true }

  const { data, error } = await supabase
    .from('transactions')
    .update({
      legal_instrument_family: facts?.instrument?.familyKey || null,
      legal_deal_facts_json: facts,
      legal_deal_facts_version: facts.schemaVersion || SOUTH_AFRICAN_LEGAL_DEAL_FACTS_VERSION,
      legal_deal_facts_updated_at: new Date().toISOString(),
      legal_deal_facts_updated_by: normalizeText(actorUserId) || null,
    })
    .eq('id', resolvedTransactionId)
    .select('id, legal_deal_facts_version, legal_deal_facts_updated_at')
    .maybeSingle()

  if (error) {
    if (isMissingLegalFactsColumn(error)) return { persisted: false, schemaUnavailable: true }
    throw error
  }
  return { persisted: Boolean(data?.id), transaction: data || null }
}
