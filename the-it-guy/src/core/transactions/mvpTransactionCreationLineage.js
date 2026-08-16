export const MVP_TRANSACTION_CREATION_LINEAGE_VERSION = 'arch9_mvp_transaction_creation_lineage_v1'

function text(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function resolveRoutingProfile(transaction = {}) {
  return object(transaction.routingProfile || transaction.routing_profile_json)
}

function resolveReceipt(transaction = {}, conversionReceipt = null) {
  return object(
    conversionReceipt ||
      transaction.conversionReceipt ||
      transaction.conversion_receipt,
  )
}

function resolveOverride(transaction = {}, routingProfile = {}) {
  const profileOverride = object(
    routingProfile.transactionCreationOverride ||
      routingProfile.transaction_creation_override,
  )
  const transactionOverride = object(
    transaction.transactionCreationOverride ||
      transaction.transaction_creation_override,
  )
  const source = {
    ...profileOverride,
    ...transactionOverride,
  }
  const reason = firstText(
    source.reason,
    source.overrideReason,
    source.override_reason,
    transaction.transactionCreationOverrideReason,
    transaction.transaction_creation_override_reason,
  )
  const actorId = firstText(
    source.actorId,
    source.actor_id,
    transaction.transactionCreationOverrideActorId,
    transaction.transaction_creation_override_actor_id,
  )
  const actorRole = normalizeKey(firstText(
    source.actorRole,
    source.actor_role,
    transaction.transactionCreationOverrideActorRole,
    transaction.transaction_creation_override_actor_role,
  ))

  return {
    version: source.version || null,
    reason: reason || null,
    actorId: actorId || null,
    actorRole: actorRole || null,
    authorised: source.authorised === true || source.authorized === true,
    source: source.source || null,
  }
}

export function resolveMvpTransactionCreationLineage({
  transaction = {},
  conversionReceipt = null,
} = {}) {
  const routingProfile = resolveRoutingProfile(transaction)
  const receipt = resolveReceipt(transaction, conversionReceipt)
  const acceptedOfferId = firstText(
    receipt.acceptedOfferId,
    receipt.accepted_offer_id,
    transaction.acceptedOfferId,
    transaction.accepted_offer_id,
  )
  const idempotencyKey = firstText(
    transaction.creationIdempotencyKey,
    transaction.creation_idempotency_key,
    receipt.idempotencyKey,
    receipt.idempotency_key,
  )
  const transactionId = firstText(
    receipt.transactionId,
    receipt.transaction_id,
    transaction.transactionId,
    transaction.id,
  )
  const override = resolveOverride(transaction, routingProfile)
  const mode = acceptedOfferId
    ? 'accepted_offer'
    : override.reason || override.actorId || override.actorRole
      ? 'manual_override'
      : 'unknown'
  const issues = []

  if (!transactionId) issues.push('transaction_id_missing')
  if (!idempotencyKey) issues.push('idempotency_key_missing')

  if (mode === 'accepted_offer') {
    if (receipt.ready === false) issues.push('conversion_receipt_failed')
    if (!acceptedOfferId) issues.push('accepted_offer_missing')
  } else if (mode === 'manual_override') {
    if (!override.reason) issues.push('override_reason_missing')
    if (override.reason && override.reason.length < 12) issues.push('override_reason_too_short')
    if (!override.actorId) issues.push('override_actor_missing')
    if (!override.actorRole) issues.push('override_actor_role_missing')
    if (override.authorised !== true) issues.push('override_authorisation_not_visible')
  } else {
    issues.push('creation_lineage_missing')
  }

  const confirmed = issues.length === 0
  return {
    version: MVP_TRANSACTION_CREATION_LINEAGE_VERSION,
    mode,
    label: mode === 'accepted_offer'
      ? 'Accepted offer conversion'
      : mode === 'manual_override'
        ? 'Manual transaction override'
        : 'Creation lineage missing',
    acceptedOfferId: acceptedOfferId || null,
    idempotencyKey: idempotencyKey || null,
    transactionId: transactionId || null,
    receiptStatus: text(receipt.status) || null,
    receiptVerified: receipt.ready === true && Boolean(transactionId),
    override: mode === 'manual_override' ? override : null,
    auditVisible: mode === 'accepted_offer'
      ? Boolean(acceptedOfferId && idempotencyKey)
      : mode === 'manual_override'
        ? Boolean(override.reason && override.actorId && override.actorRole && override.authorised === true)
        : false,
    confirmed,
    issues,
  }
}
