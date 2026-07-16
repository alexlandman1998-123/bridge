import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const MISSING_RPC_CODES = new Set(['42883', 'PGRST202'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLaneKeys(value = []) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => normalizeText(item).toLowerCase()).filter((item) => ['transfer', 'bond', 'cancellation'].includes(item)))]
}

function isMissingHandoffRpc(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return MISSING_RPC_CODES.has(code) || message.includes('bridge_prepare_agent_legal_handoff')
}

export function normalizeAgentLegalHandoffResult(value = {}, transactionId = '') {
  const result = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const requiredLaneKeys = normalizeLaneKeys(result.requiredLaneKeys || result.required_lane_keys)
  const assignedAttorneyRoles = [...new Set((result.assignedAttorneyRoles || result.assigned_attorney_roles || []).map(normalizeText).filter(Boolean))]
  const missingAttorneyRoles = [...new Set((result.missingAttorneyRoles || result.missing_attorney_roles || []).map(normalizeText).filter(Boolean))]
  return {
    transactionId: normalizeText(result.transactionId || result.transaction_id || transactionId),
    requiredLaneKeys,
    assignedAttorneyRoles,
    missingAttorneyRoles,
    laneCount: Number(result.laneCount || result.lane_count || requiredLaneKeys.length) || requiredLaneKeys.length,
    seededStepCount: Number(result.seededStepCount || result.seeded_step_count || 0) || 0,
    readyForAttorneyAssignment: missingAttorneyRoles.length > 0,
    prepared: result.prepared !== false,
  }
}

export async function prepareAgentLegalHandoff(transactionId, client = supabase) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) throw new Error('Transaction id is required before preparing the legal handoff.')
  if (!client || (client === supabase && !isSupabaseConfigured)) {
    throw new Error('Legal handoff preparation requires the canonical transaction database.')
  }

  const result = await client.rpc('bridge_prepare_agent_legal_handoff', {
    p_transaction_id: normalizedTransactionId,
  })
  if (result.error) {
    if (isMissingHandoffRpc(result.error)) {
      throw new Error('Legal handoff setup is not installed yet. Apply the Phase 2 database migration and retry this transaction.')
    }
    throw result.error
  }
  return normalizeAgentLegalHandoffResult(result.data, normalizedTransactionId)
}

export const __agentLegalHandoffTestUtils = Object.freeze({
  isMissingHandoffRpc,
  normalizeLaneKeys,
})
