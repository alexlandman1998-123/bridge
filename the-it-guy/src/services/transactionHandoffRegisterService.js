import { supabase } from '../lib/supabaseClient'

export async function readTransactionHandoffRegister(transactionId, { client = supabase } = {}) {
  if (!transactionId) return { version: 'transaction_handoff_register_v1', items: [] }
  if (!client) throw new Error('Connect to the transaction workspace to view partner handoffs.')
  const { data, error } = await client.rpc('bridge_read_transaction_handoffs', { p_transaction_id: transactionId })
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) {
      throw new Error('The partner handoff register is not available yet. Contact your workspace administrator.')
    }
    throw error
  }
  if (!Array.isArray(data?.items)) throw new Error('The partner handoff register could not be loaded.')
  return data
}

// Missing migration is the only legacy fallback. Permission/network failures
// must not trigger a second delivery path.
export async function readTransactionHandoffDispatchMode(client, transactionId) {
  const { data, error } = await client.rpc('bridge_transaction_handoff_dispatch_mode', { p_transaction_id: transactionId })
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) return false
    throw error
  }
  if (typeof data?.enabled !== 'boolean') throw new Error('Unable to confirm the handoff delivery mode.')
  return data.enabled
}

export async function recoverTransactionHandoff({ handoffId, generation, action, reason, requestId }, { client = supabase } = {}) {
  if (!client) throw new Error('Connect to the workspace to recover a handoff.')
  const { data, error } = await client.rpc('bridge_recover_transaction_handoff', {
    p_handoff_id: handoffId, p_generation: generation, p_action: action, p_reason: reason, p_request_id: requestId,
  })
  if (error) throw error
  const messages = {
    organisation_authority_required: 'An organisation manager must recover this handoff.',
    review_reason_required: 'Record a review reason of at least 10 characters.',
    handoff_changed: 'The handoff changed. Refresh and review its current destination.',
    recovery_not_available: 'This handoff cannot be recovered yet. Refresh and check its outstanding requirements.',
    matter_closed: 'This matter is closed.',
    delivery_confirmation_required: 'Confirm the previous provider result before arranging any further delivery.',
    existing_finance_owner_required: 'Progressed bond work belongs to another organisation. Correct the nomination to its existing finance owner before releasing this hold.',
    request_conflict: 'This recovery request conflicts with an earlier decision. Refresh the handoff.',
  }
  if (!data?.success) throw new Error(messages[data?.code] || 'The recovery could not be confirmed. Refresh the handoff before retrying.')
  return data
}

export async function readOrganisationHandoffQueue(organisationId, { bucket = 'all', offset = 0, limit = 25, client = supabase } = {}) {
  if (!client) throw new Error('Connect to the workspace to view organisation handoffs.')
  const { data, error } = await client.rpc('bridge_read_organisation_handoff_queue', {
    p_organisation_id: organisationId, p_bucket: bucket, p_limit: limit, p_offset: offset,
  })
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) throw new Error('The organisation handoff queue is not available yet. Contact your workspace administrator.')
    throw error
  }
  if (data?.code === 'organisation_authority_required') throw new Error('An organisation manager at agency headquarters must view this queue.')
  if (!data?.success || data.organisationId !== organisationId || !Array.isArray(data.items) || !data.counts || Array.isArray(data.counts) || !Number.isFinite(data.total) || data.total < 0 || typeof data.hasMore !== 'boolean') {
    throw new Error('The organisation handoff queue could not be confirmed. Refresh before acting.')
  }
  return data
}
