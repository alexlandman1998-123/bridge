import { buildMvpTransactionAuditRecovery } from '../core/transactions/mvpTransactionAuditRecovery.js'
import { listNotificationOutbox, prepareNotificationOutboxRecovery } from './notificationOutboxService'
import { getTransactionWorkflowReadModel } from './transactionWorkflowReadModelService'

function text(value) {
  return String(value || '').trim()
}

async function loadAuditContext({ transactionId = '', viewerRole = 'agent' } = {}) {
  const workflow = await getTransactionWorkflowReadModel(transactionId, { viewerRole, canViewPrivate: true })
  const transaction = workflow?.transaction || {}
  const notificationOutbox = transaction.organisationId && transaction.id
    ? await listNotificationOutbox({ organisationId: transaction.organisationId, transactionId: transaction.id })
    : []
  const audit = buildMvpTransactionAuditRecovery({
    transaction,
    truth: workflow?.mvpTruth,
    health: workflow?.mvpTransactionHealth,
    participantRoster: workflow?.participantRoster,
    documentRoster: workflow?.documentRoster,
    warnings: workflow?.warnings,
    notificationOutbox,
  })
  return { workflow, notificationOutbox, audit }
}

export async function auditMvpTransaction({ transactionId = '', viewerRole = 'agent' } = {}) {
  if (!text(transactionId)) throw new Error('A transaction id is required for the health audit.')
  return loadAuditContext({ transactionId, viewerRole })
}

/** Runs only explicit recovery actions. Guided actions never mutate transaction state. */
export async function runMvpTransactionRecoveryAction({ transactionId = '', actionKey = '', eventId = '', viewerRole = 'agent', actor = {}, confirm = false } = {}) {
  if (!text(transactionId)) throw new Error('A transaction id is required for recovery.')
  if (actionKey === 'refresh_transaction_health') {
    return { actionKey, mutated: false, ...(await loadAuditContext({ transactionId, viewerRole })) }
  }

  if (['resolve_current_gate', 'review_participant_assignments', 'review_document_requirements', 'review_notification_delivery'].includes(actionKey)) {
    const context = await loadAuditContext({ transactionId, viewerRole })
    return {
      actionKey,
      mutated: false,
      guided: true,
      message: 'Review the highlighted health-panel item and complete it in the relevant workflow workspace.',
      ...context,
    }
  }

  if (actionKey === 'prepare_notification_retry') {
    if (confirm !== true) throw new Error('Confirm the notification retry before preparing it for review.')
    const context = await loadAuditContext({ transactionId, viewerRole })
    const event = context.notificationOutbox.find((item) => item.id === text(eventId))
    if (!event) throw new Error('The failed notification event is not available for this transaction.')
    const recoveredEvent = await prepareNotificationOutboxRecovery({
      eventId: event.id,
      organisationId: context.workflow.transaction.organisationId,
      actor,
    })
    return {
      actionKey,
      mutated: true,
      recoveredEvent,
      ...(await loadAuditContext({ transactionId, viewerRole })),
    }
  }

  throw new Error('Unsupported transaction recovery action.')
}
