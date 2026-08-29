export const RENTAL_EVENT_OUTBOX_CONTRACT_VERSION = 'arch9_rentals_event_outbox_v1'

export const RENTAL_OUTBOX_STATUS = Object.freeze({
  pending: 'pending',
  processing: 'processing',
  retryScheduled: 'retry_scheduled',
  completed: 'completed',
  deadLetter: 'dead_letter',
})

const DELIVERABLE_STATUSES = new Set([
  RENTAL_OUTBOX_STATUS.pending,
  RENTAL_OUTBOX_STATUS.retryScheduled,
])

function text(value) {
  return String(value ?? '').trim()
}

function requireText(value, label) {
  const normalized = text(value)
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function toDate(value, label) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`)
  return date
}

function receiptKey(event, consumerName) {
  return `${requireText(consumerName, 'Consumer name')}:${event.idempotencyKey}`
}

/** Creates a durable-event payload; its repository owns persistence. */
export function createRentalOutboxEvent({
  organisationId = '', branchId = '', aggregateType = '', aggregateId = '', eventType = '', idempotencyKey = '',
  payload = {}, metadata = {}, occurredAt = new Date(),
} = {}) {
  const occurred = toDate(occurredAt, 'Event occurrence time')
  const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  return {
    contractVersion: RENTAL_EVENT_OUTBOX_CONTRACT_VERSION,
    organisationId: requireText(organisationId, 'Organisation id'),
    branchId: text(branchId) || null,
    aggregateType: requireText(aggregateType, 'Aggregate type'),
    aggregateId: requireText(aggregateId, 'Aggregate id'),
    eventType: requireText(eventType, 'Event type'),
    idempotencyKey: requireText(idempotencyKey, 'Idempotency key'),
    payload: safePayload, metadata: safeMetadata,
    status: RENTAL_OUTBOX_STATUS.pending, attempts: 0,
    nextAttemptAt: occurred.toISOString(), occurredAt: occurred.toISOString(), lastError: null,
  }
}

export function claimRentalOutboxEvent(event, { now = new Date() } = {}) {
  if (!event || !DELIVERABLE_STATUSES.has(event.status)) return null
  const claimedAt = toDate(now, 'Claim time')
  const nextAttempt = toDate(event.nextAttemptAt || event.occurredAt, 'Next attempt time')
  if (nextAttempt > claimedAt) return null
  return { ...event, status: RENTAL_OUTBOX_STATUS.processing, attempts: Number(event.attempts || 0) + 1, claimedAt: claimedAt.toISOString() }
}

export function completeRentalOutboxEvent(event, { completedAt = new Date() } = {}) {
  return { ...event, status: RENTAL_OUTBOX_STATUS.completed, completedAt: toDate(completedAt, 'Completion time').toISOString(), lastError: null }
}

export function retryRentalOutboxEvent(event, { error = null, now = new Date(), retryDelayMs = 60_000, maxAttempts = 5 } = {}) {
  const current = event || {}
  const attempted = Number(current.attempts || 0)
  const failureAt = toDate(now, 'Failure time')
  const message = text(error?.message || error) || 'Unknown rental outbox consumer failure.'
  if (attempted >= Math.max(1, Number(maxAttempts) || 1)) {
    return { ...current, status: RENTAL_OUTBOX_STATUS.deadLetter, deadLetteredAt: failureAt.toISOString(), lastError: message }
  }
  return {
    ...current,
    status: RENTAL_OUTBOX_STATUS.retryScheduled,
    nextAttemptAt: new Date(failureAt.getTime() + Math.max(0, Number(retryDelayMs) || 0)).toISOString(),
    lastError: message,
  }
}

/** At-least-once delivery with exactly-once consumer business effects. */
export async function processRentalOutboxEvent({
  event, consumerName = '', receiptStore, consume, now = new Date(), retryDelayMs = 60_000, maxAttempts = 5,
} = {}) {
  if (!receiptStore?.get || !receiptStore?.set) throw new Error('A receipt store with get and set methods is required.')
  if (typeof consume !== 'function') throw new Error('A rental event consumer is required.')
  const key = receiptKey(event, consumerName)
  const existingReceipt = await receiptStore.get(key)
  if (existingReceipt) return { event: completeRentalOutboxEvent(event, { completedAt: now }), receipt: existingReceipt, duplicate: true }
  const claimed = claimRentalOutboxEvent(event, { now })
  if (!claimed) return { event, receipt: null, duplicate: false, skipped: true }
  try {
    const result = await consume(claimed)
    const receipt = {
      key, consumerName: requireText(consumerName, 'Consumer name'), idempotencyKey: claimed.idempotencyKey,
      eventType: claimed.eventType, processedAt: toDate(now, 'Processing time').toISOString(), result: result ?? null,
    }
    await receiptStore.set(key, receipt)
    return { event: completeRentalOutboxEvent(claimed, { completedAt: now }), receipt, duplicate: false }
  } catch (error) {
    return { event: retryRentalOutboxEvent(claimed, { error, now, retryDelayMs, maxAttempts }), receipt: null, duplicate: false }
  }
}

/** `execute` and `enqueueRentalOutbox` run on the same transaction object. */
export async function commitRentalCommandWithOutbox({ transaction, execute, buildEvents } = {}) {
  if (typeof transaction?.run !== 'function') throw new Error('A rental transaction adapter is required.')
  if (typeof execute !== 'function') throw new Error('A rental command executor is required.')
  if (typeof buildEvents !== 'function') throw new Error('A rental event builder is required.')
  return transaction.run(async (tx) => {
    if (typeof tx?.enqueueRentalOutbox !== 'function') throw new Error('The rental transaction must provide enqueueRentalOutbox.')
    const result = await execute(tx)
    const events = await buildEvents({ result, tx })
    const rows = Array.isArray(events) ? events : []
    for (const event of rows) await tx.enqueueRentalOutbox(event)
    return { result, events: rows }
  })
}
