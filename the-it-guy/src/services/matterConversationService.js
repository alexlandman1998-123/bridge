import { supabase, createScopedSupabaseClient } from '../lib/supabaseClient'

function access({ transactionId, token = '', sellerSession = '', client } = {}) {
  if (!transactionId) throw new Error('A linked matter is required.')
  const seller = token.toLowerCase().startsWith('seller-')
  return {
    client: client || (token && !seller ? createScopedSupabaseClient({ 'x-bridge-client-portal-token': token }) : supabase),
    args: { p_transaction_id: transactionId, p_seller_token: seller ? token : null,
      p_seller_session: seller ? sellerSession || null : null },
  }
}

export async function readMatterConversation(options) {
  const context = access(options)
  const result = await context.client.rpc('bridge_read_matter_conversation', context.args)
  if (result.error) throw result.error
  if (result.data?.transactionId !== options.transactionId || !Array.isArray(result.data?.items)
    || !Array.isArray(result.data?.audiences)) throw new Error('Invalid conversation response.')
  return result.data
}

export async function postMatterMessage(options) {
  const context = access(options)
  if (!options.commandId) throw new Error('A message request ID is required.')
  const result = await context.client.rpc('bridge_post_matter_message', {
    ...context.args, p_command_id: options.commandId, p_body: options.body, p_audience: options.audience,
  })
  if (result.error) throw result.error
  if (!result.data?.id) throw new Error('Message save could not be confirmed.')
  return result.data
}
