import { expect, it } from 'vitest'
import { getDevelopmentReservationReadiness as check, getReservationStageChoices } from '../developmentReservationReadiness.js'
const unit = { id: 'unit', status: 'Available' }
const lead = { developerLeadId: 'buyer', primaryDevelopmentId: 'development', leadStatus: 'qualified' }
const input = { lead, unit, developmentId: 'development' }
it('requires an actual buyer and available stock rather than treating a preference as a reservation', () => {
  expect(check(input).canReserve).toBe(true)
  expect(check({ ...input, lead: { ...lead, preferredUnitId: unit.id } }).heldByBuyer).toBe(false)
  expect(check({ ...input, lead: null }).canReserve).toBe(false)
  expect(check({ ...input, unit: null }).canReserve).toBe(false)
})
it.each([
  { unit: { ...unit, currentTransactionId: 'transaction' } },
  { unit: { ...unit, status: 'Sold' } },
  { lead: { ...lead, leadStatus: 'lost' } },
  { lead: { ...lead, convertedTransactionId: 'transaction' } },
  { lead: { ...lead, primaryDevelopmentId: 'another-development' } },
  { lead: { ...lead, reservationState: 'reserved', preferredUnitId: 'other-unit' } },
  { lead: { ...lead, reservationState: 'provisional', preferredUnitId: 'other-unit' } },
  { lead: { ...lead, leadStatus: 'otp' } },
  { leads: [{ developerLeadId: 'other-buyer', preferredUnitId: 'unit', reservationState: 'reserved' }] },
])('blocks a reservation when its shared records contain a conflict', patch => {
  expect(check({ ...input, ...patch }).canReserve).toBe(false)
  expect(check({ ...input, ...patch }).blockers.length).toBeGreaterThan(0)
})
it('allows reviewing a later-stage buyer’s existing hold without reserving it again or rewinding their progress', () => {
  const held = { ...lead, preferredUnitId: unit.id, reservationState: 'reserved', leadStatus: 'onboarding_submitted' }
  expect(check({ ...input, lead: held, unit: { ...unit, status: 'Reserved' } })).toEqual({ blockers: [], heldByBuyer: true, canReserve: false })
  expect(getReservationStageChoices(held).find(stage => stage.key === 'qualified').editable).toBe(false)
  expect(getReservationStageChoices(lead).find(stage => stage.key === 'offer').editable).toBe(false)
  expect(getReservationStageChoices(lead).find(stage => stage.key === 'contacted').editable).toBe(true)
})
