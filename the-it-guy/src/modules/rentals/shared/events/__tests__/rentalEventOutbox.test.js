import assert from 'node:assert/strict'
import {
  RENTAL_OUTBOX_STATUS, claimRentalOutboxEvent, commitRentalCommandWithOutbox, createRentalOutboxEvent,
  processRentalOutboxEvent, retryRentalOutboxEvent,
} from '../rentalEventOutbox.js'

const at = new Date('2026-08-29T10:00:00.000Z')
const event = (overrides = {}) => createRentalOutboxEvent({
  organisationId: 'org-rentals', aggregateType: 'vacancy', aggregateId: 'vacancy-1',
  eventType: 'rentals.vacancy.created', idempotencyKey: 'vacancy-1:created:v1', occurredAt: at, ...overrides,
})
const receiptStore = () => {
  const rows = new Map()
  return { get: async (key) => rows.get(key) || null, set: async (key, value) => rows.set(key, value) }
}

{
  const store = receiptStore()
  let effects = 0
  const first = await processRentalOutboxEvent({ event: event(), consumerName: 'listing_projection', receiptStore: store, now: at, consume: async () => { effects += 1; return { listingId: 'listing-1' } } })
  const duplicate = await processRentalOutboxEvent({ event: first.event, consumerName: 'listing_projection', receiptStore: store, now: at, consume: async () => { effects += 1 } })
  assert.equal(first.event.status, RENTAL_OUTBOX_STATUS.completed)
  assert.equal(duplicate.duplicate, true)
  assert.equal(effects, 1, 'duplicate delivery must not repeat the business effect')
}

{
  const failed = await processRentalOutboxEvent({ event: event(), consumerName: 'notification', receiptStore: receiptStore(), now: at, retryDelayMs: 10_000, consume: async () => { throw new Error('provider timeout') } })
  assert.equal(failed.event.status, RENTAL_OUTBOX_STATUS.retryScheduled)
  assert.equal(claimRentalOutboxEvent(failed.event, { now: at }), null, 'retry must wait for its schedule')
  assert.equal(claimRentalOutboxEvent(failed.event, { now: new Date('2026-08-29T10:00:10.000Z') }).status, RENTAL_OUTBOX_STATUS.processing)
}

{
  const dead = retryRentalOutboxEvent({ ...event(), attempts: 3, status: RENTAL_OUTBOX_STATUS.processing }, { error: 'poison payload', now: at, maxAttempts: 3 })
  assert.equal(dead.status, RENTAL_OUTBOX_STATUS.deadLetter)
  assert.match(dead.lastError, /poison payload/)
}

{
  const durable = { domain: [], outbox: [] }
  const transaction = { async run(callback) {
    const staged = { domain: [], outbox: [] }
    const result = await callback({ writeDomain: (row) => staged.domain.push(row), enqueueRentalOutbox: (row) => staged.outbox.push(row) })
    durable.domain.push(...staged.domain); durable.outbox.push(...staged.outbox)
    return result
  } }
  await assert.rejects(() => commitRentalCommandWithOutbox({
    transaction,
    execute: async (tx) => { tx.writeDomain({ id: 'vacancy-rollback' }); throw new Error('domain validation failed') },
    buildEvents: () => [event()],
  }), /domain validation failed/)
  assert.deepEqual(durable, { domain: [], outbox: [] }, 'rolled-back commands must not persist an outbox event')
}

console.log('Rental event outbox tests passed.')
