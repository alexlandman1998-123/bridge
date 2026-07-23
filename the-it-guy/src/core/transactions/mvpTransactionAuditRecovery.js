export const MVP_TRANSACTION_AUDIT_RECOVERY_VERSION = 'arch9_mvp_transaction_audit_recovery_v2'

function text(value) {
  return String(value || '').trim()
}

function rows(value) {
  return Array.isArray(value) ? value : []
}

function issue({ key, severity = 'warning', title, detail, ownerRole = 'transaction_coordinator', recoveryActionKey = '' }) {
  return { key, severity, title, detail, ownerRole, recoveryActionKey: recoveryActionKey || null }
}

function uniqueByKey(items = []) {
  return [...new Map(items.map((item) => [item.key, item])).values()]
}

/**
 * Builds a non-mutating audit and an explicit recovery plan. Recovery actions
 * intentionally separate guided human fixes from a safe notification retry.
 */
export function buildMvpTransactionAuditRecovery({
  transaction = {},
  truth = {},
  health = {},
  participantRoster = {},
  documentRoster = {},
  warnings = [],
  notificationOutbox = [],
} = {}) {
  const issues = []
  const actionMap = new Map()
  const addAction = (action) => {
    if (action?.key) actionMap.set(action.key, action)
  }

  if (!text(transaction.id || transaction.transactionId)) {
    issues.push(issue({ key: 'transaction_id_missing', severity: 'critical', title: 'Transaction identity is missing', detail: 'Reload the transaction before taking any workflow action.', recoveryActionKey: 'refresh_transaction_health' }))
    addAction({ key: 'refresh_transaction_health', label: 'Refresh transaction health', mode: 'read_only', safeToRun: true })
  }

  for (const warning of rows(warnings)) {
    issues.push(issue({ key: `read_model:${warning}`, severity: 'warning', title: 'Some transaction data could not be loaded', detail: text(warning), recoveryActionKey: 'refresh_transaction_health' }))
    addAction({ key: 'refresh_transaction_health', label: 'Refresh transaction health', mode: 'read_only', safeToRun: true })
  }

  const currentGate = health.currentGate || {}
  if (currentGate.satisfied === false) {
    issues.push(issue({
      key: `gate:${text(currentGate.key) || 'current'}`,
      severity: 'blocking',
      title: `${text(currentGate.label) || 'Current workflow'} gate is blocked`,
      detail: `${Number(currentGate.blockerCount || 0)} blocker${Number(currentGate.blockerCount || 0) === 1 ? '' : 's'} must be resolved before progress.`,
      recoveryActionKey: 'resolve_current_gate',
    }))
    addAction({ key: 'resolve_current_gate', label: 'Review current gate blockers', mode: 'guided', safeToRun: true })
  }

  const missingRoles = Number(participantRoster?.summary?.unassigned || participantRoster?.summary?.missingAtCreation || 0)
  if (missingRoles > 0) {
    issues.push(issue({ key: 'participants:missing', severity: 'blocking', title: 'Required participants are missing', detail: `${missingRoles} required role${missingRoles === 1 ? '' : 's'} still need an assigned, contactable participant.`, ownerRole: 'agent', recoveryActionKey: 'review_participant_assignments' }))
    addAction({ key: 'review_participant_assignments', label: 'Review participant assignments', mode: 'guided', safeToRun: true })
  }

  const outstandingDocuments = Number(documentRoster?.summary?.outstanding || documentRoster?.summary?.outstandingCount || 0)
  if (outstandingDocuments > 0) {
    issues.push(issue({ key: 'documents:outstanding', severity: 'warning', title: 'Required documents are outstanding', detail: `${outstandingDocuments} required document${outstandingDocuments === 1 ? '' : 's'} need upload, review, or replacement.`, recoveryActionKey: 'review_document_requirements' }))
    addAction({ key: 'review_document_requirements', label: 'Review document requirements', mode: 'guided', safeToRun: true })
  }

  const testData = health.testData || transaction.testDataProtection || {}
  const protectedTestData = testData.isTestData === true || testData.is_test_data === true
  const creation = health.creation || {}
  const hasCreationEvidence = Boolean(creation.acceptedOfferId || creation.idempotencyKey || creation.receiptStatus)
  if (hasCreationEvidence && creation.confirmed !== true) {
    issues.push(issue({
      key: 'creation:unconfirmed',
      severity: 'critical',
      title: 'Accepted-offer conversion is not fully confirmed',
      detail: 'The accepted offer and creation idempotency key must both match this transaction before any retry or manual intervention.',
      recoveryActionKey: 'refresh_transaction_health',
    }))
    addAction({ key: 'refresh_transaction_health', label: 'Refresh transaction health', mode: 'read_only', safeToRun: true })
  }
  if (protectedTestData) {
    issues.push(issue({ key: 'test_data_protected', severity: 'info', title: 'Controlled test transaction', detail: 'External delivery remains suppressed for this transaction.', recoveryActionKey: 'refresh_transaction_health' }))
  }

  const failedNotifications = rows(notificationOutbox).filter((event) => event?.status === 'failed')
  for (const event of failedNotifications) {
    const suppressed = event?.metadata?.notificationSuppressed === true || event?.metadata?.notification_suppressed === true
    const canPrepareRetry = !protectedTestData && !suppressed
    issues.push(issue({
      key: `notification:${text(event.id) || text(event.dedupeKey)}`,
      severity: canPrepareRetry ? 'warning' : 'info',
      title: canPrepareRetry ? 'Notification delivery failed' : 'Protected notification was not delivered',
      detail: canPrepareRetry
        ? `${text(event.channel || 'Notification')} delivery can be prepared for an explicit retry.`
        : 'No external retry is available for protected test data.',
      recoveryActionKey: canPrepareRetry ? 'prepare_notification_retry' : '',
    }))
    if (canPrepareRetry && text(event.id)) {
      addAction({
        key: `prepare_notification_retry:${event.id}`,
        actionKey: 'prepare_notification_retry',
        eventId: event.id,
        label: 'Prepare notification retry',
        mode: 'write_requires_confirmation',
        safeToRun: false,
      })
    }
  }

  const preparedNotifications = rows(notificationOutbox).filter((event) => event?.status === 'prepared')
  if (preparedNotifications.length > 0) {
    issues.push(issue({
      key: 'notification:prepared_review',
      severity: 'warning',
      title: 'Notification delivery needs operator review',
      detail: `${preparedNotifications.length} notification${preparedNotifications.length === 1 ? ' is' : 's are'} prepared but not sent. Confirm the recipient and content before an operator sends anything.`,
      recoveryActionKey: 'review_notification_delivery',
    }))
    addAction({ key: 'review_notification_delivery', label: 'Review prepared notifications', mode: 'guided', safeToRun: true })
  }

  const agentHandoffs = rows(notificationOutbox).filter((event) => event?.handoffRequired === true || event?.metadata?.handoffRequired === true)
  if (agentHandoffs.length > 0 && preparedNotifications.length === 0) {
    issues.push(issue({
      key: 'notification:agent_handoff',
      severity: 'info',
      title: 'Agent-assisted notification handoff is pending',
      detail: `${agentHandoffs.length} recipient${agentHandoffs.length === 1 ? ' requires' : 's require'} an explicit agent handoff; no external message has been sent automatically.`,
      recoveryActionKey: 'review_notification_delivery',
    }))
    addAction({ key: 'review_notification_delivery', label: 'Review notification handoff', mode: 'guided', safeToRun: true })
  }

  const normalizedIssues = uniqueByKey(issues)
  const hasBlocking = normalizedIssues.some((item) => ['critical', 'blocking'].includes(item.severity))
  const hasWarnings = normalizedIssues.some((item) => item.severity === 'warning')
  return {
    version: MVP_TRANSACTION_AUDIT_RECOVERY_VERSION,
    transactionId: text(transaction.id || transaction.transactionId || truth.transactionId) || null,
    status: hasBlocking ? 'action_required' : hasWarnings ? 'review_required' : 'healthy',
    statusLabel: hasBlocking ? 'Action required' : hasWarnings ? 'Review required' : 'Healthy',
    issues: normalizedIssues,
    actions: [...actionMap.values()],
    summary: {
      critical: normalizedIssues.filter((item) => item.severity === 'critical').length,
      blocking: normalizedIssues.filter((item) => item.severity === 'blocking').length,
      warnings: normalizedIssues.filter((item) => item.severity === 'warning').length,
      information: normalizedIssues.filter((item) => item.severity === 'info').length,
    },
  }
}
