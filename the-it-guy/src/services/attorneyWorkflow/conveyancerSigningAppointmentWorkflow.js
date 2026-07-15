import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  evaluateConveyancerSigningCapacityApplicability,
  isConveyancerSigningCapacityLaneAuthorised,
} from '../../core/documents/conveyancerSigningCapacityModel.js'
import {
  CONVEYANCER_SIGNING_PLAN_STATUSES,
  CONVEYANCER_SIGNING_PLAN_METHODS,
  validateConveyancerSigningPlan,
} from '../../core/documents/conveyancerSigningPlan.js'

export const CONVEYANCER_SIGNING_APPOINTMENT_WORKFLOW_VERSION = 'conveyancer_signing_appointment_workflow_v1'

export const CONVEYANCER_SIGNING_APPOINTMENT_STATUSES = Object.freeze({
  awaitingConfirmation: 'awaiting_confirmation',
  confirmed: 'confirmed',
  rescheduleRequested: 'reschedule_requested',
  completed: 'completed',
  noShow: 'no_show',
  cancelled: 'cancelled',
})

export const CONVEYANCER_SIGNING_APPOINTMENT_MODES = Object.freeze({
  inPerson: 'in_person',
  remoteSupervised: 'remote_supervised',
  hybrid: 'hybrid',
})

export const CONVEYANCER_SIGNING_APPOINTMENT_VENUE_TYPES = Object.freeze({
  attorneyOffice: 'attorney_office',
  clientLocation: 'client_location',
  remote: 'remote',
  hybrid: 'hybrid',
})

export const CONVEYANCER_SIGNING_APPOINTMENT_RSVP_STATUSES = Object.freeze({
  pending: 'pending',
  accepted: 'accepted',
  tentative: 'tentative',
  declined: 'declined',
})

export const CONVEYANCER_SIGNING_APPOINTMENT_ATTENDANCE_STATUSES = Object.freeze({
  attended: 'attended',
  late: 'late',
  noShow: 'no_show',
  excused: 'excused',
})

export const CONVEYANCER_SIGNING_APPOINTMENT_COMMANDS = Object.freeze({
  recordResponse: 'record_response',
  requestReschedule: 'request_reschedule',
  reschedule: 'reschedule',
  confirm: 'confirm',
  recordAttendance: 'record_attendance',
  complete: 'complete',
  cancel: 'cancel',
})

export const CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES = Object.freeze({
  propose: 'propose',
  recordResponse: 'record_response',
  reschedule: 'reschedule',
  confirm: 'confirm',
  recordAttendance: 'record_attendance',
  complete: 'complete',
  cancel: 'cancel',
})

const STATUS = CONVEYANCER_SIGNING_APPOINTMENT_STATUSES
const MODE = CONVEYANCER_SIGNING_APPOINTMENT_MODES
const VENUE = CONVEYANCER_SIGNING_APPOINTMENT_VENUE_TYPES
const RSVP = CONVEYANCER_SIGNING_APPOINTMENT_RSVP_STATUSES
const ATTENDANCE = CONVEYANCER_SIGNING_APPOINTMENT_ATTENDANCE_STATUSES
const COMMAND = CONVEYANCER_SIGNING_APPOINTMENT_COMMANDS
const CAP = CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES
const MODES = new Set(Object.values(MODE))
const VENUES = new Set(Object.values(VENUE))
const RSVPS = new Set(Object.values(RSVP))
const ATTENDANCES = new Set(Object.values(ATTENDANCE))
const COMMAND_VALUES = new Set(Object.values(COMMAND))
const ACTIVE_STATUSES = new Set([STATUS.awaitingConfirmation, STATUS.confirmed, STATUS.rescheduleRequested])
const ACTIVE_CONFLICT_STATUSES = new Set([...ACTIVE_STATUSES, 'draft', 'pending', 'pending_confirmation', 'proposed'])
const TERMINAL_STATUSES = new Set([STATUS.completed, STATUS.noShow, STATUS.cancelled])

