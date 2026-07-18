import assert from 'node:assert/strict'
import {
  buildAppointmentRescheduleProposalContract,
  buildAppointmentRescheduleResolutionContract,
  normalizeAppointmentRescheduleDecision,
} from '../appointmentRescheduleContract.js'

const now = new Date('2026-07-18T10:00:00.000Z')

assert.equal(normalizeAppointmentRescheduleDecision({ decision: 'accepted' }), 'accepted')
assert.equal(normalizeAppointmentRescheduleDecision({ decision: 'decline' }), 'rejected')
assert.equal(normalizeAppointmentRescheduleDecision({ status: 'cancelled' }), 'cancelled')

const proposal = buildAppointmentRescheduleProposalContract({
  preferredStart: '2026-07-21T08:00:00.000Z',
  preferredEnd: '2026-07-21T08:45:00.000Z',
  reason: 'Client confirmed the new slot.',
}, { now })
assert.equal(proposal.isValid, true)

const invalidProposal = buildAppointmentRescheduleProposalContract({
  preferredStart: '2026-07-17T08:00:00.000Z',
}, { now })
assert.equal(invalidProposal.isValid, false)
assert.equal(invalidProposal.errors[0]?.code, 'start_in_past')

const rejected = buildAppointmentRescheduleResolutionContract({ decision: 'rejected' }, { now })
assert.equal(rejected.isValid, true)
assert.equal(rejected.value.decision, 'rejected')

const accepted = buildAppointmentRescheduleResolutionContract({
  decision: 'accepted',
  confirmedStart: '2026-07-21T08:00:00.000Z',
  confirmedEnd: '2026-07-21T08:45:00.000Z',
}, { now })
assert.equal(accepted.isValid, true)

const reversed = buildAppointmentRescheduleResolutionContract({
  decision: 'accepted',
  confirmedStart: '2026-07-21T08:45:00.000Z',
  confirmedEnd: '2026-07-21T08:00:00.000Z',
}, { now })
assert.equal(reversed.isValid, false)
assert.equal(reversed.errors[0]?.code, 'end_before_start')

const overnight = buildAppointmentRescheduleProposalContract({
  preferredStart: '2026-07-21T21:30:00.000Z',
  preferredEnd: '2026-07-21T22:30:00.000Z',
}, { now })
assert.equal(overnight.isValid, false)
assert.equal(overnight.errors[0]?.code, 'different_day')

console.log('appointment reschedule contract tests passed')
