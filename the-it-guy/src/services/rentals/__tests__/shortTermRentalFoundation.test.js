import assert from 'node:assert/strict'
import {
  RENTAL_OCCUPANCY_BLOCK_SOURCES,
  RENTAL_OPERATING_MODES,
  SHORT_TERM_BOOKING_STATUSES,
  SHORT_TERM_RENTAL_CONTRACT_VERSION,
  getRentalOperatingModeHomeRoute,
  isShortTermBookingStatus,
  normalizeRentalOperatingMode,
  resolveRentalOperatingModeAvailability,
} from '../shortTermRentalFoundation.js'

assert.equal(SHORT_TERM_RENTAL_CONTRACT_VERSION, 'arch9_short_term_rentals_v1')
assert.deepEqual(SHORT_TERM_BOOKING_STATUSES, ['enquiry', 'provisional', 'confirmed', 'checked_in', 'checked_out', 'cancelled'])
assert.ok(RENTAL_OCCUPANCY_BLOCK_SOURCES.includes('tenancy'))
assert.ok(RENTAL_OCCUPANCY_BLOCK_SOURCES.includes('booking'))
assert.equal(isShortTermBookingStatus('confirmed'), true)
assert.equal(isShortTermBookingStatus('active_tenancy'), false)
assert.equal(normalizeRentalOperatingMode('short-term'), RENTAL_OPERATING_MODES.shortTerm)
assert.equal(getRentalOperatingModeHomeRoute(RENTAL_OPERATING_MODES.longTerm), '/agent/rentals/long-term/dashboard')
assert.equal(getRentalOperatingModeHomeRoute(RENTAL_OPERATING_MODES.shortTerm), '/agent/rentals/short-term/dashboard')

assert.deepEqual(resolveRentalOperatingModeAvailability({ rentalsEnabled: true }), {
  [RENTAL_OPERATING_MODES.longTerm]: true,
  [RENTAL_OPERATING_MODES.shortTerm]: false,
})
assert.deepEqual(resolveRentalOperatingModeAvailability({ rentalsEnabled: true, rentalShortTermEnabled: true }), {
  [RENTAL_OPERATING_MODES.longTerm]: true,
  [RENTAL_OPERATING_MODES.shortTerm]: true,
})

console.log('Short-Term Rentals Phase 0 foundation tests passed.')
