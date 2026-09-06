import { normalizeText, requireClient } from './attorneyFirmServiceShared.js'

export const ATTORNEY_DELEGATABLE_ROLES = Object.freeze(['bond_attorney', 'cancellation_attorney'])
export const ATTORNEY_DELEGATION_CAPABILITIES = Object.freeze([
  'workflow',
  'documents',
  'internal_notes',
  'shared_updates',
])

const MAX_DELEGATION_DAYS = 30

function assertClient(client) {
  if (!client?.rpc) throw new Error('Supabase client is required.')
  return client
}

function normalizeRole(value = '') {
  const role = normalizeText(value).toLowerCase()
  if (role === 'bond') return 'bond_attorney'
  if (role === 'cancellation') return 'cancellation_attorney'
  if (ATTORNEY_DELEGATABLE_ROLES.includes(role)) return role
  throw new Error('Delegation is only available for bond and cancellation attorney lanes.')
}

function normalizeCapabilities(values = []) {
  const capabilities = [...new Set((Array.isArray(values) ? values : [values]).map((value) => normalizeText(value).toLowerCase()).filter(Boolean))]
  if (!capabilities.length) throw new Error('Select at least one delegated action.')
  if (capabilities.some((value) => !ATTORNEY_DELEGATION_CAPABILITIES.includes(value))) {
    throw new Error('One or more delegated actions are not supported.')
  }
  return capabilities
}

export function buildAttorneyLaneDelegationInput({
  transactionId = '',
  attorneyRole = '',
  delegateUserId = '',
  capabilities = [],
  reason = '',
  startsAt = null,
  expiresAt = '',
} = {}) {
  const transaction = normalizeText(transactionId)
  const delegate = normalizeText(delegateUserId)
  const explanation = normalizeText(reason)
  const expiry = new Date(expiresAt)
  const start = startsAt ? new Date(startsAt) : new Date()
  if (!transaction) throw new Error('Transaction is required before granting delegation.')
  if (!delegate) throw new Error('Select the transfer attorney who will act on behalf of this lane.')
  if (!explanation) throw new Error('Add a reason for the delegation.')
  if (Number.isNaN(start.getTime()) || Number.isNaN(expiry.getTime()) || expiry <= start) {
    throw new Error('Delegation must have a valid future expiry.')
  }
  if (expiry.getTime() - start.getTime() > MAX_DELEGATION_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error(`Delegation cannot exceed ${MAX_DELEGATION_DAYS} days.`)
  }
  return {
    p_transaction_id: transaction,
    p_attorney_role: normalizeRole(attorneyRole),
    p_delegate_user_id: delegate,
    p_capabilities: normalizeCapabilities(capabilities),
    p_reason: explanation,
    p_starts_at: start.toISOString(),
    p_expires_at: expiry.toISOString(),
  }
}

export async function grantAttorneyLaneDelegation(input = {}, options = {}) {
  const client = assertClient(options.client || requireClient())
  const result = await client.rpc('bridge_grant_attorney_lane_delegation', buildAttorneyLaneDelegationInput(input))
  if (result.error) throw result.error
  return Array.isArray(result.data) ? result.data[0] || null : result.data || null
}

export async function revokeAttorneyLaneDelegation({ delegationId = '', reason = '' } = {}, options = {}) {
  const client = assertClient(options.client || requireClient())
  const id = normalizeText(delegationId)
  const explanation = normalizeText(reason)
  if (!id) throw new Error('Delegation is required.')
  if (!explanation) throw new Error('Add a reason for revoking the delegation.')
  const result = await client.rpc('bridge_revoke_attorney_lane_delegation', {
    p_delegation_id: id,
    p_reason: explanation,
  })
  if (result.error) throw result.error
  return Array.isArray(result.data) ? result.data[0] || null : result.data || null
}

export function isActiveAttorneyLaneDelegation(delegation, now = new Date()) {
  if (!delegation || normalizeText(delegation.status).toLowerCase() !== 'active') return false
  const startsAt = new Date(delegation.starts_at || delegation.startsAt)
  const expiresAt = new Date(delegation.expires_at || delegation.expiresAt)
  return !Number.isNaN(startsAt.getTime()) && !Number.isNaN(expiresAt.getTime()) && startsAt <= now && expiresAt > now
}

export function buildAttorneyDelegationAttribution(delegation, actualActorId = null) {
  const active = isActiveAttorneyLaneDelegation(delegation)
  return Object.freeze({
    actualActorId: normalizeText(actualActorId) || null,
    actingOnBehalf: active,
    delegationId: active ? delegation.id : null,
    responsibleFirmId: active ? delegation.responsible_firm_id || delegation.responsibleFirmId || null : null,
    delegatedAttorneyRole: active ? delegation.attorney_role || delegation.attorneyRole || null : null,
  })
}

export async function getActiveAttorneyLaneDelegation({ transactionId = '', attorneyRole = '', delegateUserId = '' } = {}, options = {}) {
  const client = options.client || requireClient()
  const transaction = normalizeText(transactionId)
  const delegate = normalizeText(delegateUserId)
  if (!transaction || !delegate) return null
  const now = new Date().toISOString()
  const query = await client
    .from('attorney_lane_delegations')
    .select('id, transaction_id, attorney_role, responsible_firm_id, delegate_user_id, capabilities, reason, status, starts_at, expires_at, granted_by, created_at')
    .eq('transaction_id', transaction)
    .eq('attorney_role', normalizeRole(attorneyRole))
    .eq('delegate_user_id', delegate)
    .eq('status', 'active')
    .lte('starts_at', now)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (query.error) {
    if (String(query.error.message || '').toLowerCase().includes('attorney_lane_delegations')) return null
    throw query.error
  }
  return query.data || null
}

export async function getAttorneyLaneDelegations({ transactionId = '', attorneyRole = '', activeOnly = false } = {}, options = {}) {
  const client = options.client || requireClient()
  const transaction = normalizeText(transactionId)
  if (!transaction) return []
  let query = client
    .from('attorney_lane_delegations')
    .select('id, transaction_id, attorney_role, responsible_firm_id, delegate_user_id, capabilities, reason, status, starts_at, expires_at, granted_by, revoked_at, revoked_by, revocation_reason, created_at, updated_at')
    .eq('transaction_id', transaction)
  if (attorneyRole) query = query.eq('attorney_role', normalizeRole(attorneyRole))
  if (activeOnly) query = query.eq('status', 'active').gt('expires_at', new Date().toISOString())
  const result = await query.order('created_at', { ascending: false })
  if (result.error) {
    if (String(result.error.message || '').toLowerCase().includes('attorney_lane_delegations')) return []
    throw result.error
  }
  return result.data || []
}
