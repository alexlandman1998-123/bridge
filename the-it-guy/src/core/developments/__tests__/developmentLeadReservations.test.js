import { expect, it } from 'vitest'
import { isActiveDevelopmentLeadReservation } from '../developmentLeadBoard.js'
const now = Date.parse('2026-11-05T20:00:00Z')
const reserved = { reservationState: 'reserved', preferredUnitId: 'unit-1', leadStatus: 'reserved', reservationExpiresAt: '2026-11-06T20:00:00Z' }

it('includes only confirmed unit reservations, including buyers continuing through onboarding', () => {
  expect(isActiveDevelopmentLeadReservation(reserved, now)).toBe(true)
  expect(isActiveDevelopmentLeadReservation({ ...reserved, leadStatus: 'onboarding_sent' }, now)).toBe(true)
  expect(isActiveDevelopmentLeadReservation({ ...reserved, reservationExpiresAt: null }, now)).toBe(true)
  expect(isActiveDevelopmentLeadReservation({ reservation_state: 'reserved', preferred_unit_id: 'unit-1' }, now)).toBe(true)
})
it.each(['none', 'provisional', 'expired', 'converted', ''])('excludes %s reservations even if the sales stage says reserved', reservationState => {
  expect(isActiveDevelopmentLeadReservation({ ...reserved, reservationState }, now)).toBe(false)
})
it('does not infer a reservation from preference, unit availability, or an expired hold', () => {
  expect(isActiveDevelopmentLeadReservation({ ...reserved, preferredUnitId: '' }, now)).toBe(false)
  expect(isActiveDevelopmentLeadReservation({ ...reserved, reservationExpiresAt: '2026-11-05T20:00:00Z' }, now)).toBe(false)
  expect(isActiveDevelopmentLeadReservation({ ...reserved, reservationExpiresAt: 'invalid' }, now)).toBe(false)
  expect(isActiveDevelopmentLeadReservation({ preferredUnitId: 'unit-1', leadStatus: 'qualified' }, now)).toBe(false)
})
it('excludes lost or converted buyers even when an old reservation flag remains', () => {
  expect(isActiveDevelopmentLeadReservation({ ...reserved, leadStatus: 'lost' }, now)).toBe(false)
  expect(isActiveDevelopmentLeadReservation({ ...reserved, leadStatus: 'converted' }, now)).toBe(false)
  expect(isActiveDevelopmentLeadReservation({ ...reserved, convertedTransactionId: 'transaction' }, now)).toBe(false)
})

it('keeps a buyer who also enquired elsewhere in the development containing their reserved unit', () => {
  expect(isActiveDevelopmentLeadReservation(reserved, now, new Set(['unit-1']))).toBe(true)
  expect(isActiveDevelopmentLeadReservation(reserved, now, new Set(['unit-2']))).toBe(false)
  expect(isActiveDevelopmentLeadReservation(reserved, now, new Set())).toBe(false)
})
