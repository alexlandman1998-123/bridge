import assert from 'node:assert/strict'
import {
  createRentalViewingAppointment,
  findRentalViewingOutcomeActivity,
  findScheduledRentalViewingActivity,
  recordRentalViewingOutcome,
} from '../rentalViewingModel.js'

const viewing = createRentalViewingAppointment({ appointmentId: 'a', organisationId: 'o', vacancyId: 'v', leadId: 'l', startsAt: '2026-09-01T10:00:00Z', idempotencyKey: 'k' })
assert.equal(recordRentalViewingOutcome(viewing, 'attended').pipelineAction, 'advance_to_application')
assert.equal(recordRentalViewingOutcome(viewing, 'no_show').pipelineAction, 'retain_stage')
assert.equal(recordRentalViewingOutcome(viewing, 'cancelled').pipelineAction, 'retain_stage')

const scheduled = { id: 'view-1', activity_type: 'rental_viewing_scheduled', metadata: { tenantLeadId: 'lead-1', startsAt: '2026-09-27T10:00:00Z' } }
const attended = { id: 'outcome-1', activity_type: 'rental_viewing_outcome', metadata: { viewingId: 'view-1', outcome: 'attended' } }
assert.equal(findScheduledRentalViewingActivity([scheduled], 'lead-1', '2026-09-27T10:00:00Z'), scheduled)
assert.equal(findScheduledRentalViewingActivity([scheduled], 'another-lead', '2026-09-27T10:00:00Z'), null)
assert.equal(findRentalViewingOutcomeActivity([attended], 'view-1'), attended)
assert.equal(findRentalViewingOutcomeActivity([attended], 'view-2'), null)
console.log('Rental viewing model tests passed.')
