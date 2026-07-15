import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES as R } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_SIGNING_AUTHORITY_BASES as A,
  CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
  CONVEYANCER_SIGNING_CAPACITY_TYPES as C,
  CONVEYANCER_SIGNING_PARTY_TYPES as P,
  buildConveyancerSigningCapacity,
  getConveyancerSigningCapacityDefinition,
} from '../../../core/documents/conveyancerSigningCapacityModel.js'
import {
  CONVEYANCER_SIGNING_PLAN_METHODS as METHOD,
  CONVEYANCER_SIGNING_PLAN_VERSION,
  buildConveyancerSigningPlan,
} from '../../../core/documents/conveyancerSigningPlan.js'
import {
  CONVEYANCER_SIGNING_APPOINTMENT_ATTENDANCE_STATUSES as ATTENDANCE,
  CONVEYANCER_SIGNING_APPOINTMENT_COMMANDS as COMMAND,
  CONVEYANCER_SIGNING_APPOINTMENT_MODES as MODE,
  CONVEYANCER_SIGNING_APPOINTMENT_RSVP_STATUSES as RSVP,
  CONVEYANCER_SIGNING_APPOINTMENT_STATUSES as STATUS,
  buildConveyancerSigningAppointmentCommand,
  buildConveyancerSigningAppointmentReminderPlan,
  detectConveyancerSigningAppointmentConflicts,
  executeConveyancerSigningAppointmentWorkflow,
  startConveyancerSigningAppointmentWorkflow,
  validateConveyancerSigningAppointmentWorkflow,
} from '../conveyancerSigningAppointmentWorkflow.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const PLAN_AS_OF = '2026-07-15T12:00:00.000Z'
const PROPOSED_AT = '2026-07-16T08:00:00.000Z'
const STARTS_AT = '2026-07-20T10:00:00.000Z'
const ENDS_AT = '2026-07-20T11:00:00.000Z'
const secretary = { role: R.secretary, userId: 'secretary-d3' }
const attorney = { role: R.transferAttorney, userId: 'attorney-d3' }
const system = { role: R.system, userId: 'appointment-portal-d3' }

function evidence(requirementKey) {
  return {
    requirementKey,
    referenceId: `evidence:${requirementKey}`,
    evidenceHash: HASH_C,
    status: 'verified',
    issuedAt: '2026-06-01T08:00:00.000Z',
    expiresAt: null,
    verifiedAt: '2026-07-14T09:00:00.000Z',
    verifiedBy: { role: R.transferAttorney, userId: 'capacity-verifier-d3' },
    source: 'matter_record',
  }
}

function capacityRecord({ expiresAt = '2026-12-31T23:59:59.000Z' } = {}) {
  const definition = getConveyancerSigningCapacityDefinition(C.director)
  const result = buildConveyancerSigningCapacity({
    modelVersion: CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
    capacityId: 'capacity:seller-d3:v1',
    recordVersion: 1,
    planId: 'matter-plan-d3',
    planVersion: 2,
    transactionId: 'transaction-d3',
    organisationId: 'organisation-d3',
    lane: 'transfer',
    partyKey: 'seller-party-d3',
    partyRole: 'seller',
    partyType: P.company,
    signatoryKey: 'seller-signatory-d3',
    signatoryReferenceHash: HASH_C,
    capacityType: C.director,
    authorityBasis: A.boardResolution,
    scope: {
      documentKinds: ['declaration'],
      documentKeys: ['transfer_power'],
      powers: ['sign_documents'],
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      effectiveUntil: expiresAt,
    },
    evidence: definition.requiredEvidence.map(evidence),
    capturedAt: '2026-07-14T08:00:00.000Z',
    capturedBy: { role: R.secretary, userId: 'capacity-capturer-d3' },
  }, { asOf: PLAN_AS_OF })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.capacity
}