export const CONVEYANCER_SIGNING_APPOINTMENT_ROLE_CAPABILITIES = Object.freeze({
  [R.secretary]: Object.freeze([CAP.propose, CAP.recordResponse, CAP.reschedule, CAP.confirm, CAP.recordAttendance, CAP.cancel]),
  [R.conveyancer]: Object.freeze(Object.values(CAP)),
  [R.transferAttorney]: Object.freeze(Object.values(CAP)),
  [R.bondAttorney]: Object.freeze(Object.values(CAP)),
  [R.cancellationAttorney]: Object.freeze(Object.values(CAP)),
  [R.firmManager]: Object.freeze(Object.values(CAP)),
  [R.system]: Object.freeze([CAP.recordResponse]),
  [R.accounts]: Object.freeze([]),
  [R.client]: Object.freeze([]),
  [R.externalParty]: Object.freeze([]),
})

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function clone(value) { return typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value)) }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {})
  return value
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fnv(value) {
  const source = JSON.stringify(stable(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null } }
function fail(code, errors = []) { return deepFreeze({ ok: false, duplicate: false, code, errors: unique(errors), appointment: null, event: null }) }
function timeZoneValid(value) { try { new Intl.DateTimeFormat('en-ZA', { timeZone: value }).format(new Date()); return true } catch { return false } }

export function getConveyancerSigningAppointmentCapabilities(role) {
  return CONVEYANCER_SIGNING_APPOINTMENT_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerSigningAppointmentActor(role, capability) {
  return getConveyancerSigningAppointmentCapabilities(role).includes(key(capability))
}

function authorised(input, capability, lane, includeSecretary = true) {
  const value = actor(input)
  return Boolean(value.userId && canConveyancerSigningAppointmentActor(value.role, capability) && isConveyancerSigningCapacityLaneAuthorised(value.role, lane, { includeSecretary }))
}

function legalAuthorised(input, capability, lane) {
  return authorised(input, capability, lane, false)
}

function appointmentTypeForLane(lane) {
  if (lane === 'bond') return 'bond_signing'
  if (lane === 'cancellation') return 'cancellation_signing'
  return 'transfer_signing'
}

function schedule(input = {}) {
  return {
    startsAt: iso(input.startsAt || input.starts_at),
    endsAt: iso(input.endsAt || input.ends_at),
    timeZone: text(input.timeZone || input.time_zone) || 'Africa/Johannesburg',
  }
}

function normalizeVenue(input = {}, mode) {
  return {
    type: key(input.type) || (mode === MODE.remoteSupervised ? VENUE.remote : mode === MODE.hybrid ? VENUE.hybrid : VENUE.attorneyOffice),
    referenceId: text(input.referenceId || input.reference_id) || null,
    meetingReferenceHash: text(input.meetingReferenceHash || input.meeting_reference_hash).toLowerCase() || null,
    resourceId: text(input.resourceId || input.resource_id) || null,
  }
}

function scheduleErrors(slot, occurredAt) {
  const errors = []
  if (!slot.startsAt || !slot.endsAt || new Date(slot.endsAt) <= new Date(slot.startsAt)) errors.push('valid_appointment_window_required')
  if (slot.startsAt && slot.endsAt) {
    const duration = (new Date(slot.endsAt) - new Date(slot.startsAt)) / 60000
    if (duration < 15 || duration > 480) errors.push('appointment_duration_out_of_range')
  }
  if (slot.startsAt && occurredAt && new Date(slot.startsAt) <= new Date(occurredAt)) errors.push('appointment_must_be_scheduled_in_future')
  if (!timeZoneValid(slot.timeZone)) errors.push('appointment_time_zone_invalid')
  return errors
}

function venueErrors(venue, mode) {
  const errors = []
  if (!VENUES.has(venue.type)) errors.push('appointment_venue_type_invalid')
  if ([MODE.inPerson, MODE.hybrid].includes(mode) && !venue.referenceId) errors.push('physical_venue_reference_required')
  if ([MODE.remoteSupervised, MODE.hybrid].includes(mode) && !sha(venue.meetingReferenceHash)) errors.push('remote_meeting_reference_hash_required')
  if (mode === MODE.remoteSupervised && venue.type !== VENUE.remote) errors.push('remote_mode_requires_remote_venue')
  if (mode === MODE.hybrid && venue.type !== VENUE.hybrid) errors.push('hybrid_mode_requires_hybrid_venue')
  return errors
}

function stripCapacityAssessment(capacity = {}) {
  const result = clone(capacity)
  delete result.assessment
  return result
}

function capacityErrorsAt(appointment, capacityRecords, at) {
  const errors = []
  const capacities = new Map((Array.isArray(capacityRecords) ? capacityRecords : []).map((item) => [text(item.capacityId || item.capacity_id), item]))
  for (const attendee of appointment.attendees || []) {
    const capacity = capacities.get(attendee.capacityId)
    if (!capacity) errors.push(`capacity_record_missing:${attendee.signerKey}`)
    else {
      const applicability = evaluateConveyancerSigningCapacityApplicability({ capacity: stripCapacityAssessment(capacity), document: appointment.signingPlan, asOf: at, expectedPartyRole: attendee.partyRole })
      if (!applicability.usable) errors.push(`capacity_not_valid_at_appointment:${attendee.signerKey}`)
    }
  }
  return errors
}

function planBinding(plan) {
  return {
    signingPlanId: plan.signingPlanId,
    signingPlanRevision: plan.revision,
    signingPlanFingerprint: plan.fingerprint,
    documentId: plan.document.documentId,
    planId: plan.document.planId,
    planVersion: plan.document.planVersion,
    transactionId: plan.document.transactionId,
    organisationId: plan.document.organisationId,
    documentKey: plan.document.documentKey,
    documentKind: plan.document.documentKind,
    lane: plan.document.lane,
    contentFingerprint: plan.document.contentFingerprint,
    provenanceFingerprint: plan.document.provenanceFingerprint,
  }
}

function attendeeFromParticipant(participant, selectedMethod) {
  return {
    signerKey: participant.signerKey,
    signerRole: participant.documentSignerRole,
    partyRole: participant.partyRole,
    signerReferenceHash: participant.signerReferenceHash,
    capacityId: participant.capacityId,
    signingOrder: participant.signingOrder,
    required: participant.required,
    selectedMethod,
    rsvpStatus: RSVP.pending,
    respondedAt: null,
    responseReferenceId: null,
    attendanceStatus: null,
    attendanceRecordedAt: null,
    attendanceReferenceId: null,
  }
}

function appointmentBindingSnapshot(appointment = {}) {
  return stable({
    version: appointment.version,
    appointmentId: appointment.appointmentId,
    signingPlan: appointment.signingPlan,
    appointmentType: appointment.appointmentType,
    mode: appointment.mode,
    signingOrderGroup: appointment.signingOrderGroup,
    schedule: appointment.schedule,
    venue: appointment.venue,
    host: appointment.host,
    attendees: (appointment.attendees || []).map((item) => ({
      signerKey: item.signerKey,
      signerRole: item.signerRole,
      partyRole: item.partyRole,
      signerReferenceHash: item.signerReferenceHash,
      capacityId: item.capacityId,
      signingOrder: item.signingOrder,
      required: item.required,
      selectedMethod: item.selectedMethod,
    })),
    requirements: appointment.requirements,
  })
}

export function buildConveyancerSigningAppointmentBindingFingerprint(appointment = {}) {
  return fnv(appointmentBindingSnapshot(appointment))
}

function runtimeSnapshot(appointment = {}) {
  const { fingerprint: _fingerprint, ...snapshot } = appointment
  return stable(snapshot)
}

export function buildConveyancerSigningAppointmentFingerprint(appointment = {}) {
  return fnv(runtimeSnapshot(appointment))
}

function readiness(appointment) {
  const blockers = []
  const pending = []
  const required = appointment.attendees.filter((item) => item.required)
  required.filter((item) => item.rsvpStatus === RSVP.pending || item.rsvpStatus === RSVP.tentative).forEach((item) => pending.push(`rsvp_pending:${item.signerKey}`))
  required.filter((item) => item.rsvpStatus === RSVP.declined).forEach((item) => blockers.push(`rsvp_declined:${item.signerKey}`))
  if (appointment.requirements.witnessRequired && !appointment.attendees.some((item) => item.signerRole === 'witness')) blockers.push('required_witness_missing')
  if (appointment.requirements.commissionerRequired && !appointment.attendees.some((item) => item.signerRole === 'commissioner')) blockers.push('required_commissioner_missing')
  const status = blockers.length ? 'blocked' : pending.length ? 'awaiting_responses' : 'ready'
  return { status, pending: unique(pending), blockers: unique(blockers), assessedAt: appointment.updatedAt }
}

function setFingerprints(appointment) {
  appointment.bindingFingerprint = buildConveyancerSigningAppointmentBindingFingerprint(appointment)
  appointment.readiness = readiness(appointment)
  appointment.fingerprint = buildConveyancerSigningAppointmentFingerprint(appointment)
  return appointment
}

export function detectConveyancerSigningAppointmentConflicts({ candidate = {}, existingAppointments = [], ignoreAppointmentId = '' } = {}) {
  const slot = schedule(candidate.schedule || candidate)
  if (!slot.startsAt || !slot.endsAt) return deepFreeze({ hasConflict: false, conflicts: [] })
  const candidateVenue = candidate.venue || {}
  const candidateSigners = new Set((candidate.attendees || []).map((item) => key(item.signerKey || item.signer_key)).filter(Boolean))
  const conflicts = []
  for (const existing of Array.isArray(existingAppointments) ? existingAppointments : []) {
    const existingId = text(existing.appointmentId || existing.appointment_id)
    if (!existingId || existingId === text(ignoreAppointmentId) || !ACTIVE_CONFLICT_STATUSES.has(key(existing.status))) continue
    const existingSlot = schedule(existing.schedule || existing)
    if (!existingSlot.startsAt || !existingSlot.endsAt || new Date(slot.startsAt) >= new Date(existingSlot.endsAt) || new Date(slot.endsAt) <= new Date(existingSlot.startsAt)) continue
    const existingVenue = existing.venue || {}
    if (candidateVenue.resourceId && candidateVenue.resourceId === text(existingVenue.resourceId || existingVenue.resource_id)) conflicts.push(`resource_conflict:${existingId}`)
    const existingSigners = new Set((existing.attendees || []).map((item) => key(item.signerKey || item.signer_key)).filter(Boolean))
    for (const signerKey of candidateSigners) if (existingSigners.has(signerKey)) conflicts.push(`attendee_conflict:${signerKey}:${existingId}`)
  }
  return deepFreeze({ hasConflict: conflicts.length > 0, conflicts: unique(conflicts) })
}

function validateAppointment(appointment = {}) {
  const errors = []
  if (appointment.version !== CONVEYANCER_SIGNING_APPOINTMENT_WORKFLOW_VERSION) errors.push('signing_appointment_version_invalid')
  if (!appointment.appointmentId || !appointment.proposalCommandId) errors.push('signing_appointment_identity_required')
  if (!appointment.signingPlan?.signingPlanId || !appointment.signingPlan?.signingPlanFingerprint || !appointment.signingPlan?.documentId || !appointment.signingPlan?.lane) errors.push('signing_plan_binding_required')
  if (!MODES.has(appointment.mode)) errors.push('signing_appointment_mode_invalid')
  errors.push(...scheduleErrors(appointment.schedule, null), ...venueErrors(appointment.venue || {}, appointment.mode))
  if (!authorised(appointment.host, CAP.propose, appointment.signingPlan?.lane)) errors.push('signing_appointment_host_invalid')
  if (!Array.isArray(appointment.attendees) || !appointment.attendees.length) errors.push('signing_appointment_attendees_required')
  const signerKeys = (appointment.attendees || []).map((item) => item.signerKey)
  if (new Set(signerKeys).size !== signerKeys.length) errors.push('duplicate_signing_appointment_attendee')
  for (const item of appointment.attendees || []) {
    if (!item.signerKey || !item.signerRole || !item.partyRole || !sha(item.signerReferenceHash) || !item.capacityId || !Number.isInteger(item.signingOrder) || item.signingOrder < 1) errors.push(`signing_appointment_attendee_invalid:${item.signerKey || 'unknown'}`)
    if (!Object.values(CONVEYANCER_SIGNING_PLAN_METHODS).includes(item.selectedMethod)) errors.push(`appointment_signing_method_invalid:${item.signerKey}`)
    if (appointment.mode === MODE.remoteSupervised && item.selectedMethod === CONVEYANCER_SIGNING_PLAN_METHODS.wetInk) errors.push(`wet_ink_not_permitted_for_remote_session:${item.signerKey}`)
    if (!RSVPS.has(item.rsvpStatus)) errors.push(`appointment_rsvp_status_invalid:${item.signerKey}`)
    if (item.rsvpStatus !== RSVP.pending && (!item.respondedAt || !item.responseReferenceId)) errors.push(`appointment_rsvp_evidence_missing:${item.signerKey}`)
    if (item.attendanceStatus && (!ATTENDANCES.has(item.attendanceStatus) || !item.attendanceRecordedAt || !item.attendanceReferenceId)) errors.push(`appointment_attendance_evidence_missing:${item.signerKey}`)
  }
  if (!ACTIVE_STATUSES.has(appointment.status) && !TERMINAL_STATUSES.has(appointment.status)) errors.push('signing_appointment_status_invalid')
  if (appointment.status === STATUS.confirmed && appointment.readiness?.status !== 'ready') errors.push('confirmed_appointment_not_ready')
  if ([STATUS.completed, STATUS.noShow].includes(appointment.status) && (!appointment.outcome?.outcomeReferenceId || !appointment.outcome?.recordedAt || !legalAuthorised(appointment.outcome?.recordedBy, CAP.complete, appointment.signingPlan?.lane))) errors.push('signing_appointment_outcome_invalid')
  if (!Number.isInteger(appointment.runtimeRevision) || appointment.runtimeRevision < 1 || !appointment.createdAt || !appointment.updatedAt || !appointment.lastEventId) errors.push('signing_appointment_runtime_evidence_invalid')
  if (appointment.bindingFingerprint !== buildConveyancerSigningAppointmentBindingFingerprint(appointment)) errors.push('signing_appointment_binding_fingerprint_invalid')
  if (JSON.stringify(stable(appointment.readiness)) !== JSON.stringify(stable(readiness(appointment)))) errors.push('signing_appointment_readiness_stale')
  if (appointment.fingerprint !== buildConveyancerSigningAppointmentFingerprint(appointment)) errors.push('signing_appointment_fingerprint_invalid')
  if (appointment.calendarEventCreated || appointment.notificationsSent || appointment.persistencePerformed || appointment.signatureEvidenceRecorded) errors.push('signing_appointment_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), appointment })
}

export function validateConveyancerSigningAppointmentWorkflow(input = {}) {
  return validateAppointment(clone(input))
}

function auditEvent(appointment, { commandId, commandType, commandFingerprint = null, performedBy, occurredAt, before }) {
  const eventId = `signing_appointment_event:${appointment.appointmentId}:${appointment.runtimeRevision}:${commandId}`
  appointment.lastEventId = eventId
  return deepFreeze({
    version: CONVEYANCER_SIGNING_APPOINTMENT_WORKFLOW_VERSION,
    eventId,
    eventType: commandType === 'propose' ? 'signing_appointment_proposed' : `signing_appointment_${commandType}`,
    commandId,
    commandType,
    commandFingerprint,
    appointmentId: appointment.appointmentId,
    signingPlanId: appointment.signingPlan.signingPlanId,
    signingPlanFingerprint: appointment.signingPlan.signingPlanFingerprint,
    lane: appointment.signingPlan.lane,
    occurredAt,
    performedBy,
    before,
    after: { status: appointment.status, runtimeRevision: appointment.runtimeRevision, readinessStatus: appointment.readiness.status, bindingFingerprint: appointment.bindingFingerprint },
    calendarEventCreated: false,
    notificationsSent: false,
    persistencePerformed: false,
    signatureEvidenceRecorded: false,
  })
}

export function startConveyancerSigningAppointmentWorkflow({
  signingPlan: inputPlan = {},
  capacityRecords = [],
  appointmentId = '',
  appointmentType = '',
  mode = MODE.inPerson,
  signingOrderGroup = null,
  selectedMethods = {},
  slot = {},
  venue: inputVenue = {},
  requirements = {},
  actor: inputActor = {},
  occurredAt = '',
  commandId = '',
  existingAppointments = [],
} = {}) {
  const resolvedCommandId = text(commandId)
  const createdAt = iso(occurredAt)
  if (!resolvedCommandId) return fail('command_id_required')
  if (!createdAt) return fail('valid_appointment_proposal_time_required')
  const planValidation = validateConveyancerSigningPlan(inputPlan, { capacityRecords, asOf: inputPlan.assessment?.assessedAt })
  if (!planValidation.valid) return fail('d2_signing_plan_invalid', planValidation.errors)
  const plan = planValidation.plan
  if (plan.assessment.status !== CONVEYANCER_SIGNING_PLAN_STATUSES.ready) return fail('d2_signing_plan_not_ready', [plan.assessment.status])
  const proposer = actor(inputActor)
  if (!authorised(proposer, CAP.propose, plan.document.lane)) return fail('signing_appointment_proposal_not_authorised')
  const resolvedMode = key(mode)
  const resolvedSlot = schedule(slot)
  const resolvedVenue = normalizeVenue(inputVenue, resolvedMode)
  const setupErrors = [...scheduleErrors(resolvedSlot, createdAt), ...venueErrors(resolvedVenue, resolvedMode)]
  if (!MODES.has(resolvedMode)) setupErrors.push('signing_appointment_mode_invalid')
  const orderGroup = signingOrderGroup == null ? null : Number(signingOrderGroup)
  if (orderGroup != null && (!Number.isInteger(orderGroup) || orderGroup < 1)) setupErrors.push('signing_order_group_invalid')
  const scopedParticipants = orderGroup == null ? plan.participants : plan.participants.filter((item) => item.signingOrder === orderGroup)
  if (!scopedParticipants.length) setupErrors.push('signing_order_group_has_no_participants')
  const capacities = new Map((Array.isArray(capacityRecords) ? capacityRecords : []).map((item) => [text(item.capacityId || item.capacity_id), item]))
  const attendees = scopedParticipants.map((participant) => {
    const requested = key(selectedMethods[participant.signerKey] || selectedMethods[participant.participantKey])
    const selectedMethod = requested || (participant.allowedMethods.includes(CONVEYANCER_SIGNING_PLAN_METHODS.wetInk) ? CONVEYANCER_SIGNING_PLAN_METHODS.wetInk : participant.allowedMethods[0])
    if (!participant.allowedMethods.includes(selectedMethod)) setupErrors.push(`selected_signing_method_not_allowed:${participant.signerKey}`)
    if (resolvedMode === MODE.remoteSupervised && selectedMethod === CONVEYANCER_SIGNING_PLAN_METHODS.wetInk) setupErrors.push(`wet_ink_not_permitted_for_remote_session:${participant.signerKey}`)
    const capacity = capacities.get(participant.capacityId)
    if (!capacity) setupErrors.push(`capacity_record_missing:${participant.signerKey}`)
    else {
      const applicability = evaluateConveyancerSigningCapacityApplicability({ capacity: stripCapacityAssessment(capacity), document: plan.document, asOf: resolvedSlot.startsAt, expectedPartyRole: participant.partyRole })
      if (!applicability.usable) setupErrors.push(`capacity_not_valid_at_appointment:${participant.signerKey}`)
    }
    return attendeeFromParticipant(participant, selectedMethod)
  })
  const resolvedRequirements = {
    witnessRequired: requirements.witnessRequired === true || requirements.witness_required === true,
    commissionerRequired: requirements.commissionerRequired === true || requirements.commissioner_required === true,
    interpreterRequired: requirements.interpreterRequired === true || requirements.interpreter_required === true,
    interpreterReferenceId: text(requirements.interpreterReferenceId || requirements.interpreter_reference_id) || null,
  }
  if (resolvedRequirements.interpreterRequired && !resolvedRequirements.interpreterReferenceId) setupErrors.push('interpreter_reference_required')
  const resolvedAppointmentId = text(appointmentId) || `signing_appointment:${plan.signingPlanId}:${orderGroup || 'all'}`
  const duplicateRecord = (Array.isArray(existingAppointments) ? existingAppointments : []).find((item) => text((item.appointment || item).appointmentId || (item.appointment || item).appointment_id) === resolvedAppointmentId)
  if (duplicateRecord) {
    const existing = duplicateRecord.appointment || duplicateRecord
    if (existing.proposalCommandId !== resolvedCommandId) return fail('signing_appointment_already_exists')
    if (existing.host?.role !== proposer.role || existing.host?.userId !== proposer.userId) return fail('signing_appointment_proposal_command_id_conflict')
    const proposedBindingFingerprint = buildConveyancerSigningAppointmentBindingFingerprint({
      version: CONVEYANCER_SIGNING_APPOINTMENT_WORKFLOW_VERSION,
      appointmentId: resolvedAppointmentId,
      signingPlan: planBinding(plan),
      appointmentType: key(appointmentType) || appointmentTypeForLane(plan.document.lane),
      mode: resolvedMode,
      signingOrderGroup: orderGroup,
      schedule: resolvedSlot,
      venue: resolvedVenue,
      host: proposer,
      attendees,
      requirements: resolvedRequirements,
    })
    if (existing.bindingFingerprint !== proposedBindingFingerprint) return fail('signing_appointment_proposal_command_id_conflict')
    const validation = validateAppointment(clone(existing))
    if (!validation.valid) return fail('existing_signing_appointment_invalid', validation.errors)
    return deepFreeze({ ok: true, duplicate: true, code: 'idempotent_replay', errors: [], appointment: validation.appointment, event: duplicateRecord.event || null })
  }
  const candidate = { schedule: resolvedSlot, venue: resolvedVenue, attendees }
  const conflicts = detectConveyancerSigningAppointmentConflicts({ candidate, existingAppointments, ignoreAppointmentId: resolvedAppointmentId })
  setupErrors.push(...conflicts.conflicts)
  if (setupErrors.length) return fail('signing_appointment_proposal_invalid', setupErrors)
  const appointment = {
    version: CONVEYANCER_SIGNING_APPOINTMENT_WORKFLOW_VERSION,
    appointmentId: resolvedAppointmentId,
    signingPlan: planBinding(plan),
    appointmentType: key(appointmentType) || appointmentTypeForLane(plan.document.lane),
    mode: resolvedMode,
    signingOrderGroup: orderGroup,
    schedule: resolvedSlot,
    venue: resolvedVenue,
    host: proposer,
    attendees,
    requirements: resolvedRequirements,
    status: STATUS.awaitingConfirmation,
    readiness: null,
    rescheduleRequest: null,
    outcome: null,
    proposalCommandId: resolvedCommandId,
    bindingFingerprint: null,
    fingerprint: null,
    runtimeRevision: 1,
    createdAt,
    updatedAt: createdAt,
    lastEventId: null,
    calendarEventCreated: false,
    notificationsSent: false,
    persistencePerformed: false,
    signatureEvidenceRecorded: false,
  }
  setFingerprints(appointment)
  const event = auditEvent(appointment, { commandId: resolvedCommandId, commandType: 'propose', performedBy: proposer, occurredAt: createdAt, before: { status: 'not_proposed', runtimeRevision: 0 } })
  appointment.fingerprint = buildConveyancerSigningAppointmentFingerprint(appointment)
  const validation = validateAppointment(appointment)
  if (!validation.valid) return fail('resulting_signing_appointment_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: 'signing_appointment_proposed', errors: [], appointment, event })
}

function expectedBinding(appointment, command) {
  if (text(command.expectedAppointmentId || command.expected_appointment_id) !== appointment.appointmentId) return 'stale_signing_appointment_id'
  if (Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision) !== appointment.runtimeRevision) return 'stale_signing_appointment_revision'
  if (text(command.expectedFingerprint || command.expected_fingerprint) !== appointment.fingerprint) return 'stale_signing_appointment_fingerprint'
  return null
}

export function buildConveyancerSigningAppointmentCommand(appointment = {}, type, payload = {}) {
  return {
    commandId: `${key(type)}:${appointment.runtimeRevision}`,
    type: key(type),
    expectedAppointmentId: appointment.appointmentId,
    expectedRuntimeRevision: appointment.runtimeRevision,
    expectedFingerprint: appointment.fingerprint,
    ...payload,
  }
}

function commandHash(type, command, performedBy) {
  const { commandId: _commandId, expectedFingerprint: _expectedFingerprint, expected_fingerprint: _expectedFingerprintSnake, ...payload } = command
  return fnv({ type, payload, performedBy })
}

function resetResponses(appointment) {
  appointment.attendees.forEach((item) => {
    item.rsvpStatus = RSVP.pending
    item.respondedAt = null
    item.responseReferenceId = null
    item.attendanceStatus = null
    item.attendanceRecordedAt = null
    item.attendanceReferenceId = null
  })
}

function applyCommand(appointment, type, command, performedBy, occurredAt, existingAppointments, capacityRecords) {
  const lane = appointment.signingPlan.lane
  if (type === COMMAND.recordResponse) {
    if (!authorised(performedBy, CAP.recordResponse, lane)) return 'appointment_response_recording_not_authorised'
    const signerKey = key(command.signerKey || command.signer_key)
    const attendee = appointment.attendees.find((item) => item.signerKey === signerKey)
    const response = key(command.response || command.rsvpStatus || command.rsvp_status)
    const referenceId = text(command.responseReferenceId || command.response_reference_id)
    if (!attendee) return 'signing_appointment_attendee_not_found'
    if (![RSVP.accepted, RSVP.tentative, RSVP.declined].includes(response) || !referenceId) return 'appointment_response_evidence_required'
    attendee.rsvpStatus = response
    attendee.respondedAt = occurredAt
    attendee.responseReferenceId = referenceId
    if (response === RSVP.declined || (appointment.status === STATUS.confirmed && response !== RSVP.accepted)) appointment.status = STATUS.rescheduleRequested
    return null
  }
  if (type === COMMAND.requestReschedule) {
    if (!authorised(performedBy, CAP.recordResponse, lane)) return 'appointment_reschedule_request_not_authorised'
    const signerKey = key(command.signerKey || command.signer_key)
    if (!appointment.attendees.some((item) => item.signerKey === signerKey)) return 'signing_appointment_attendee_not_found'
    const reasonCode = key(command.reasonCode || command.reason_code)
    const requestReferenceId = text(command.requestReferenceId || command.request_reference_id)
    if (!reasonCode || !requestReferenceId) return 'appointment_reschedule_request_evidence_required'
    appointment.status = STATUS.rescheduleRequested
    appointment.rescheduleRequest = { signerKey, reasonCode, requestReferenceId, requestedAt: occurredAt, recordedBy: performedBy }
    return null
  }
  if (type === COMMAND.reschedule) {
    if (!authorised(performedBy, CAP.reschedule, lane)) return 'signing_appointment_reschedule_not_authorised'
    const newSlot = schedule(command.slot || command)
    const newVenue = normalizeVenue(command.venue || appointment.venue, appointment.mode)
    const errors = [...scheduleErrors(newSlot, occurredAt), ...venueErrors(newVenue, appointment.mode)]
    errors.push(...detectConveyancerSigningAppointmentConflicts({ candidate: { schedule: newSlot, venue: newVenue, attendees: appointment.attendees }, existingAppointments, ignoreAppointmentId: appointment.appointmentId }).conflicts)
    errors.push(...capacityErrorsAt(appointment, capacityRecords, newSlot.startsAt))
    if (errors.length) return `appointment_reschedule_invalid:${errors.join('|')}`
    appointment.schedule = newSlot
    appointment.venue = newVenue
    appointment.status = STATUS.awaitingConfirmation
    appointment.rescheduleRequest = null
    appointment.outcome = null
    resetResponses(appointment)
    return null
  }
  if (type === COMMAND.confirm) {
    if (!authorised(performedBy, CAP.confirm, lane)) return 'signing_appointment_confirmation_not_authorised'
    if (appointment.status !== STATUS.awaitingConfirmation) return 'signing_appointment_not_awaiting_confirmation'
    if (readiness(appointment).status !== 'ready') return 'signing_appointment_not_ready_for_confirmation'
    if (new Date(occurredAt) >= new Date(appointment.schedule.startsAt)) return 'signing_appointment_confirmation_too_late'
    const capacityErrors = capacityErrorsAt(appointment, capacityRecords, appointment.schedule.startsAt)
    if (capacityErrors.length) return `signing_appointment_capacity_recheck_failed:${capacityErrors.join('|')}`
    appointment.status = STATUS.confirmed
    return null
  }
  if (type === COMMAND.recordAttendance) {
    if (!authorised(performedBy, CAP.recordAttendance, lane)) return 'appointment_attendance_recording_not_authorised'
    if (appointment.status !== STATUS.confirmed || new Date(occurredAt) < new Date(appointment.schedule.startsAt)) return 'appointment_attendance_window_not_open'
    const signerKey = key(command.signerKey || command.signer_key)
    const attendee = appointment.attendees.find((item) => item.signerKey === signerKey)
    const attendanceStatus = key(command.attendanceStatus || command.attendance_status)
    const referenceId = text(command.attendanceReferenceId || command.attendance_reference_id)
    if (!attendee || !ATTENDANCES.has(attendanceStatus) || !referenceId) return 'appointment_attendance_evidence_required'
    attendee.attendanceStatus = attendanceStatus
    attendee.attendanceRecordedAt = occurredAt
    attendee.attendanceReferenceId = referenceId
    return null
  }
  if (type === COMMAND.complete) {
    if (!legalAuthorised(performedBy, CAP.complete, lane)) return 'signing_appointment_completion_not_authorised'
    if (appointment.status !== STATUS.confirmed || new Date(occurredAt) < new Date(appointment.schedule.startsAt)) return 'signing_appointment_not_completable'
    const required = appointment.attendees.filter((item) => item.required)
    if (required.some((item) => !item.attendanceStatus)) return 'required_attendance_not_recorded'
    const outcomeReferenceId = text(command.outcomeReferenceId || command.outcome_reference_id)
    if (!outcomeReferenceId) return 'appointment_outcome_reference_required'
    const noShow = required.some((item) => item.attendanceStatus === ATTENDANCE.noShow)
    appointment.status = noShow ? STATUS.noShow : STATUS.completed
    appointment.outcome = { type: noShow ? 'required_signer_no_show' : 'session_completed', outcomeReferenceId, recordedAt: occurredAt, recordedBy: performedBy, signatureEvidenceRecorded: false }
    return null
  }
  if (type === COMMAND.cancel) {
    if (!authorised(performedBy, CAP.cancel, lane)) return 'signing_appointment_cancellation_not_authorised'
    const reasonCode = key(command.reasonCode || command.reason_code)
    const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id)
    if (!reasonCode || !decisionReferenceId) return 'signing_appointment_cancellation_evidence_required'
    appointment.status = STATUS.cancelled
    appointment.outcome = { type: 'cancelled', reasonCode, outcomeReferenceId: decisionReferenceId, recordedAt: occurredAt, recordedBy: performedBy, signatureEvidenceRecorded: false }
    return null
  }
  return 'signing_appointment_command_unsupported'
}

export function executeConveyancerSigningAppointmentWorkflow({ appointment: input = {}, command = {}, actor: inputActor = {}, occurredAt = '', existingEvents = [], existingAppointments = [], capacityRecords = [] } = {}) {
  const currentValidation = validateAppointment(clone(input))
  if (!currentValidation.valid) return fail('signing_appointment_contract_invalid', currentValidation.errors)
  const current = currentValidation.appointment
  const type = key(command.type)
  const commandId = text(command.commandId || command.command_id)
  const performedBy = actor(inputActor)
  const at = iso(occurredAt)
  if (!COMMAND_VALUES.has(type) || !commandId) return fail('valid_signing_appointment_command_required')
  if (!at || new Date(at) < new Date(current.updatedAt)) return fail('signing_appointment_command_chronology_invalid')
  if (TERMINAL_STATUSES.has(current.status)) return fail('signing_appointment_terminal')
  const bindingError = expectedBinding(current, command)
  if (bindingError) return fail(bindingError)
  const hash = commandHash(type, command, performedBy)
  const duplicate = (Array.isArray(existingEvents) ? existingEvents : []).find((item) => item.commandId === commandId)
  if (duplicate) {
    if (duplicate.commandFingerprint !== hash) return fail('signing_appointment_command_id_conflict')
    return deepFreeze({ ok: true, duplicate: true, code: 'idempotent_replay', errors: [], appointment: current, event: duplicate })
  }
  const appointment = clone(current)
  const before = { status: appointment.status, runtimeRevision: appointment.runtimeRevision, readinessStatus: appointment.readiness.status, bindingFingerprint: appointment.bindingFingerprint }
  const error = applyCommand(appointment, type, command, performedBy, at, existingAppointments, capacityRecords)
  if (error) return fail(error)
  appointment.runtimeRevision += 1
  appointment.updatedAt = at
  setFingerprints(appointment)
  const event = auditEvent(appointment, { commandId, commandType: type, commandFingerprint: hash, performedBy, occurredAt: at, before })
  appointment.fingerprint = buildConveyancerSigningAppointmentFingerprint(appointment)
  const resultingValidation = validateAppointment(appointment)
  if (!resultingValidation.valid) return fail('resulting_signing_appointment_invalid', resultingValidation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: `signing_appointment_${type}_recorded`, errors: [], appointment, event })
}

export function buildConveyancerSigningAppointmentReminderPlan(appointment = {}) {
  const validation = validateAppointment(clone(appointment))
  if (!validation.valid) return deepFreeze({ ok: false, code: 'signing_appointment_contract_invalid', errors: validation.errors, reminders: [] })
  if (!ACTIVE_STATUSES.has(validation.appointment.status)) return deepFreeze({ ok: false, code: 'signing_appointment_not_active', errors: [], reminders: [] })
  const startsAt = new Date(validation.appointment.schedule.startsAt)
  const reminders = [
    { reminderKey: 'signing_appointment_24h', scheduledFor: new Date(startsAt.getTime() - 24 * 60 * 60000).toISOString(), audience: 'all_attendees' },
    { reminderKey: 'signing_appointment_2h', scheduledFor: new Date(startsAt.getTime() - 2 * 60 * 60000).toISOString(), audience: 'pending_or_accepted_attendees' },
    { reminderKey: 'signing_appointment_due', scheduledFor: startsAt.toISOString(), audience: 'host_and_attendees' },
  ]
  return deepFreeze({ ok: true, code: 'signing_appointment_reminder_plan_ready', errors: [], appointmentId: validation.appointment.appointmentId, bindingFingerprint: validation.appointment.bindingFingerprint, reminders, notificationsSent: false, persistencePerformed: false })
}
