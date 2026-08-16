import { resolveMvpTransactionCreationLineage } from './mvpTransactionCreationLineage.js'

export const MVP_PILOT_BATCH_AUDIT_VERSION = 'arch9_mvp_pilot_batch_audit_v3'

function text(value) {
  return String(value || '').trim()
}

function resolveBatchLineage(transaction = {}, { requireAcceptedOfferLineage = true } = {}) {
  const explicitLineage = transaction.creationLineage || transaction.creation_lineage || null
  if (explicitLineage?.mode) return explicitLineage

  const transactionId = text(transaction.transactionId || transaction.id)
  const acceptedOfferId = text(transaction.acceptedOfferId || transaction.accepted_offer_id)
  const idempotencyKey = text(transaction.idempotencyKey || transaction.creation_idempotency_key)
  const conversionReceipt = transaction.conversionReceipt || transaction.conversion_receipt || {
    ready: transaction.conversionConfirmed === true,
    status: transaction.existing === true ? 'reused' : 'created',
    transactionId,
    acceptedOfferId,
    idempotencyKey,
  }

  const routingProfile = transaction.routingProfile || transaction.routing_profile_json || (
    transaction.transactionCreationOverride || transaction.transaction_creation_override
      ? {
          transactionCreationOverride: transaction.transactionCreationOverride || transaction.transaction_creation_override,
        }
      : {}
  )

  const lineage = resolveMvpTransactionCreationLineage({
    transaction: {
      ...transaction,
      id: transactionId,
      acceptedOfferId,
      creationIdempotencyKey: idempotencyKey,
      routingProfile,
    },
    conversionReceipt,
  })

  return {
    ...lineage,
    requiredMode: requireAcceptedOfferLineage ? 'accepted_offer' : 'accepted_offer_or_manual_override',
  }
}

export function auditMvpPilotBatch(transactions = [], { batchLimit = 2 } = {}) {
  const rows = Array.isArray(transactions) ? transactions : []
  const issues = []
  const creationLineage = []
  if (rows.length > batchLimit) issues.push('batch_limit_exceeded')
  const keys = new Set()
  for (const transaction of rows) {
    const id = text(transaction?.transactionId || transaction?.id)
    const key = text(transaction?.idempotencyKey || transaction?.creation_idempotency_key)
    const acceptedOfferId = text(transaction?.acceptedOfferId || transaction?.accepted_offer_id)
    const lineage = resolveBatchLineage(transaction, { requireAcceptedOfferLineage: true })
    creationLineage.push({
      transactionId: id || lineage.transactionId || null,
      mode: lineage.mode,
      acceptedOfferId: lineage.acceptedOfferId || null,
      confirmed: lineage.confirmed === true,
      auditVisible: lineage.auditVisible === true,
      issues: lineage.issues || [],
    })
    if (!id) issues.push('transaction_id_missing')
    if (!key) issues.push('idempotency_key_missing')
    if (!acceptedOfferId) issues.push(`accepted_offer_id_missing:${id || key}`)
    if (key && keys.has(key)) issues.push(`duplicate_idempotency_key:${key}`)
    if (key) keys.add(key)
    if (transaction?.participantBootstrapComplete !== true) issues.push(`participant_bootstrap_missing:${id || key}`)
    if (transaction?.documentBootstrapComplete !== true) issues.push(`document_bootstrap_missing:${id || key}`)
    if (transaction?.workflowBootstrapComplete !== true) issues.push(`workflow_bootstrap_missing:${id || key}`)
    if (transaction?.conversionConfirmed !== true) issues.push(`accepted_offer_conversion_unconfirmed:${id || key}`)
    if (lineage.mode === 'manual_override') issues.push(`manual_override_not_allowed_in_pilot:${id || key}`)
    if (lineage.mode !== 'accepted_offer' || !acceptedOfferId) issues.push(`accepted_offer_lineage_required:${id || key}`)
    if (lineage.confirmed !== true || lineage.auditVisible !== true) issues.push(`creation_lineage_unconfirmed:${id || key}`)
    if (transaction?.healthAudited !== true) issues.push(`transaction_health_not_audited:${id || key}`)
    if (transaction?.notificationDeliveryReviewed !== true) issues.push(`notification_delivery_not_reviewed:${id || key}`)
  }
  return { version: MVP_PILOT_BATCH_AUDIT_VERSION, passed: issues.length === 0, batchSize: rows.length, batchLimit, creationLineage, issues }
}