function readyPlan(capacity) {
  const result = buildConveyancerSigningPlan({
    version: CONVEYANCER_SIGNING_PLAN_VERSION,
    signingPlanId: 'signing-plan-d3',
    revision: 1,
    document: {
      documentId: 'document-d3',
      planId: 'matter-plan-d3',
      planVersion: 2,
      transactionId: 'transaction-d3',
      organisationId: 'organisation-d3',
      actionKey: 'prepare_transfer_documents',
      documentKey: 'transfer_power',
      documentKind: 'declaration',
      lane: 'transfer',
      contentFingerprint: HASH_A,
      provenanceFingerprint: HASH_B,
      renderModel: { signingFields: [{ fieldKey: 'seller_signature', fieldType: 'signature', signerRole: 'seller', required: true, order: 1 }] },
    },
    routingMode: 'parallel',
    participants: [{
      participantKey: 'participant:seller-d3',
      signerKey: capacity.signatoryKey,
      documentSignerRole: 'seller',
      partyKey: capacity.partyKey,
      partyRole: capacity.partyRole,
      signerReferenceHash: capacity.signatoryReferenceHash,
      capacityId: capacity.capacityId,
      signingOrder: 1,
      required: true,
      allowedMethods: [METHOD.electronic, METHOD.wetInk],
    }],
    preparedAt: '2026-07-15T10:00:00.000Z',
    preparedBy: secretary,
    approval: { approvedAt: '2026-07-15T11:00:00.000Z', approvedBy: attorney, decisionReferenceId: 'approval:d3' },
  }, { capacityRecords: [capacity], asOf: PLAN_AS_OF })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.plan
}

function proposal(overrides = {}) {
  const capacity = overrides.capacity || capacityRecord()
  const plan = overrides.plan || readyPlan(capacity)
  const result = startConveyancerSigningAppointmentWorkflow({
    signingPlan: plan,
    capacityRecords: [capacity],
    appointmentId: 'appointment-d3',
    mode: MODE.inPerson,
    slot: { startsAt: STARTS_AT, endsAt: ENDS_AT, timeZone: 'Africa/Johannesburg' },
    venue: { type: 'attorney_office', referenceId: 'venue:office-1', resourceId: 'boardroom-1' },
    actor: secretary,
    occurredAt: PROPOSED_AT,
    commandId: 'propose:d3',
    ...overrides,
  })
  return { capacity, plan, result }
}

function execute(appointment, type, performedBy, payload = {}, occurredAt = '2026-07-17T08:00:00.000Z', context = {}) {
  return executeConveyancerSigningAppointmentWorkflow({
    appointment,
    command: buildConveyancerSigningAppointmentCommand(appointment, type, payload),
    actor: performedBy,
    occurredAt,
    ...context,
  })
}

function acceptedAppointment() {
  const { capacity, result } = proposal()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  const accepted = execute(result.appointment, COMMAND.recordResponse, system, {
    signerKey: 'seller-signatory-d3',
    response: RSVP.accepted,
    responseReferenceId: 'rsvp-evidence-d3',
  })
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors))
  return { capacity, proposed: result, accepted }
}

function confirmedAppointment() {
  const context = acceptedAppointment()
  const confirmed = execute(context.accepted.appointment, COMMAND.confirm, secretary, {}, '2026-07-18T08:00:00.000Z', { capacityRecords: [context.capacity] })
  assert.equal(confirmed.ok, true, JSON.stringify(confirmed.errors))
  return { ...context, confirmed }
}

test('proposes a transfer signing appointment bound to a ready D2 plan', () => {
  const { result } = proposal()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.appointment.status, STATUS.awaitingConfirmation)
  assert.equal(result.appointment.appointmentType, 'transfer_signing')
  assert.equal(result.appointment.attendees[0].selectedMethod, METHOD.wetInk)
  assert.equal(result.appointment.signingPlan.signingPlanId, 'signing-plan-d3')
  assert.equal(Object.isFrozen(result.appointment), true)
})

test('rejects an appointment when D2 is not legally ready', () => {
  const capacity = capacityRecord()
  const plan = readyPlan(capacity)
  const unapproved = structuredClone(plan)
  unapproved.approval = { approvedAt: null, approvedBy: { role: '', userId: null }, decisionReferenceId: null }
  delete unapproved.fingerprint
  delete unapproved.assessment
  const { result } = proposal({ capacity, plan: unapproved })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'd2_signing_plan_not_ready')
})

