// transactions owns these operations and their existing recovery behavior.
import { isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { isMissingRpcFunctionError } from '../finance/schemaCompatibility.js'

export async function fetchBuyerProcessLeadHandoffForTransaction(client, transactionId) {
  if (!transactionId) return null

  let query = await client
    .from('leads')
    .select('lead_id, converted_transaction_id, stage, status, raw_enquiry_payload, updated_at')
    .eq('converted_transaction_id', transactionId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (query.error && isMissingColumnError(query.error, 'raw_enquiry_payload')) {
    query = await client
      .from('leads')
      .select('lead_id, converted_transaction_id, stage, status, updated_at')
      .eq('converted_transaction_id', transactionId)
      .order('updated_at', { ascending: false })
      .limit(1)
  }

  if (
    query.error &&
    (isMissingSchemaError(query.error) || isPermissionDeniedError(query.error))
  ) {
    return null
  }

  if (query.error) {
    throw query.error
  }

  const row = Array.isArray(query.data) ? query.data[0] || null : null
  if (!row) return null
  return {
    leadId: row.lead_id || '',
    convertedTransactionId: row.converted_transaction_id || '',
    stage: row.stage || '',
    status: row.status || '',
    rawEnquiryPayload: row.raw_enquiry_payload || null,
    updatedAt: row.updated_at || null,
  }
}

export async function fetchAgentBondOriginatorProgressView(client, transactionId) {
  if (!transactionId) {
    return null
  }

  const rpc = await client.rpc('bridge_agent_bond_originator_progress_view', {
    p_transaction_id: transactionId,
  })

  if (rpc.error) {
    if (
      isMissingRpcFunctionError(rpc.error, 'bridge_agent_bond_originator_progress_view') ||
      isMissingSchemaError(rpc.error) ||
      isPermissionDeniedError(rpc.error)
    ) {
      return null
    }

    throw rpc.error
  }

  if (!rpc.data || typeof rpc.data !== 'object') {
    return null
  }

  return rpc.data
}

export async function fetchAgentBondApplicationIdentity(client, transactionId, bondApplicationId = null) {
  if (!transactionId) return null

  const rpc = await client.rpc('bridge_agent_bond_application_identity', {
    p_transaction_id: transactionId,
    p_bond_application_id: bondApplicationId || null,
  })

  if (rpc.error) {
    if (
      isMissingRpcFunctionError(rpc.error, 'bridge_agent_bond_application_identity') ||
      isMissingSchemaError(rpc.error) ||
      isPermissionDeniedError(rpc.error)
    ) {
      return null
    }
    throw rpc.error
  }

  return rpc.data && typeof rpc.data === 'object' ? rpc.data : null
}

export async function fetchAgentBondApplicationWorkspaceView(client, transactionId, bondApplicationId = null) {
  if (!transactionId) return null

  const rpc = await client.rpc('bridge_agent_bond_application_workspace_view', {
    p_transaction_id: transactionId,
    p_bond_application_id: bondApplicationId || null,
  })

  if (rpc.error) {
    if (
      isMissingRpcFunctionError(rpc.error, 'bridge_agent_bond_application_workspace_view') ||
      isMissingSchemaError(rpc.error) ||
      isPermissionDeniedError(rpc.error)
    ) {
      return null
    }
    throw rpc.error
  }

  return rpc.data && typeof rpc.data === 'object' ? rpc.data : null
}

export async function fetchAttorneyBondOriginatorHandoffView(client, transactionId) {
  if (!transactionId) {
    return null
  }

  const rpc = await client.rpc('bridge_attorney_bond_originator_handoff_view', {
    p_transaction_id: transactionId,
  })

  if (rpc.error) {
    if (
      isMissingRpcFunctionError(rpc.error, 'bridge_attorney_bond_originator_handoff_view') ||
      isMissingSchemaError(rpc.error) ||
      isPermissionDeniedError(rpc.error)
    ) {
      return null
    }

    throw rpc.error
  }

  if (!rpc.data || typeof rpc.data !== 'object') {
    return null
  }

  return rpc.data
}
