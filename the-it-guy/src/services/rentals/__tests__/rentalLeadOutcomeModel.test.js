import assert from 'node:assert/strict'
import { buildRentalLeadOutcome, getRentalLeadOutcome, isRentalLeadOperational } from '../rentalLeadOutcomeModel.js'

const outcome = buildRentalLeadOutcome({ status: 'nurture', reactivationDate: '2026-10-01', note: 'Reconnect after move.' }, { nowIso: '2026-09-05T10:00:00.000Z' })
assert.equal(outcome.status, 'nurture')
assert.equal(outcome.reactivationDate, '2026-10-01')
assert.throws(() => buildRentalLeadOutcome({ status: 'lost' }), /lost reason/)
assert.equal(getRentalLeadOutcome({ raw: { outcome: { status: 'lost', reason: 'budget' } } }).reason, 'budget')
assert.equal(isRentalLeadOperational({ raw: { outcome: { status: 'lost' } } }), false)
assert.equal(isRentalLeadOperational({ raw: { outcome: { status: 'open' } } }), true)
console.log('rentalLeadOutcomeModel.test.js passed')
