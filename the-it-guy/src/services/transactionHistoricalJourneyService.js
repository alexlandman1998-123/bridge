import { supabase } from '../lib/supabaseClient.js'
import { normaliseHistoricalMilestones } from '../core/transactions/historicalJourney.js'

export async function saveTransactionHistoricalJourney({ transactionId, milestones, expectedRevision = 0 }, client = supabase) {
  if (!transactionId || !client) throw new Error('Transaction is unavailable.')
  const confirmed = normaliseHistoricalMilestones(milestones)
  const today = new Date().toLocaleDateString('en-CA')
  if (Object.values(confirmed).some(item => item.completedOn && item.completedOn > today)) throw new Error('Milestone dates cannot be in the future.')
  const result = await client.rpc('bridge_save_transaction_historical_journey', {
    p_transaction_id: transactionId, p_milestones: confirmed, p_expected_revision: expectedRevision,
  })
  if (result.error) {
    if (['PGRST202', '42883'].includes(result.error.code)) throw new Error('Historical progress needs the latest database update before it can be saved.')
    throw new Error(result.error.message || 'Historical progress could not be saved.')
  }
  window.dispatchEvent(new CustomEvent('itg:transaction-updated', { detail: { transactionId } }))
  return result.data
}
