import { buyerCaptureProfile } from '../core/transactions/buyerOnboardingCapture.js'
import { supabase } from '../lib/supabaseClient.js'

function failure(error) {
  const result = new Error(['PGRST202', '42883'].includes(error?.code)
    ? 'Buyer capture needs its database update before it can be used. No details have been changed.'
    : error?.message || 'Buyer details could not be saved. Your entries remain in this form.')
  result.code = error?.code
  return result
}
export async function loadTransactionBuyerCapture({ transactionId, participantId = null, client = supabase }) {
  const { data, error } = await client.rpc('bridge_get_transaction_buyer_capture', { p_transaction_id: transactionId, p_participant_id: participantId || null })
  if (error) throw failure(error)
  if (!data?.revision || !data?.buyer || !data?.profile) throw new Error('Buyer details could not be confirmed. Reload before continuing.')
  return { ...data, profile: buyerCaptureProfile(data.profile) }
}
export async function saveTransactionBuyerCapture({ transactionId, context, buyer, profile, mutationId, client = supabase }) {
  if (!context?.revision || !mutationId) throw new Error('Reload buyer details before saving.')
  const { data, error } = await client.rpc('bridge_save_transaction_buyer_capture', {
    p_transaction_id: transactionId, p_participant_id: context.participantId || null,
    p_revision: context.revision, p_buyer: buyer, p_profile: profile, p_mutation_id: mutationId,
  })
  if (error) throw failure(error)
  if (!data?.revision || !data?.buyer || data.mutationId !== mutationId) throw new Error('The save could not be confirmed. Retry to check the same save; your entries remain here.')
  return { ...data, profile: buyerCaptureProfile(data.profile) }
}
