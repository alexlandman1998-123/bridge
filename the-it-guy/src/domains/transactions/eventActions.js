// Extracted without changing validation, persistence order or recovery behaviour.
import { supabase } from '../../lib/supabaseClient'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeEventType, normalizeTransactionEventRow } from './activityReadApi.js'
import { isMissingColumnError, isMissingTableError, isMissingSchemaError, requireClient } from '../../lib/api/shared/readHelpers.js'

export async function loadWorkflowRecomputeService() {
  return import('../../../server/services/workflowRecomputeService.js')
}

export async function logTransactionEventIfPossible(client, payload = {}) {
  if (!payload?.transactionId) {
    return null
  }

  // Optional browser followups can outlive sign-out or an account switch.
  // Never attribute their delayed audit write to the replacement session.
  if (client === supabase && payload.createdBy) {
    const session = await client.auth.getSession()
    if (session.error || session.data?.session?.user?.id !== payload.createdBy) return null
  }

  const activeProfile = await resolveActiveProfileContext(client)
  const insertPayload = {
    transaction_id: payload.transactionId,
    event_type: normalizeEventType(payload.eventType),
    event_data: payload.eventData && typeof payload.eventData === 'object' ? payload.eventData : {},
    created_by: payload.createdBy || activeProfile.userId || null,
    created_by_role: payload.createdByRole || activeProfile.role || null,
  }

  let insertResult = await client
    .from('transaction_events')
    .insert(insertPayload)
    .select('id, transaction_id, event_type, event_data, created_by, created_by_role, created_at, updated_at')
    .single()

  if (
    insertResult.error &&
    (isMissingColumnError(insertResult.error, 'created_by') ||
      isMissingColumnError(insertResult.error, 'created_by_role') ||
      isMissingColumnError(insertResult.error, 'event_data'))
  ) {
    const fallbackPayload = { ...insertPayload }
    delete fallbackPayload.created_by
    delete fallbackPayload.created_by_role
    delete fallbackPayload.event_data

    insertResult = await client
      .from('transaction_events')
      .insert(fallbackPayload)
      .select('id, transaction_id, event_type, created_at')
      .single()
  }

  if (insertResult.error) {
    if (isMissingTableError(insertResult.error, 'transaction_events') || isMissingSchemaError(insertResult.error)) {
      return null
    }

    throw insertResult.error
  }

  return normalizeTransactionEventRow(insertResult.data)
}

export async function publishWorkflowChangedIfPossible(client, payload = {}) {
  if (!payload?.transactionId) {
    return null
  }

  try {
    const { publishWorkflowChanged } = await loadWorkflowRecomputeService()
    return await publishWorkflowChanged({
      ...payload,
      client,
    })
  } catch (error) {
    if (
      isMissingTableError(error, 'transaction_workflow_instances') ||
      isMissingTableError(error, 'transaction_workflow_steps') ||
      isMissingTableError(error, 'transaction_workflow_evidence') ||
      isMissingTableError(error, 'transaction_rollups') ||
      isMissingTableError(error, 'transaction_workflow_events') ||
      isMissingSchemaError(error)
    ) {
      console.warn('[workflow-recompute] canonical workflow schema unavailable, skipping workflow recompute', {
        transactionId: payload.transactionId,
        triggerType: payload.triggerType,
        reasonCode: payload.reasonCode,
        error: error?.message || String(error),
      })
      return null
    }
    throw error
  }
}

export async function createTransactionEvent({
  transactionId,
  eventType,
  eventData = {},
  createdBy = null,
  createdByRole = null,
}) {
  const client = requireClient()
  const event = await logTransactionEventIfPossible(client, {
    transactionId,
    eventType,
    eventData,
    createdBy,
    createdByRole,
  })

  await publishWorkflowChangedIfPossible(client, {
    transactionId,
    triggerType: 'event',
    triggerId: event?.id || eventType || null,
    reasonCode: `transaction_event_${
      String(eventType || 'created')
        .trim()
        .toLowerCase() || 'created'
    }`,
    userId: createdBy || null,
    source: 'transaction_event',
    payload: {
      eventType,
      eventData,
    },
  })

  return event
}
