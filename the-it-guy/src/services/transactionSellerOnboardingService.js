import { supabase } from '../lib/supabaseClient.js'
function fail(error) {
  const result = new Error(['PGRST202','42883'].includes(error?.code)
    ? 'Seller onboarding needs its database update before this link can be used. No invitation has been sent.'
    : error?.message || 'Seller onboarding could not be loaded.')
  result.code = error?.code
  return result
}
export async function prepareTransactionSellerLink({ transactionId, context, mutationId, client = supabase }) {
  if (!context?.revision || !mutationId) throw new Error('Reload seller details before preparing their link.')
  const {data,error}=await client.rpc('bridge_prepare_transaction_seller_link',{p_transaction_id:transactionId,p_revision:context.revision,p_mutation_id:mutationId})
  if(error) throw fail(error)
  if(data?.mutationId!==mutationId || data?.transactionId!==transactionId || !data?.token || !data?.email || !data?.linkId) throw new Error('The seller invitation could not be confirmed. Retry to check the same request.')
  return {...data,link:`${window.location.origin}/seller/transaction/${encodeURIComponent(data.token)}`}
}
export async function loadTransactionSellerOnboarding({ token, client = supabase }) {
  const {data,error}=await client.rpc('bridge_get_transaction_seller_onboarding',{p_token:token})
  if(error) throw fail(error)
  if(!data?.revision || !data?.details || !data?.profile || !Array.isArray(data.roster)) throw new Error('Seller details could not be confirmed.')
  return data
}
export async function saveTransactionSellerOnboarding({ token, context, profile, mutationId, client = supabase }) {
  const {data,error}=await client.rpc('bridge_save_transaction_seller_onboarding',{p_token:token,p_revision:context.revision,p_profile:profile,p_mutation_id:mutationId})
  if(error) throw fail(error)
  if(data?.mutationId!==mutationId || !data?.revision || !data?.profile) throw new Error('The seller save could not be confirmed. Your entries remain here; retry to check the same save.')
  return data
}
