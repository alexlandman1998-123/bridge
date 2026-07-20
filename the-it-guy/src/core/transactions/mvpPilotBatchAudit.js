export const MVP_PILOT_BATCH_AUDIT_VERSION = 'arch9_mvp_pilot_batch_audit_v2'

export function auditMvpPilotBatch(transactions = [], { batchLimit = 2 } = {}) {
  const rows = Array.isArray(transactions) ? transactions : []
  const issues = []
  if (rows.length > batchLimit) issues.push('batch_limit_exceeded')
  const keys = new Set()
  for (const transaction of rows) {
    const id = String(transaction?.transactionId || transaction?.id || '').trim()
    const key = String(transaction?.idempotencyKey || transaction?.creation_idempotency_key || '').trim()
    if (!id) issues.push('transaction_id_missing')
    if (!key) issues.push('idempotency_key_missing')
    if (key && keys.has(key)) issues.push(`duplicate_idempotency_key:${key}`)
    if (key) keys.add(key)
    if (transaction?.participantBootstrapComplete !== true) issues.push(`participant_bootstrap_missing:${id || key}`)
    if (transaction?.documentBootstrapComplete !== true) issues.push(`document_bootstrap_missing:${id || key}`)
    if (transaction?.workflowBootstrapComplete !== true) issues.push(`workflow_bootstrap_missing:${id || key}`)
    if (transaction?.conversionConfirmed !== true) issues.push(`accepted_offer_conversion_unconfirmed:${id || key}`)
    if (transaction?.healthAudited !== true) issues.push(`transaction_health_not_audited:${id || key}`)
    if (transaction?.notificationDeliveryReviewed !== true) issues.push(`notification_delivery_not_reviewed:${id || key}`)
  }
  return { version: MVP_PILOT_BATCH_AUDIT_VERSION, passed: issues.length === 0, batchSize: rows.length, batchLimit, issues }
}
