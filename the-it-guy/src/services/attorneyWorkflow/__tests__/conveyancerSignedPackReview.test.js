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
  CONVEYANCER_SIGNING_PLAN_VERSION,
  buildConveyancerSigningPlan,
} from '../../../core/documents/conveyancerSigningPlan.js'
import {
  buildConveyancerLegalInstrumentCompletionFingerprint,
  buildConveyancerLegalInstrumentSigningBindingFingerprint,
} from '../conveyancerLegalInstrumentSigningEvidence.js'
import { runConveyancerLegalInstrumentSigningPilotScenario } from '../conveyancerLegalInstrumentSigningAssurance.js'
import {
  CONVEYANCER_SIGNING_APPOINTMENT_ATTENDANCE_STATUSES as ATTENDANCE,
  CONVEYANCER_SIGNING_APPOINTMENT_COMMANDS as APPOINTMENT_COMMAND,
  buildConveyancerSigningAppointmentCommand,
  executeConveyancerSigningAppointmentWorkflow,
  startConveyancerSigningAppointmentWorkflow,
} from '../conveyancerSigningAppointmentWorkflow.js'
import {
  CONVEYANCER_SIGNED_PACK_REVIEW_COMMANDS as COMMAND,
  CONVEYANCER_SIGNED_PACK_REVIEW_CONTROLS,
  CONVEYANCER_SIGNED_PACK_REVIEW_STATUSES as STATUS,
  buildConveyancerSignedPackReviewCommand,
  executeConveyancerSignedPackReview,
  startConveyancerSignedPackReview,
  validateConveyancerSignedPackReview,
} from '../conveyancerSignedPackReview.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const GENERATED_AT = '2026-07-15T08:00:00.000Z'
const HASH = 'd'.repeat(64)
const secretary = { role: R.secretary, userId: 'secretary-d4' }
const attorney = { role: R.transferAttorney, userId: 'attorney-d4' }

function authorityEvidence(requirementKey) {
  return {
    requirementKey,
    referenceId: `evidence:${requirementKey}`,
    evidenceHash: HASH,
    status: 'verified',
    issuedAt: '2026-07-01T08:00:00.000Z',
    expiresAt: null,
    verifiedAt: '2026-07-15T08:09:00.000Z',
    verifiedBy: { role: R.transferAttorney, userId: 'capacity-verifier-d4' },
    source: 'matter_record',
  }
}

function completedC7() {
  const pilot = runConveyancerLegalInstrumentSigningPilotScenario({ scenarioId: 'completed_transfer_signing', generatedAt: GENERATED_AT, includeArtifacts: true })
  assert.equal(pilot.passed, true, JSON.stringify(pilot.errors))
  return structuredClone(pilot.artifacts)
}

