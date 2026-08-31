import assert from 'node:assert/strict'
import { buildShortTermOperationsSnapshot } from '../rentalShortTermOperationsModel.js'

const snapshot = buildShortTermOperationsSnapshot({
  now: new Date('2026-09-01T08:00:00+02:00'),
  bookings: [
    { id: 'a', status: 'confirmed', checkInAt: '2026-09-01T14:00:00+02:00' },
    { id: 'b', status: 'checked_in', checkOutAt: '2026-09-01T10:00:00+02:00' },
    { id: 'c', status: 'checked_in', checkOutAt: '2026-09-02T10:00:00+02:00' },
  ],
  turnovers: [{ status: 'queued' }, { status: 'ready' }],
})
assert.equal(snapshot.arrivalCount, 1)
assert.equal(snapshot.departureCount, 1)
assert.equal(snapshot.inHouseCount, 2)
assert.equal(snapshot.turnoverCount, 1)
assert.equal(snapshot.readyTurnoverCount, 1)
console.log('Short-Term operations model tests passed.')
