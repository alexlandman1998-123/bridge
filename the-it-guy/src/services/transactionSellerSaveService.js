import { supabase } from '../lib/supabaseClient.js'

const fields = ['name', 'email', 'phone']
export const SELLER_SAVE_CONFLICT_MESSAGE = 'Someone else saved changes to this seller record. Your entries are still in this form. Review the latest saved details before trying again.'

function saveError(error) {
  const result = new Error(error?.code === 'PT409' ? SELLER_SAVE_CONFLICT_MESSAGE : error?.message || 'Seller details could not be saved. Your entries are still in this form.')
  result.code = error?.code
  return result
}

export async function loadTransactionSellerEditContext({ transactionId, client = supabase }) {
  const { data, error } = await client.rpc('bridge_get_transaction_seller_edit_context', { p_transaction_id: transactionId })
  if (error) throw saveError(error)
  if (!data?.revision || !data?.details) throw new Error('The seller save service is unavailable. Reload before editing seller details.')
  return data
}

export function buildTransactionSellerPatch(details, baseline) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(details, field) && details[field] !== undefined && String(details[field] ?? '').trim() !== String(baseline[field] ?? '').trim())
    .map((field) => [field, String(details[field] ?? '').trim()]))
}

export async function saveTransactionSellerDetails({ transactionId, details, context, mutationId, client = supabase }) {
  if (!context?.revision || !mutationId) throw new Error('Reload the seller details before saving. Your entries are still in this form.')
  if (context.blockedReason) throw new Error(context.blockedReason)
  const patch = buildTransactionSellerPatch(details, context.details)
  if (!Object.keys(patch).length) return context
  const { data, error } = await client.rpc('bridge_save_transaction_seller_details', {
    p_transaction_id: transactionId, p_revision: context.revision, p_patch: patch, p_mutation_id: mutationId,
  })
  if (error) throw saveError(error)
  // A read-back after a timeout could include someone else's changes. Only the
  // receipt for this command may advance the editor's original revision.
  if (data?.mutationId !== mutationId || !data?.revision || !data?.details) throw new Error('The save could not be confirmed. Your entries are still in this form. Retry to check the same save.')
  return data
}