function d1Capacity(document, signing) {
  const definition = getConveyancerSigningCapacityDefinition(C.conveyancer)
  const signer = signing.signerContract[0]
  const result = buildConveyancerSigningCapacity({
    modelVersion: CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
    capacityId: 'capacity:primary:d4:v1',
    recordVersion: 1,
    planId: document.planId,
    planVersion: document.planVersion,
    transactionId: document.transactionId,
    organisationId: document.organisationId,
    lane: document.lane,
    partyKey: 'legal-practitioner-party-d4',
    partyRole: 'legal_practitioner',
    partyType: P.legalPractitioner,
    signatoryKey: signer.signerKey,
    signatoryReferenceHash: signer.signerReferenceHash,
    capacityType: C.conveyancer,
    authorityBasis: A.professionalAppointment,
    scope: {
      documentKinds: [document.documentKind],
      documentKeys: [document.documentKey],
      powers: ['sign_documents'],
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      effectiveUntil: '2026-12-31T23:59:59.000Z',
    },
    evidence: definition.requiredEvidence.map(authorityEvidence),
    capturedAt: '2026-07-15T08:08:00.000Z',
    capturedBy: { role: R.secretary, userId: 'capacity-capturer-d4' },
  }, { asOf: '2026-07-15T08:12:00.000Z' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.capacity
}

function d2Plan(document, signing, capacity, allowedMethods = ['electronic']) {
  const signer = signing.signerContract[0]
  const result = buildConveyancerSigningPlan({
    version: CONVEYANCER_SIGNING_PLAN_VERSION,
    signingPlanId: 'signing-plan-d4',
    revision: 1,
    document,
    routingMode: 'parallel',
    participants: [{
      participantKey: 'participant-primary-d4',
      signerKey: signer.signerKey,
      documentSignerRole: signer.signerRole,
      partyKey: capacity.partyKey,
      partyRole: capacity.partyRole,
      signerReferenceHash: signer.signerReferenceHash,
      capacityId: capacity.capacityId,
      signingOrder: signer.signingOrder,
      required: signer.required,
      allowedMethods,
    }],
    preparedAt: '2026-07-15T08:10:00.000Z',
    preparedBy: secretary,
    approval: { approvedAt: '2026-07-15T08:11:00.000Z', approvedBy: attorney, decisionReferenceId: 'approval:d4' },
  }, { capacityRecords: [capacity], asOf: '2026-07-15T08:12:00.000Z' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.plan
}

function inspection(document, signing, overrides = {}) {
  const field = document.renderModel.signingFields[0]
  return {
    inspectionId: 'inspection-d4-1',
    signedDocumentId: signing.signedDocumentEvidence.signedDocumentId,
    signedDocumentVersionId: signing.signedDocumentEvidence.signedDocumentVersionId,
    artifactHash: signing.signedDocumentEvidence.finalArtifactHash,
    completionCertificateHash: signing.signedDocumentEvidence.completionCertificateHash,
    pageCount: signing.renderEvidence.pageCount,
    inspectedAt: '2026-07-15T08:46:00.000Z',
    inspectedBy: secretary,
    executionDatesConfirmed: true,
    legibilityConfirmed: true,
    unauthorisedAlterationsFound: false,
    fieldResults: [{
      fieldKey: field.fieldKey,
      fieldType: field.fieldType,
      signerKey: signing.signerContract[0].signerKey,
      status: 'valid',
      pageNumber: 3,
      evidenceReferenceHash: HASH,
    }],
    originalsEvidence: [],
    ...overrides,
  }
}

function fixture({ wetInk = false } = {}) {
  const c7 = completedC7()
  if (wetInk) {
    c7.signing.signerContract[0].allowedMethods = ['wet_ink']
    c7.signing.signerStates[0].signatureEvidence.method = 'wet_ink'
    c7.signing.bindingFingerprint = buildConveyancerLegalInstrumentSigningBindingFingerprint(c7.signing)
    c7.signing.completionFingerprint = buildConveyancerLegalInstrumentCompletionFingerprint(c7.signing)
  }
  const capacity = d1Capacity(c7.artifacts.document, c7.signing)
  const plan = d2Plan(c7.artifacts.document, c7.signing, capacity, wetInk ? ['wet_ink'] : ['electronic'])
  return { c7, capacity, plan }
}

function start(overrides = {}) {
  const base = overrides.base || fixture()
  const inputInspection = overrides.inspection || inspection(base.c7.artifacts.document, base.c7.signing)
  const result = startConveyancerSignedPackReview({
    signingPlan: base.plan,
    capacityRecords: [base.capacity],
    signing: base.c7.signing,
    appointments: overrides.appointments || [],
    inspection: inputInspection,
    actor: overrides.actor || secretary,
    occurredAt: '2026-07-15T08:47:00.000Z',
    commandId: 'start:d4',
    existingReviews: overrides.existingReviews || [],
  })
  return { ...base, inspection: inputInspection, result }
}

function controls() {
  return Object.fromEntries(CONVEYANCER_SIGNED_PACK_REVIEW_CONTROLS.map((item) => [item.key, true]))
}

function execute(review, type, performedBy, payload = {}, occurredAt = '2026-07-15T08:50:00.000Z', existingEvents = []) {
  return executeConveyancerSignedPackReview({ review, command: buildConveyancerSignedPackReviewCommand(review, type, payload), actor: performedBy, occurredAt, existingEvents })
}

function completedWetInkAppointment(base) {
  const proposed = startConveyancerSigningAppointmentWorkflow({
    signingPlan: base.plan,
    capacityRecords: [base.capacity],
    appointmentId: 'appointment-wet-d4',
    mode: 'in_person',
    selectedMethods: { primary: 'wet_ink' },
    slot: { startsAt: '2026-07-15T08:15:00.000Z', endsAt: '2026-07-15T08:30:00.000Z', timeZone: 'Africa/Johannesburg' },
    venue: { type: 'attorney_office', referenceId: 'venue:d4', resourceId: 'room:d4' },
    actor: secretary,
    occurredAt: '2026-07-15T08:13:00.000Z',
    commandId: 'propose:wet-d4',
  })
  assert.equal(proposed.ok, true, JSON.stringify(proposed.errors))
  const command = (appointment, type, payload) => buildConveyancerSigningAppointmentCommand(appointment, type, payload)
  const accepted = executeConveyancerSigningAppointmentWorkflow({ appointment: proposed.appointment, command: command(proposed.appointment, APPOINTMENT_COMMAND.recordResponse, { signerKey: 'primary', response: 'accepted', responseReferenceId: 'rsvp:wet-d4' }), actor: { role: R.system, userId: 'portal-d4' }, occurredAt: '2026-07-15T08:13:30.000Z' })
  const confirmed = executeConveyancerSigningAppointmentWorkflow({ appointment: accepted.appointment, command: command(accepted.appointment, APPOINTMENT_COMMAND.confirm, {}), actor: secretary, occurredAt: '2026-07-15T08:14:00.000Z', capacityRecords: [base.capacity] })
  const attended = executeConveyancerSigningAppointmentWorkflow({ appointment: confirmed.appointment, command: command(confirmed.appointment, APPOINTMENT_COMMAND.recordAttendance, { signerKey: 'primary', attendanceStatus: ATTENDANCE.attended, attendanceReferenceId: 'attendance:wet-d4' }), actor: secretary, occurredAt: '2026-07-15T08:15:00.000Z' })
  const completed = executeConveyancerSigningAppointmentWorkflow({ appointment: attended.appointment, command: command(attended.appointment, APPOINTMENT_COMMAND.complete, { outcomeReferenceId: 'outcome:wet-d4' }), actor: attorney, occurredAt: '2026-07-15T08:30:00.000Z' })
  assert.equal(completed.ok, true, JSON.stringify(completed.errors))
  return completed.appointment
}

test('starts a clean signed-pack review with all legal-use checks passed', () => {
  const { result } = start()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.code, 'signed_pack_review_started')
  assert.equal(result.review.status, STATUS.pendingReview)
  assert.equal(result.review.findings.length, 0)
  assert.equal(result.review.checks.every((item) => item.status === 'passed'), true)
  assert.equal(Object.isFrozen(result.review), true)
})

test('requires a completed valid C7 signing run', () => {
  const pilot = runConveyancerLegalInstrumentSigningPilotScenario({ scenarioId: 'signing_in_progress', generatedAt: GENERATED_AT, includeArtifacts: true })
  const base = fixture()
  const result = startConveyancerSignedPackReview({ signingPlan: base.plan, capacityRecords: [base.capacity], signing: pilot.artifacts.signing, inspection: inspection(base.c7.artifacts.document, base.c7.signing), actor: secretary, occurredAt: '2026-07-15T08:47:00.000Z', commandId: 'invalid-c7' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'completed_c7_signing_required')
})

test('requires exact D2 and C7 document and signer bindings', () => {
  const base = fixture()
  const wrong = structuredClone(base.c7.signing)
  wrong.documentId = 'different-document'
  wrong.renderEvidence.sourceDocumentId = 'different-document'
  wrong.bindingFingerprint = buildConveyancerLegalInstrumentSigningBindingFingerprint(wrong)
  wrong.completionFingerprint = buildConveyancerLegalInstrumentCompletionFingerprint(wrong)
  const result = startConveyancerSignedPackReview({ signingPlan: base.plan, capacityRecords: [base.capacity], signing: wrong, inspection: inspection(base.c7.artifacts.document, wrong), actor: secretary, occurredAt: '2026-07-15T08:47:00.000Z', commandId: 'wrong-binding' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'd2_c7_source_binding_mismatch')
})

test('opens critical findings for artifact or certificate mismatch', () => {
  const base = fixture()
  const input = inspection(base.c7.artifacts.document, base.c7.signing, { artifactHash: HASH, completionCertificateHash: HASH })
  const { result } = start({ base, inspection: input })
  assert.equal(result.ok, true)
  assert.equal(result.code, 'signed_pack_review_started_with_findings')
  assert.ok(result.findings == null)
  assert.ok(result.review.findings.some((item) => item.checkId === 'artifact_integrity' && item.severity === 'critical'))
})

test('detects page-count mismatch and missing required field execution', () => {
  const base = fixture()
  const input = inspection(base.c7.artifacts.document, base.c7.signing, { pageCount: 2, fieldResults: [] })
  const { result } = start({ base, inspection: input })
  assert.ok(result.review.findings.some((item) => item.checkId === 'page_integrity'))
  assert.ok(result.review.findings.some((item) => item.checkId === 'signature_and_initial_coverage'))
})

test('detects unknown, illegible, or invalid field inspection evidence', () => {
  const base = fixture()
  const input = inspection(base.c7.artifacts.document, base.c7.signing)
  input.fieldResults[0].fieldKey = 'unknown_field'
  input.fieldResults[0].status = 'illegible'
  const { result } = start({ base, inspection: input })
  assert.ok(result.review.findings.some((item) => item.checkId === 'signature_and_initial_coverage'))
})

test('detects missing execution dates, illegibility, and unauthorised alterations', () => {
  const base = fixture()
  const input = inspection(base.c7.artifacts.document, base.c7.signing, { executionDatesConfirmed: false, legibilityConfirmed: false, unauthorisedAlterationsFound: true })
  const { result } = start({ base, inspection: input })
  assert.ok(result.review.findings.some((item) => item.checkId === 'execution_dates'))
  assert.ok(result.review.findings.some((item) => item.checkId === 'legibility_and_alterations'))
})

test('requires wet-ink original receipt and a completed attended D3 session', () => {
  const base = fixture({ wetInk: true })
  let result = start({ base, inspection: inspection(base.c7.artifacts.document, base.c7.signing) }).result
  assert.ok(result.review.findings.some((item) => item.checkId === 'wet_ink_originals_and_session'))
  const appointment = completedWetInkAppointment(base)
  const input = inspection(base.c7.artifacts.document, base.c7.signing, {
    originalsEvidence: [{ signerKey: 'primary', originalReceived: true, receivedAt: '2026-07-15T08:36:00.000Z', evidenceReferenceHash: HASH }],
  })
  result = start({ base, inspection: input, appointments: [appointment] }).result
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.review.checks.find((item) => item.id === 'wet_ink_originals_and_session').status, 'passed')
})

test('prevents acceptance recommendation while findings remain', () => {
  const base = fixture()
  const input = inspection(base.c7.artifacts.document, base.c7.signing, { legibilityConfirmed: false })
  const review = start({ base, inspection: input }).result.review
  const result = execute(review, COMMAND.recommendAcceptance, attorney, { controls: controls(), summary: 'Reviewed.' })
  assert.equal(result.code, 'signed_pack_findings_must_be_cleared_by_new_pack')
})

test('requests correction against the immutable reviewed pack', () => {
  const base = fixture()
  const review = start({ base, inspection: inspection(base.c7.artifacts.document, base.c7.signing, { legibilityConfirmed: false }) }).result.review
  const result = execute(review, COMMAND.requestCorrection, attorney, { reasonCode: 'illegible_execution', decisionReferenceId: 'correction:d4', summary: 'Return a clean signed pack.' })
  assert.equal(result.ok, true)
  assert.equal(result.review.status, STATUS.changesRequested)
  assert.equal(execute(result.review, COMMAND.reject, attorney, { reasonCode: 'other', decisionReferenceId: 'late' }).code, 'signed_pack_review_terminal')
})

test('requires every review control before recommending acceptance', () => {
  const review = start().result.review
  const incomplete = controls()
  incomplete.page_integrity = false
  const result = execute(review, COMMAND.recommendAcceptance, attorney, { controls: incomplete, summary: 'Reviewed.' })
  assert.equal(result.code, 'signed_pack_review_controls_incomplete')
})

test('supports legal recommendation followed by final acceptance evidence', () => {
  const review = start().result.review
  const recommended = execute(review, COMMAND.recommendAcceptance, attorney, { controls: controls(), summary: 'Execution and returned pack reviewed.' })
  assert.equal(recommended.review.status, STATUS.acceptanceRecommended)
  const accepted = execute(recommended.review, COMMAND.accept, attorney, { decisionReferenceId: 'acceptance:d4', summary: 'Signed pack accepted for the next controlled phase.' }, '2026-07-15T08:55:00.000Z')
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors))
  assert.equal(accepted.review.status, STATUS.accepted)
  assert.equal(accepted.review.persistencePerformed, false)
  assert.equal(accepted.review.registrationUpdated, false)
})

test('restricts review and acceptance decisions to the correct legal lane', () => {
  const review = start().result.review
  const denied = execute(review, COMMAND.recommendAcceptance, { role: R.bondAttorney, userId: 'bond-d4' }, { controls: controls(), summary: 'Wrong lane.' })
  assert.equal(denied.code, 'signed_pack_review_not_authorised')
  const secretaryDenied = execute(review, COMMAND.recommendAcceptance, secretary, { controls: controls(), summary: 'Not legal.' })
  assert.equal(secretaryDenied.code, 'signed_pack_review_not_authorised')
})

test('supports reasoned rejection without accepting the pack', () => {
  const review = start().result.review
  const rejected = execute(review, COMMAND.reject, attorney, { reasonCode: 'suspected_tampering', decisionReferenceId: 'reject:d4', summary: 'Artifact requires investigation.' })
  assert.equal(rejected.review.status, STATUS.rejected)
  assert.equal(rejected.review.acceptance, null)
})

test('enforces optimistic concurrency and idempotent command replay', () => {
  const review = start().result.review
  const command = buildConveyancerSignedPackReviewCommand(review, COMMAND.recommendAcceptance, { controls: controls(), summary: 'Reviewed.' })
  const first = executeConveyancerSignedPackReview({ review, command, actor: attorney, occurredAt: '2026-07-15T08:50:00.000Z' })
  const stale = { ...buildConveyancerSignedPackReviewCommand(first.review, COMMAND.accept, { decisionReferenceId: 'accept', summary: 'Accept.' }), expectedRuntimeRevision: 1 }
  assert.equal(executeConveyancerSignedPackReview({ review: first.review, command: stale, actor: attorney, occurredAt: '2026-07-15T08:55:00.000Z' }).code, 'stale_signed_pack_review_revision')
  const replay = executeConveyancerSignedPackReview({ review, command, actor: attorney, occurredAt: '2026-07-15T08:50:00.000Z', existingEvents: [first.event] })
  assert.equal(replay.duplicate, true)
})

test('supports exact start replay and rejects a second review for the same signing', () => {
  const context = start()
  const replay = start({ base: { c7: context.c7, capacity: context.capacity, plan: context.plan }, inspection: context.inspection, existingReviews: [{ review: context.result.review, event: context.result.event }] }).result
  assert.equal(replay.duplicate, true)
  const changedInspection = { ...context.inspection, legibilityConfirmed: false }
  const changed = start({ base: { c7: context.c7, capacity: context.capacity, plan: context.plan }, inspection: changedInspection, existingReviews: [{ review: context.result.review, event: context.result.event }] }).result
  assert.equal(changed.code, 'signed_pack_review_start_command_id_conflict')
  const conflict = startConveyancerSignedPackReview({ signingPlan: context.plan, capacityRecords: [context.capacity], signing: context.c7.signing, inspection: context.inspection, actor: secretary, occurredAt: '2026-07-15T08:47:00.000Z', commandId: 'different-start', existingReviews: [context.result.review] })
  assert.equal(conflict.code, 'signed_pack_review_already_exists')
})

test('detects source and runtime fingerprint tampering', () => {
  const review = start().result.review
  const source = structuredClone(review)
  source.inspection.pageCount = 99
  assert.ok(validateConveyancerSignedPackReview(source).errors.includes('signed_pack_review_binding_fingerprint_invalid'))
  const runtime = structuredClone(review)
  runtime.status = STATUS.accepted
  assert.ok(validateConveyancerSignedPackReview(runtime).errors.includes('signed_pack_review_fingerprint_invalid'))
})

test('keeps audit evidence redacted and performs no dispatch, storage, or registration action', () => {
  const { result } = start()
  const reviewed = execute(result.review, COMMAND.recommendAcceptance, attorney, { controls: controls(), summary: 'Private legal analysis remains outside the audit event.' })
  const serialized = JSON.stringify(reviewed.event)
  assert.equal(serialized.includes('Private legal analysis'), false)
  assert.equal(reviewed.event.persistencePerformed, false)
  assert.equal(reviewed.event.dispatchPerformed, false)
  assert.equal(reviewed.event.registrationUpdated, false)
  assert.equal(reviewed.event.documentMoved, false)
})

console.log('D4 signed-pack review tests passed.')
