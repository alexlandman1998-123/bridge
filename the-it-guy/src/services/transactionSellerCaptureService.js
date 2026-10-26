import { supabase } from '../lib/supabaseClient.js'

function failure(error) {
  const result = new Error(error?.code === 'PGRST202' || error?.code === '42883'
    ? 'Full seller capture needs its database update before it can be used. Your entries have not been submitted.'
    : error?.message || 'Seller details could not be saved. Your entries remain in this form.')
  result.code = error?.code
  return result
}
export async function loadTransactionSellerCapture({ transactionId, client = supabase }) {
  const { data, error } = await client.rpc('bridge_get_transaction_seller_capture', { p_transaction_id: transactionId })
  if (error) throw failure(error)
  if (!data?.revision || !data?.details || !Array.isArray(data.roster)) throw new Error('The full seller capture could not be loaded.')
  return data
}
export async function saveTransactionSellerCapture({ transactionId, context, profile, mutationId, client = supabase }) {
  if (!context?.revision || !mutationId) throw new Error('Reload the seller profile before saving.')
  const { data, error } = await client.rpc('bridge_save_transaction_seller_capture', {
    p_transaction_id: transactionId, p_revision: context.revision, p_profile: profile, p_mutation_id: mutationId,
  })
  if (error) throw failure(error)
  if (data?.mutationId !== mutationId || !data?.revision || !data?.profile) throw new Error('The seller save could not be confirmed. Your entries remain in this form. Retry to check the same save.')
  return data
}