test('rejects remote supervised wet-ink signing', () => {
  const { result } = proposal({
    mode: MODE.remoteSupervised,
    venue: { type: 'remote', meetingReferenceHash: HASH_A },
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('wet_ink_not_permitted_for_remote_session:seller_signatory_d3'))
})

test('supports remote supervised electronic signing', () => {
  const { result } = proposal({
    mode: MODE.remoteSupervised,
    selectedMethods: { seller_signatory_d3: METHOD.electronic },
    venue: { type: 'remote', meetingReferenceHash: HASH_A },
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.appointment.attendees[0].selectedMethod, METHOD.electronic)
})

test('checks that D1 authority remains valid on the appointment date', () => {
  const capacity = capacityRecord({ expiresAt: '2026-07-18T00:00:00.000Z' })
  const { result } = proposal({ capacity, plan: readyPlan(capacity) })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('capacity_not_valid_at_appointment:seller_signatory_d3'))
})

test('detects attendee and boardroom conflicts', () => {
  const { result } = proposal()
  assert.equal(result.ok, true)
  const conflicts = detectConveyancerSigningAppointmentConflicts({
    candidate: result.appointment,
    existingAppointments: [{
      appointmentId: 'existing-d3',
      status: 'confirmed',
      schedule: { startsAt: '2026-07-20T10:30:00.000Z', endsAt: '2026-07-20T11:30:00.000Z' },
      venue: { resourceId: 'boardroom-1' },
      attendees: [{ signerKey: 'seller-signatory-d3' }],
    }],
  })
  assert.equal(conflicts.hasConflict, true)
  assert.ok(conflicts.conflicts.includes('resource_conflict:existing-d3'))
  assert.ok(conflicts.conflicts.includes('attendee_conflict:seller_signatory_d3:existing-d3'))
})

test('rejects proposals from unauthorised actors and invalid venues', () => {
  let result = proposal({ actor: { role: R.client, userId: 'client-d3' } }).result
  assert.equal(result.code, 'signing_appointment_proposal_not_authorised')
  result = proposal({ venue: {} }).result
  assert.ok(result.errors.includes('physical_venue_reference_required'))
})

test('records RSVP evidence and confirms only when required attendees accept', () => {
  const { result } = proposal()
  const premature = execute(result.appointment, COMMAND.confirm, secretary)
  assert.equal(premature.code, 'signing_appointment_not_ready_for_confirmation')
  const accepted = execute(result.appointment, COMMAND.recordResponse, system, { signerKey: 'seller-signatory-d3', response: RSVP.accepted, responseReferenceId: 'rsvp-1' })
  assert.equal(accepted.appointment.readiness.status, 'ready')
  const confirmed = execute(accepted.appointment, COMMAND.confirm, secretary, {}, '2026-07-18T08:00:00.000Z', { capacityRecords: [capacityRecord()] })
  assert.equal(confirmed.appointment.status, STATUS.confirmed)
})

test('rechecks current capacity evidence immediately before confirmation', () => {
  const { capacity, accepted } = acceptedAppointment()
  const revoked = structuredClone(capacity)
  revoked.evidence[0].status = 'conflict'
  delete revoked.assessment
  delete revoked.fingerprint
  const confirmed = execute(accepted.appointment, COMMAND.confirm, secretary, {}, '2026-07-18T08:00:00.000Z', { capacityRecords: [revoked] })
  assert.equal(confirmed.ok, false)
  assert.match(confirmed.code, /signing_appointment_capacity_recheck_failed/)
})

test('moves a decline or reschedule request into coordinated rescheduling', () => {
  const { result } = proposal()
  const declined = execute(result.appointment, COMMAND.recordResponse, system, { signerKey: 'seller-signatory-d3', response: RSVP.declined, responseReferenceId: 'decline-1' })
  assert.equal(declined.appointment.status, STATUS.rescheduleRequested)

  const requested = execute(result.appointment, COMMAND.requestReschedule, system, { signerKey: 'seller-signatory-d3', reasonCode: 'unavailable', requestReferenceId: 'request-1' })
  assert.equal(requested.appointment.status, STATUS.rescheduleRequested)
  assert.equal(requested.appointment.rescheduleRequest.reasonCode, 'unavailable')
})

test('reschedules safely, revalidates capacity, and resets RSVP state', () => {
  const { capacity, accepted } = acceptedAppointment()
  const rescheduled = execute(accepted.appointment, COMMAND.reschedule, secretary, {
    slot: { startsAt: '2026-07-22T09:00:00.000Z', endsAt: '2026-07-22T10:00:00.000Z', timeZone: 'Africa/Johannesburg' },
  }, '2026-07-18T08:00:00.000Z', { capacityRecords: [capacity] })
  assert.equal(rescheduled.ok, true, JSON.stringify(rescheduled.errors))
  assert.equal(rescheduled.appointment.status, STATUS.awaitingConfirmation)
  assert.equal(rescheduled.appointment.attendees[0].rsvpStatus, RSVP.pending)
  assert.equal(rescheduled.appointment.bindingFingerprint === accepted.appointment.bindingFingerprint, false)
})

test('blocks rescheduling beyond the signer authority period', () => {
  const capacity = capacityRecord({ expiresAt: '2026-07-21T00:00:00.000Z' })
  const { result } = proposal({ capacity, plan: readyPlan(capacity) })
  assert.equal(result.ok, true)
  const rescheduled = execute(result.appointment, COMMAND.reschedule, secretary, {
    slot: { startsAt: '2026-07-22T09:00:00.000Z', endsAt: '2026-07-22T10:00:00.000Z', timeZone: 'Africa/Johannesburg' },
  }, '2026-07-18T08:00:00.000Z', { capacityRecords: [capacity] })
  assert.equal(rescheduled.ok, false)
  assert.match(rescheduled.code, /capacity_not_valid_at_appointment/)
})

test('enforces optimistic concurrency and idempotent command evidence', () => {
  const { result } = proposal()
  const command = buildConveyancerSigningAppointmentCommand(result.appointment, COMMAND.recordResponse, { signerKey: 'seller-signatory-d3', response: RSVP.accepted, responseReferenceId: 'rsvp-1' })
  const recorded = executeConveyancerSigningAppointmentWorkflow({ appointment: result.appointment, command, actor: system, occurredAt: '2026-07-17T08:00:00.000Z' })
  const stale = { ...buildConveyancerSigningAppointmentCommand(recorded.appointment, COMMAND.confirm), expectedRuntimeRevision: 1 }
  assert.equal(executeConveyancerSigningAppointmentWorkflow({ appointment: recorded.appointment, command: stale, actor: secretary, occurredAt: '2026-07-18T08:00:00.000Z' }).code, 'stale_signing_appointment_revision')
  const replay = executeConveyancerSigningAppointmentWorkflow({ appointment: result.appointment, command, actor: system, occurredAt: '2026-07-17T08:00:00.000Z', existingEvents: [recorded.event] })
  assert.equal(replay.duplicate, true)
})

test('supports exact idempotent proposal replay and rejects changed proposal payloads', () => {
  const { capacity, plan, result } = proposal()
  const replay = proposal({ capacity, plan, existingAppointments: [{ appointment: result.appointment, event: result.event }] }).result
  assert.equal(replay.duplicate, true)
  const conflict = proposal({
    capacity,
    plan,
    slot: { startsAt: '2026-07-21T10:00:00.000Z', endsAt: '2026-07-21T11:00:00.000Z', timeZone: 'Africa/Johannesburg' },
    existingAppointments: [{ appointment: result.appointment, event: result.event }],
  }).result
  assert.equal(conflict.code, 'signing_appointment_proposal_command_id_conflict')
})

test('records attendance only after a confirmed session starts', () => {
  const { confirmed } = confirmedAppointment()
  const early = execute(confirmed.appointment, COMMAND.recordAttendance, secretary, { signerKey: 'seller-signatory-d3', attendanceStatus: ATTENDANCE.attended, attendanceReferenceId: 'attendance-1' }, '2026-07-20T09:00:00.000Z')
  assert.equal(early.code, 'appointment_attendance_window_not_open')
  const attended = execute(confirmed.appointment, COMMAND.recordAttendance, secretary, { signerKey: 'seller-signatory-d3', attendanceStatus: ATTENDANCE.attended, attendanceReferenceId: 'attendance-1' }, '2026-07-20T10:05:00.000Z')
  assert.equal(attended.ok, true)
  assert.equal(attended.appointment.attendees[0].attendanceStatus, ATTENDANCE.attended)
})

test('requires a lane-authorised legal user to complete the appointment', () => {
  const { confirmed } = confirmedAppointment()
  const attended = execute(confirmed.appointment, COMMAND.recordAttendance, secretary, { signerKey: 'seller-signatory-d3', attendanceStatus: ATTENDANCE.attended, attendanceReferenceId: 'attendance-1' }, '2026-07-20T10:05:00.000Z')
  const denied = execute(attended.appointment, COMMAND.complete, secretary, { outcomeReferenceId: 'outcome-1' }, '2026-07-20T11:05:00.000Z')
  assert.equal(denied.code, 'signing_appointment_completion_not_authorised')
  const completed = execute(attended.appointment, COMMAND.complete, attorney, { outcomeReferenceId: 'outcome-1' }, '2026-07-20T11:05:00.000Z')
  assert.equal(completed.appointment.status, STATUS.completed)
  assert.equal(completed.appointment.outcome.signatureEvidenceRecorded, false)
})

test('records required signer no-show as an explicit terminal outcome', () => {
  const { confirmed } = confirmedAppointment()
  const absent = execute(confirmed.appointment, COMMAND.recordAttendance, secretary, { signerKey: 'seller-signatory-d3', attendanceStatus: ATTENDANCE.noShow, attendanceReferenceId: 'no-show-1' }, '2026-07-20T10:05:00.000Z')
  const completed = execute(absent.appointment, COMMAND.complete, attorney, { outcomeReferenceId: 'outcome-no-show' }, '2026-07-20T11:05:00.000Z')
  assert.equal(completed.appointment.status, STATUS.noShow)
  assert.equal(completed.appointment.outcome.type, 'required_signer_no_show')
})

test('cancels with reason evidence and prevents further commands', () => {
  const { result } = proposal()
  const cancelled = execute(result.appointment, COMMAND.cancel, secretary, { reasonCode: 'document_changed', decisionReferenceId: 'cancel-1' })
  assert.equal(cancelled.appointment.status, STATUS.cancelled)
  assert.equal(execute(cancelled.appointment, COMMAND.recordResponse, system, { signerKey: 'seller-signatory-d3', response: RSVP.accepted, responseReferenceId: 'late' }).code, 'signing_appointment_terminal')
})

test('builds reminder instructions without sending notifications', () => {
  const { result } = proposal()
  const reminders = buildConveyancerSigningAppointmentReminderPlan(result.appointment)
  assert.equal(reminders.ok, true)
  assert.equal(reminders.reminders.length, 3)
  assert.equal(reminders.notificationsSent, false)
  assert.equal(reminders.persistencePerformed, false)
})

test('requires witness and commissioner attendance when configured', () => {
  const { result } = proposal({ requirements: { witnessRequired: true, commissionerRequired: true } })
  assert.equal(result.ok, true)
  assert.equal(result.appointment.readiness.status, 'blocked')
  assert.ok(result.appointment.readiness.blockers.includes('required_witness_missing'))
  assert.ok(result.appointment.readiness.blockers.includes('required_commissioner_missing'))
})

test('detects tampering and keeps audit evidence redacted and side-effect free', () => {
  const { result } = proposal()
  const forged = structuredClone(result.appointment)
  forged.schedule.startsAt = '2026-07-21T10:00:00.000Z'
  assert.ok(validateConveyancerSigningAppointmentWorkflow(forged).errors.includes('signing_appointment_binding_fingerprint_invalid'))
  const accepted = execute(result.appointment, COMMAND.recordResponse, system, { signerKey: 'seller-signatory-d3', response: RSVP.accepted, responseReferenceId: 'rsvp-private-reference' })
  const event = JSON.stringify(accepted.event)
  assert.equal(event.includes('rsvp-private-reference'), false)
  assert.equal(accepted.event.calendarEventCreated, false)
  assert.equal(accepted.event.notificationsSent, false)
  assert.equal(accepted.event.signatureEvidenceRecorded, false)
})

console.log('D3 signing-appointment workflow tests passed.')
