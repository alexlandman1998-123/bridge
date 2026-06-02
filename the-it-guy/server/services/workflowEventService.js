import { requireClient, isMissingTableError } from '../../src/services/attorneyFirmServiceShared.js'

const WORKFLOW_EVENT_SELECT =
  'id, transaction_id, workflow_key, step_key, action_key, event_type, previous_status, new_status, payload_json, source, created_by, created_at'

function normalizeText(value) {
  return String(value || '').trim()
}

export async function logTransactionWorkflowEvent(event = {}, options = {}) {
  const client = options.client || requireClient()
  const payload = {
    transaction_id: event.transactionId,
    workflow_key: normalizeText(event.workflowKey),
    step_key: normalizeText(event.stepKey),
    action_key: normalizeText(event.actionKey),
    event_type: normalizeText(event.eventType || 'workflow_action_requested') || 'workflow_action_requested',
    previous_status: normalizeText(event.previousStatus) || null,
    new_status: normalizeText(event.newStatus) || null,
    payload_json: event.payload || {},
    source: normalizeText(event.source || 'user_action') || 'user_action',
    created_by: event.createdBy || null,
  }

  const query = await client
    .from('transaction_workflow_events')
    .insert(payload)
    .select(WORKFLOW_EVENT_SELECT)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_workflow_events')) {
      return null
    }
    throw query.error
  }

  return Array.isArray(query.data) ? query.data[0] || null : null
}

export async function logWorkflowChangedEvent(event = {}, options = {}) {
  return logTransactionWorkflowEvent(
    {
      ...event,
      eventType: event.eventType || 'transaction.workflow.changed',
      source: event.source || 'workflow_recompute',
    },
    options,
  )
}

export async function logWorkflowRecomputeEvent(event = {}, options = {}) {
  return logTransactionWorkflowEvent(
    {
      ...event,
      eventType: event.eventType || 'workflow_recompute_completed',
      source: event.source || 'workflow_recompute',
    },
    options,
  )
}
