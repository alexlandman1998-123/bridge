import assert from 'node:assert/strict'
import { getSnagCountdown, groupDevelopmentSnags } from '../developmentSnags.js'

const start = new Date(2026, 9, 1).getTime()
const end = new Date(2026, 11, 30).getTime()
assert.equal(getSnagCountdown({ handoverDate: '2026-10-01', periodDays: 90, now: start }).days, 90)
assert.equal(getSnagCountdown({ handoverDate: '2026-10-01', periodDays: 90, now: end }).state, 'expired')
assert.equal(getSnagCountdown({ handoverDate: '2026-10-01', periodDays: 90, now: end - 3600000 }).hours, 1)
assert.equal(getSnagCountdown({ handoverDate: '2026-10-01', periodDays: 90, now: end - 7 * 86400000 }).state, 'closing')
assert.equal(getSnagCountdown({ handoverDate: '2026-10-01', periodDays: 90, now: end - 8 * 86400000 }).state, 'active')
assert.equal(getSnagCountdown({ handoverDate: '2026-10-01', periodDays: 90, now: start - 1000 }).state, 'scheduled')
assert.equal(getSnagCountdown({ handoverDate: '', periodDays: 90, now: start }).state, 'no-handover')
assert.equal(getSnagCountdown({ handoverDate: '2026-02-30', periodDays: 90, now: start }).state, 'no-handover')
assert.equal(getSnagCountdown({ handoverDate: '2026-10-01', periodDays: '', now: start }).state, 'no-period')
assert.equal(getSnagCountdown({ handoverDate: '2026-10-01', periodDays: 90, deadline: '2026-10-03', now: start }).days, 2)

const first = { id: 'one', unit_id: 'unit', transaction_id: 'purchase-one', buyer_id: 'owner-one', status: 'Open', created_at: '2026-10-01' }
const groups = groupDevelopmentSnags([
  first, first,
  { ...first, id: 'two', status: 'Completed' },
  { ...first, id: 'three', transaction_id: 'purchase-two', buyer_id: 'owner-two', created_at: '2026-10-02' },
  { ...first, id: 'four', unit_id: 'unit-two', transaction_id: null, status: 'Addressed' },
])
assert.equal(groups.length, 3, 'different owners/purchases must not share a snag list')
assert.equal(groups[0].transactionId, 'purchase-two', 'new submissions come first')
const original = groups.find(group => group.transactionId === 'purchase-one')
assert.equal(original.issues.length, 2, 'duplicate submissions are counted once')
assert.equal(original.openCount, 1)
assert.equal(original.resolvedCount, 1)
assert.equal(groups.find(group => group.unitId === 'unit-two').openCount, 1, 'addressed still awaits resolution')
console.log('Development snag grouping and countdown checks passed')
