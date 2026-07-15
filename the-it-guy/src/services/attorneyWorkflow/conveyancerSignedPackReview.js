import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_SIGNING_PLAN_STATUSES,
  buildConveyancerSigningPlanC7SignerContract,
  validateConveyancerSigningPlan,
} from '../../core/documents/conveyancerSigningPlan.js'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_STATUSES,
  validateConveyancerLegalInstrumentSigningEvidence,
} from './conveyancerLegalInstrumentSigningEvidence.js'
import {
  CONVEYANCER_SIGNING_APPOINTMENT_ATTENDANCE_STATUSES,
  CONVEYANCER_SIGNING_APPOINTMENT_STATUSES,
  validateConveyancerSigningAppointmentWorkflow,
} from './conveyancerSigningAppointmentWorkflow.js'

export const CONVEYANCER_SIGNED_PACK_REVIEW_VERSION = 'conveyancer_signed_pack_review_v1'

export const CONVEYANCER_SIGNED_PACK_REVIEW_STATUSES = Object.freeze({
  pendingReview: 'pending_review',
  acceptanceRecommended: 'acceptance_recommended',
  changesRequested: 'changes_requested',
  accepted: 'accepted',
  rejected: 'rejected',
})

export const CONVEYANCER_SIGNED_PACK_REVIEW_COMMANDS = Object.freeze({
  recommendAcceptance: 'recommend_acceptance',
  requestCorrection: 'request_correction',
  accept: 'accept',
  reject: 'reject',
})

export const CONVEYANCER_SIGNED_PACK_REVIEW_CAPABILITIES = Object.freeze({
  start: 'start',
  review: 'review',
  accept: 'accept',
  reject: 'reject',
})

export const CONVEYANCER_SIGNED_PACK_REVIEW_CONTROLS = Object.freeze([
  Object.freeze({ key: 'artifact_integrity', label: 'Final artifact and completion certificate match C7.' }),
  Object.freeze({ key: 'page_integrity', label: 'The reviewed pack has the expected complete page set.' }),
  Object.freeze({ key: 'signer_contract', label: 'C7 signers match the exact approved D2 plan.' }),
  Object.freeze({ key: 'signature_and_initial_coverage', label: 'Every required field meets its D2 quorum.' }),
  Object.freeze({ key: 'signing_order_and_method', label: 'Signing order and methods comply with D2.' }),
  Object.freeze({ key: 'identity_and_capacity', label: 'C7 identity evidence remains bound to approved D2 signers.' }),
  Object.freeze({ key: 'witnessing_and_commissioning', label: 'Witness and commissioner fields are complete where required.' }),
  Object.freeze({ key: 'execution_dates', label: 'Execution dates are complete and coherent.' }),
  Object.freeze({ key: 'legibility_and_alterations', label: 'The pack is legible and contains no unauthorised alteration.' }),
  Object.freeze({ key: 'wet_ink_originals_and_session', label: 'Wet-ink originals and appointment attendance are evidenced.' }),
])

const STATUS = CONVEYANCER_SIGNED_PACK_REVIEW_STATUSES
const COMMAND = CONVEYANCER_SIGNED_PACK_REVIEW_COMMANDS
const CAP = CONVEYANCER_SIGNED_PACK_REVIEW_CAPABILITIES
const COMMANDS = new Set(Object.values(COMMAND))
const STATUSES = new Set(Object.values(STATUS))
const TERMINAL = new Set([STATUS.changesRequested, STATUS.accepted, STATUS.rejected])
const FIELD_RESULTS = new Set(['valid', 'missing', 'illegible', 'invalid'])

export const CONVEYANCER_SIGNED_PACK_REVIEW_ROLE_CAPABILITIES = Object.freeze({
  [R.secretary]: Object.freeze([CAP.start]),
  [R.conveyancer]: Object.freeze(Object.values(CAP)),
  [R.transferAttorney]: Object.freeze(Object.values(CAP)),
  [R.bondAttorney]: Object.freeze(Object.values(CAP)),
  [R.cancellationAttorney]: Object.freeze(Object.values(CAP)),
  [R.firmManager]: Object.freeze(Object.values(CAP)),
  [R.system]: Object.freeze([]),
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
function fail(code, errors = []) { return deepFreeze({ ok: false, duplicate: false, code, errors: unique(errors), review: null, event: null }) }

export function getConveyancerSignedPackReviewCapabilities(role) {
  return CONVEYANCER_SIGNED_PACK_REVIEW_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerSignedPackReviewActor(role, capability) {
  return getConveyancerSignedPackReviewCapabilities(role).includes(key(capability))
}

function laneAuthorised(role, lane, includeSecretary = true) {
  const normalized = normalizeMatterPlanOwnerRole(role)
  if (normalized === R.firmManager) return true
  if (includeSecretary && normalized === R.secretary) return ['transfer', 'bond', 'cancellation'].includes(lane)
  if (lane === 'transfer') return [R.conveyancer, R.transferAttorney].includes(normalized)
  if (lane === 'bond') return normalized === R.bondAttorney
  if (lane === 'cancellation') return normalized === R.cancellationAttorney
  return false
}

function authorised(input, capability, lane, includeSecretary = true) {
  const value = actor(input)
  return Boolean(value.userId && canConveyancerSignedPackReviewActor(value.role, capability) && laneAuthorised(value.role, lane, includeSecretary))
}

function normalizeInspection(input = {}) {
  return {
    inspectionId: text(input.inspectionId || input.inspection_id),
    signedDocumentId: text(input.signedDocumentId || input.signed_document_id),
    signedDocumentVersionId: text(input.signedDocumentVersionId || input.signed_document_version_id),
    artifactHash: text(input.artifactHash || input.artifact_hash).toLowerCase(),
    completionCertificateHash: text(input.completionCertificateHash || input.completion_certificate_hash).toLowerCase(),
    pageCount: Number(input.pageCount ?? input.page_count),
    inspectedAt: iso(input.inspectedAt || input.inspected_at),
    inspectedBy: actor(input.inspectedBy || input.inspected_by),
    executionDatesConfirmed: input.executionDatesConfirmed === true || input.execution_dates_confirmed === true,
    legibilityConfirmed: input.legibilityConfirmed === true || input.legibility_confirmed === true,
    unauthorisedAlterationsFound: input.unauthorisedAlterationsFound === true || input.unauthorised_alterations_found === true,
    fieldResults: (Array.isArray(input.fieldResults || input.field_results) ? input.fieldResults || input.field_results : []).map((item) => ({
      fieldKey: key(item.fieldKey || item.field_key),
      fieldType: key(item.fieldType || item.field_type),
      signerKey: key(item.signerKey || item.signer_key),
      status: key(item.status),
      pageNumber: Number(item.pageNumber ?? item.page_number),
      evidenceReferenceHash: text(item.evidenceReferenceHash || item.evidence_reference_hash).toLowerCase(),
    })).sort((left, right) => left.fieldKey.localeCompare(right.fieldKey) || left.signerKey.localeCompare(right.signerKey)),
    originalsEvidence: (Array.isArray(input.originalsEvidence || input.originals_evidence) ? input.originalsEvidence || input.originals_evidence : []).map((item) => ({
      signerKey: key(item.signerKey || item.signer_key),
      originalReceived: item.originalReceived === true || item.original_received === true,
      receivedAt: iso(item.receivedAt || item.received_at),
      evidenceReferenceHash: text(item.evidenceReferenceHash || item.evidence_reference_hash).toLowerCase(),
    })).sort((left, right) => left.signerKey.localeCompare(right.signerKey)),
  }
}

function signingBinding(signing) {
  return {
    signingId: signing.signingId,
    signingRevision: signing.runtimeRevision,
    signingBindingFingerprint: signing.bindingFingerprint,
    completionFingerprint: signing.completionFingerprint,
    documentId: signing.documentId,
    planId: signing.planId,
    planVersion: signing.planVersion,
    transactionId: signing.transactionId,
    organisationId: signing.organisationId,
    lane: signing.lane,
    contentFingerprint: signing.contentFingerprint,
    provenanceFingerprint: signing.provenanceFingerprint,
    finalArtifactHash: signing.signedDocumentEvidence?.finalArtifactHash || null,
    signedDocumentId: signing.signedDocumentEvidence?.signedDocumentId || null,
    signedDocumentVersionId: signing.signedDocumentEvidence?.signedDocumentVersionId || null,
    completionCertificateHash: signing.signedDocumentEvidence?.completionCertificateHash || null,
    completedAt: signing.signedDocumentEvidence?.completedAt || null,
  }
}

function planBinding(plan) {
  return {
    signingPlanId: plan.signingPlanId,
    signingPlanRevision: plan.revision,
    signingPlanFingerprint: plan.fingerprint,
    documentId: plan.document.documentId,
    documentKey: plan.document.documentKey,
    documentKind: plan.document.documentKind,
    lane: plan.document.lane,
    contentFingerprint: plan.document.contentFingerprint,
    provenanceFingerprint: plan.document.provenanceFingerprint,
  }
}

function appointmentBindings(appointments = []) {
  return appointments.map((item) => ({
    appointmentId: item.appointmentId,
    bindingFingerprint: item.bindingFingerprint,
    fingerprint: item.fingerprint,
    status: item.status,
    signingPlanId: item.signingPlan?.signingPlanId,
    signingPlanFingerprint: item.signingPlan?.signingPlanFingerprint,
  })).sort((left, right) => left.appointmentId.localeCompare(right.appointmentId))
}

function check(id, label, passed, detail, severity = 'critical') {
  return { id, label, severity, status: passed ? 'passed' : 'failed', detail }
}

function compareSignerContracts(signers, signing) {
  const expected = signers.map((item) => ({ ...item, allowedMethods: [...item.allowedMethods].sort() })).sort((left, right) => left.signerKey.localeCompare(right.signerKey))
  const actual = (signing.signerContract || []).map((item) => ({
    signerKey: item.signerKey,
    signerRole: item.signerRole,
    signerReferenceHash: item.signerReferenceHash,
    signingOrder: item.signingOrder,
    required: item.required,
    allowedMethods: [...(item.allowedMethods || [])].sort(),
  })).sort((left, right) => left.signerKey.localeCompare(right.signerKey))
  return JSON.stringify(expected) === JSON.stringify(actual)
}

function fieldCoverage(plan, inspection) {
  const failed = []
  const assignmentMap = new Map(plan.fieldAssignments.map((item) => [item.fieldKey, item]))
  for (const field of plan.document.signingFields.filter((item) => item.required)) {
    const assignment = assignmentMap.get(field.fieldKey)
    const valid = inspection.fieldResults.filter((item) => item.fieldKey === field.fieldKey && item.fieldType === field.fieldType && item.status === 'valid' && assignment?.signerKeys.includes(item.signerKey))
    if (!assignment || valid.length < assignment.quorum.minimumRequired) failed.push(field.fieldKey)
  }
  return failed
}

function evaluateSources({ plan, signing, inspection, appointments, asOf }) {
  const signingStates = new Map((signing.signerStates || []).map((item) => [item.signerKey, item]))
  const signingContract = new Map((signing.signerContract || []).map((item) => [item.signerKey, item]))
  const wetInkSigners = (signing.signerStates || []).filter((item) => item.status === 'signed' && item.signatureEvidence?.method === 'wet_ink').map((item) => item.signerKey)
  const coverageFailures = fieldCoverage(plan, inspection)
  const fieldKeys = new Set(plan.document.signingFields.map((item) => item.fieldKey))
  const signerKeys = new Set(plan.participants.map((item) => item.signerKey))
  const exactFieldManifest = inspection.fieldResults.every((item) => fieldKeys.has(item.fieldKey) && signerKeys.has(item.signerKey) && item.status === 'valid' && Number.isInteger(item.pageNumber) && item.pageNumber >= 1 && item.pageNumber <= inspection.pageCount && sha(item.evidenceReferenceHash))
  const signingOrderAndMethod = plan.participants.filter((participant) => participant.required).every((participant) => {
    const state = signingStates.get(participant.signerKey)
    const contract = signingContract.get(participant.signerKey)
    return Boolean(state?.status === 'signed' && contract?.signingOrder === participant.signingOrder && participant.allowedMethods.includes(state.signatureEvidence?.method))
  })
  const identityEvidence = (signing.signerStates || []).filter((item) => signingContract.get(item.signerKey)?.required).every((item) => sha(item.signatureEvidence?.identityVerification?.referenceHash))
  const originalMap = new Map(inspection.originalsEvidence.map((item) => [item.signerKey, item]))
  const originalsComplete = wetInkSigners.every((signerKey) => {
    const original = originalMap.get(signerKey)
    const signedAt = signingStates.get(signerKey)?.signatureEvidence?.signedAt
    return Boolean(original?.originalReceived && original.receivedAt && sha(original.evidenceReferenceHash) && (!signedAt || new Date(original.receivedAt) >= new Date(signedAt)) && new Date(original.receivedAt) <= new Date(asOf))
  })
  const appointmentCoverage = wetInkSigners.every((signerKey) => appointments.some((appointment) => appointment.status === CONVEYANCER_SIGNING_APPOINTMENT_STATUSES.completed
    && appointment.signingPlan?.signingPlanId === plan.signingPlanId
    && appointment.signingPlan?.signingPlanFingerprint === plan.fingerprint
    && appointment.attendees?.some((attendee) => attendee.signerKey === signerKey && [CONVEYANCER_SIGNING_APPOINTMENT_ATTENDANCE_STATUSES.attended, CONVEYANCER_SIGNING_APPOINTMENT_ATTENDANCE_STATUSES.late].includes(attendee.attendanceStatus))))
  const witnessFields = plan.document.signingFields.filter((item) => ['witness', 'commissioner'].includes(item.signerRole) && item.required).map((item) => item.fieldKey)
  const witnessComplete = witnessFields.every((fieldKey) => !coverageFailures.includes(fieldKey))
  return [
    check('artifact_integrity', 'Final artifact and completion certificate match C7', inspection.signedDocumentId === signing.signedDocumentEvidence?.signedDocumentId && inspection.signedDocumentVersionId === signing.signedDocumentEvidence?.signedDocumentVersionId && inspection.artifactHash === signing.signedDocumentEvidence?.finalArtifactHash && inspection.completionCertificateHash === signing.signedDocumentEvidence?.completionCertificateHash, 'Signed artifact and certificate must match the completed C7 record.'),
    check('page_integrity', 'Reviewed pack has the expected complete page set', Number.isInteger(inspection.pageCount) && inspection.pageCount === signing.renderEvidence?.pageCount, `Expected ${signing.renderEvidence?.pageCount || 0} page(s); inspected ${inspection.pageCount || 0}.`),
    check('signer_contract', 'C7 signers match the exact approved D2 plan', compareSignerContracts(plan.c7Signers, signing), 'Signer identity, role, order, requirement and method contract compared.'),
    check('signature_and_initial_coverage', 'Every required field meets its D2 quorum', coverageFailures.length === 0 && exactFieldManifest, coverageFailures.length ? `Insufficient field coverage: ${coverageFailures.join(', ')}.` : exactFieldManifest ? 'Required field quorum met.' : 'Field inspection manifest contains invalid or unknown evidence.'),
    check('signing_order_and_method', 'Signing order and methods comply with D2', signingOrderAndMethod, 'C7 state compared with D2 order and allowed methods.'),
    check('identity_and_capacity', 'C7 identity evidence remains bound to approved D2 signers', identityEvidence, 'Required signed states checked for identity evidence.'),
    check('witnessing_and_commissioning', 'Witness and commissioner fields are complete where required', witnessComplete, witnessComplete ? 'Required witness and commissioner fields complete.' : 'Witness or commissioner execution is incomplete.'),
    check('execution_dates', 'Execution dates are complete and coherent', inspection.executionDatesConfirmed, 'Inspector confirmation required.'),
    check('legibility_and_alterations', 'Pack is legible and has no unauthorised alteration', inspection.legibilityConfirmed && !inspection.unauthorisedAlterationsFound, inspection.unauthorisedAlterationsFound ? 'Unauthorised alteration recorded.' : inspection.legibilityConfirmed ? 'Legibility and alterations check passed.' : 'Legibility not confirmed.'),
    check('wet_ink_originals_and_session', 'Wet-ink originals and appointment attendance are evidenced', originalsComplete && appointmentCoverage, wetInkSigners.length ? `${wetInkSigners.length} wet-ink signer(s) checked.` : 'No wet-ink signer; control not applicable.'),
  ]
}

function sourceSnapshot(review = {}) {
  return stable({
    version: review.version,
    signedPackReviewId: review.signedPackReviewId,
    signing: review.signing,
    signingPlan: review.signingPlan,
    appointments: review.appointments,
    inspection: review.inspection,
    checks: review.checks,
    findings: review.findings,
    startedAt: review.startedAt,
    startedBy: review.startedBy,
    startCommandId: review.startCommandId,
  })
}

export function buildConveyancerSignedPackReviewBindingFingerprint(review = {}) {
  return fnv(sourceSnapshot(review))
}

function runtimeSnapshot(review = {}) {
  return stable({
    status: review.status,
    reviewDecision: review.reviewDecision,
    acceptance: review.acceptance,
    runtimeRevision: review.runtimeRevision,
    updatedAt: review.updatedAt,
    lastEventId: review.lastEventId,
  })
}

function auditRuntimeSnapshot(review = {}) {
  return stable({
    status: review.status,
    reviewDecision: review.reviewDecision ? { type: review.reviewDecision.type, reasonCode: review.reviewDecision.reasonCode || null, reviewedAt: review.reviewDecision.reviewedAt, reviewedBy: review.reviewDecision.reviewedBy, controls: review.reviewDecision.controls || null } : null,
    acceptance: review.acceptance ? { acceptedAt: review.acceptance.acceptedAt, acceptedBy: review.acceptance.acceptedBy } : null,
    runtimeRevision: review.runtimeRevision,
    updatedAt: review.updatedAt,
    lastEventId: review.lastEventId,
  })
}

export function buildConveyancerSignedPackReviewFingerprint(review = {}) {
  return fnv({ bindingFingerprint: review.bindingFingerprint, runtime: runtimeSnapshot(review) })
}

function validateReview(review = {}) {
  const errors = []
  if (review.version !== CONVEYANCER_SIGNED_PACK_REVIEW_VERSION) errors.push('signed_pack_review_version_invalid')
  if (!review.signedPackReviewId || !review.signing?.signingId || !review.signingPlan?.signingPlanId || !review.inspection?.inspectionId) errors.push('signed_pack_review_identity_required')
  if (!STATUSES.has(review.status)) errors.push('signed_pack_review_status_invalid')
  if (!authorised(review.startedBy, CAP.start, review.signing?.lane)) errors.push('signed_pack_review_starter_invalid')
  if (!review.startedAt || !review.startCommandId || !Number.isInteger(review.runtimeRevision) || review.runtimeRevision < 1 || !review.updatedAt || !review.lastEventId) errors.push('signed_pack_review_runtime_invalid')
  if (!Array.isArray(review.checks) || review.checks.length !== CONVEYANCER_SIGNED_PACK_REVIEW_CONTROLS.length || review.checks.some((item) => !['passed', 'failed'].includes(item.status))) errors.push('signed_pack_review_checks_invalid')
  if (!Array.isArray(review.findings) || review.findings.some((item) => !item.findingId || !item.checkId || !['critical', 'major'].includes(item.severity))) errors.push('signed_pack_review_findings_invalid')
  if (review.status === STATUS.acceptanceRecommended && (!review.reviewDecision?.reviewedAt || !authorised(review.reviewDecision?.reviewedBy, CAP.review, review.signing?.lane, false) || !review.reviewDecision?.summary || !review.reviewDecision?.controls || Object.values(review.reviewDecision.controls).some((value) => value !== true))) errors.push('signed_pack_recommendation_invalid')
  if ([STATUS.changesRequested, STATUS.rejected].includes(review.status) && (!review.reviewDecision?.reasonCode || !review.reviewDecision?.decisionReferenceId || !review.reviewDecision?.reviewedAt || !authorised(review.reviewDecision?.reviewedBy, review.status === STATUS.rejected ? CAP.reject : CAP.review, review.signing?.lane, false))) errors.push('signed_pack_negative_decision_invalid')
  if (review.status === STATUS.accepted && (!review.acceptance?.acceptedAt || !review.acceptance?.decisionReferenceId || !review.acceptance?.summary || !authorised(review.acceptance?.acceptedBy, CAP.accept, review.signing?.lane, false))) errors.push('signed_pack_acceptance_invalid')
  if (review.status !== STATUS.accepted && review.acceptance) errors.push('signed_pack_acceptance_only_allowed_when_accepted')
  if (review.bindingFingerprint !== buildConveyancerSignedPackReviewBindingFingerprint(review)) errors.push('signed_pack_review_binding_fingerprint_invalid')
  if (review.fingerprint !== buildConveyancerSignedPackReviewFingerprint(review)) errors.push('signed_pack_review_fingerprint_invalid')
  if (review.persistencePerformed || review.dispatchPerformed || review.registrationUpdated || review.documentMoved) errors.push('signed_pack_review_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), review })
}

export function validateConveyancerSignedPackReview(input = {}) {
  return validateReview(clone(input))
}

function event(review, { commandId, commandType, commandFingerprint = null, performedBy, occurredAt, before }) {
  const eventId = `signed_pack_review_event:${review.signedPackReviewId}:${review.runtimeRevision}:${commandId}`
  review.lastEventId = eventId
  return deepFreeze({
    version: CONVEYANCER_SIGNED_PACK_REVIEW_VERSION,
    eventId,
    eventType: commandType === 'start_review' ? 'signed_pack_review_started' : `signed_pack_${commandType}`,
    commandId,
    commandType,
    commandFingerprint,
    signedPackReviewId: review.signedPackReviewId,
    signingId: review.signing.signingId,
    signingPlanId: review.signingPlan.signingPlanId,
    documentId: review.signing.documentId,
    lane: review.signing.lane,
    bindingFingerprint: review.bindingFingerprint,
    occurredAt,
    performedBy,
    before,
    after: auditRuntimeSnapshot(review),
    reviewRevision: review.runtimeRevision,
    persistencePerformed: false,
    dispatchPerformed: false,
    registrationUpdated: false,
    documentMoved: false,
  })
}

export function startConveyancerSignedPackReview({
  signingPlan: inputPlan = {},
  capacityRecords = [],
  signing: inputSigning = {},
  appointments: inputAppointments = [],
  inspection: inputInspection = {},
  actor: inputActor = {},
  occurredAt = '',
  commandId = '',
  existingReviews = [],
} = {}) {
  const startedAt = iso(occurredAt)
  const resolvedCommandId = text(commandId)
  if (!startedAt || !resolvedCommandId) return fail('valid_signed_pack_review_start_required')
  const signingValidation = validateConveyancerLegalInstrumentSigningEvidence(inputSigning)
  if (!signingValidation.valid) return fail('c7_signing_evidence_invalid', signingValidation.errors)
  const signing = signingValidation.signing
  if (signing.status !== CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_STATUSES.completed) return fail('completed_c7_signing_required')
  const planValidation = validateConveyancerSigningPlan(inputPlan, { capacityRecords, asOf: inputPlan.assessment?.assessedAt })
  if (!planValidation.valid) return fail('d2_signing_plan_invalid', planValidation.errors)
  const plan = planValidation.plan
  if (plan.assessment.status !== CONVEYANCER_SIGNING_PLAN_STATUSES.ready) return fail('ready_d2_signing_plan_required')
  const projection = buildConveyancerSigningPlanC7SignerContract(plan, { capacityRecords, asOf: plan.assessment.assessedAt })
  if (!projection.ok) return fail('d2_c7_projection_invalid', projection.errors)
  const sourceMatches = signing.documentId === plan.document.documentId && signing.planId === plan.document.planId && Number(signing.planVersion) === Number(plan.document.planVersion) && signing.transactionId === plan.document.transactionId && signing.organisationId === plan.document.organisationId && signing.lane === plan.document.lane && signing.contentFingerprint === plan.document.contentFingerprint && signing.provenanceFingerprint === plan.document.provenanceFingerprint
  if (!sourceMatches) return fail('d2_c7_source_binding_mismatch')
  if (!compareSignerContracts(projection.signers, signing)) return fail('d2_c7_signer_contract_mismatch')
  const starter = actor(inputActor)
  if (!authorised(starter, CAP.start, signing.lane)) return fail('signed_pack_review_start_not_authorised')
  const appointmentErrors = []
  const appointments = (Array.isArray(inputAppointments) ? inputAppointments : []).map((item, index) => {
    const validation = validateConveyancerSigningAppointmentWorkflow(item)
    if (!validation.valid) appointmentErrors.push(...validation.errors.map((error) => `appointment_${index}:${error}`))
    return validation.appointment
  })
  if (appointmentErrors.length) return fail('d3_signing_appointment_invalid', appointmentErrors)
  const inspection = normalizeInspection(inputInspection)
  const inspectionErrors = []
  if (!inspection.inspectionId || !inspection.inspectedAt || !authorised(inspection.inspectedBy, CAP.start, signing.lane) || new Date(inspection.inspectedAt) < new Date(signing.signedDocumentEvidence.completedAt) || new Date(inspection.inspectedAt) > new Date(startedAt)) inspectionErrors.push('signed_pack_inspection_evidence_invalid')
  if (inspection.fieldResults.some((item) => !item.fieldKey || !item.signerKey || !FIELD_RESULTS.has(item.status))) inspectionErrors.push('signed_pack_field_result_invalid')
  if (inspectionErrors.length) return fail('signed_pack_inspection_invalid', inspectionErrors)
  const reviewId = `signed_pack_review:${signing.signingId}`
  const evaluatedPlan = { ...plan, c7Signers: projection.signers }
  const checks = evaluateSources({ plan: evaluatedPlan, signing, inspection, appointments, asOf: startedAt })
  const findings = checks.filter((item) => item.status === 'failed').map((item) => ({ findingId: `finding:${item.id}`, checkId: item.id, severity: ['page_integrity', 'signature_and_initial_coverage', 'wet_ink_originals_and_session', 'witnessing_and_commissioning', 'execution_dates', 'legibility_and_alterations'].includes(item.id) ? 'major' : 'critical', detail: item.detail }))
  const duplicate = (Array.isArray(existingReviews) ? existingReviews : []).find((item) => text((item.review || item).signing?.signingId) === signing.signingId)
  if (duplicate) {
    const existing = duplicate.review || duplicate
    if (existing.startCommandId !== resolvedCommandId) return fail('signed_pack_review_already_exists')
    if (existing.startedBy?.role !== starter.role || existing.startedBy?.userId !== starter.userId) return fail('signed_pack_review_start_command_id_conflict')
    const proposedBindingFingerprint = buildConveyancerSignedPackReviewBindingFingerprint({
      version: CONVEYANCER_SIGNED_PACK_REVIEW_VERSION,
      signedPackReviewId: reviewId,
      signing: signingBinding(signing),
      signingPlan: planBinding(plan),
      appointments: appointmentBindings(appointments),
      inspection,
      checks,
      findings,
      startedAt,
      startedBy: starter,
      startCommandId: resolvedCommandId,
    })
    if (existing.bindingFingerprint !== proposedBindingFingerprint) return fail('signed_pack_review_start_command_id_conflict')
    return deepFreeze({ ok: true, duplicate: true, code: 'idempotent_replay', errors: [], review: clone(existing), event: clone(duplicate.event || null) })
  }
  const review = {
    version: CONVEYANCER_SIGNED_PACK_REVIEW_VERSION,
    signedPackReviewId: reviewId,
    signing: signingBinding(signing),
    signingPlan: planBinding(plan),
    appointments: appointmentBindings(appointments),
    inspection,
    checks,
    findings,
    status: STATUS.pendingReview,
    reviewDecision: null,
    acceptance: null,
    startedAt,
    startedBy: starter,
    startCommandId: resolvedCommandId,
    bindingFingerprint: null,
    fingerprint: null,
    runtimeRevision: 1,
    updatedAt: startedAt,
    lastEventId: null,
    persistencePerformed: false,
    dispatchPerformed: false,
    registrationUpdated: false,
    documentMoved: false,
  }
  review.bindingFingerprint = buildConveyancerSignedPackReviewBindingFingerprint(review)
  const auditEvent = event(review, { commandId: resolvedCommandId, commandType: 'start_review', performedBy: starter, occurredAt: startedAt, before: { status: 'not_started', runtimeRevision: 0 } })
  review.fingerprint = buildConveyancerSignedPackReviewFingerprint(review)
  const validation = validateReview(review)
  if (!validation.valid) return fail('resulting_signed_pack_review_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: findings.length ? 'signed_pack_review_started_with_findings' : 'signed_pack_review_started', errors: [], review, event: auditEvent })
}

export function buildConveyancerSignedPackReviewCommand(review = {}, type, payload = {}) {
  return {
    commandId: `${key(type)}:${review.runtimeRevision}`,
    type: key(type),
    expectedReviewId: review.signedPackReviewId,
    expectedRuntimeRevision: review.runtimeRevision,
    expectedFingerprint: review.fingerprint,
    ...payload,
  }
}

function expectedBinding(review, command) {
  if (text(command.expectedReviewId || command.expected_review_id) !== review.signedPackReviewId) return 'stale_signed_pack_review_id'
  if (Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision) !== review.runtimeRevision) return 'stale_signed_pack_review_revision'
  if (text(command.expectedFingerprint || command.expected_fingerprint) !== review.fingerprint) return 'stale_signed_pack_review_fingerprint'
  return null
}

function commandFingerprint(type, command, performedBy) {
  const { commandId: _commandId, expectedFingerprint: _expectedFingerprint, expected_fingerprint: _expectedFingerprintSnake, ...payload } = command
  return fnv({ type, payload, performedBy })
}

function normalizeControls(input = {}) {
  return Object.fromEntries(CONVEYANCER_SIGNED_PACK_REVIEW_CONTROLS.map((item) => [item.key, input[item.key] === true]))
}

function applyCommand(review, type, command, performedBy, occurredAt) {
  const lane = review.signing.lane
  if (type === COMMAND.recommendAcceptance) {
    if (!authorised(performedBy, CAP.review, lane, false)) return 'signed_pack_review_not_authorised'
    if (review.status !== STATUS.pendingReview) return 'signed_pack_not_pending_review'
    if (review.findings.length || review.checks.some((item) => item.status !== 'passed')) return 'signed_pack_findings_must_be_cleared_by_new_pack'
    const controls = normalizeControls(command.controls || {})
    if (Object.values(controls).some((value) => !value)) return 'signed_pack_review_controls_incomplete'
    const summary = text(command.summary)
    if (!summary) return 'signed_pack_review_summary_required'
    review.status = STATUS.acceptanceRecommended
    review.reviewDecision = { type: 'acceptance_recommended', summary, controls, reviewedAt: occurredAt, reviewedBy: performedBy }
    return null
  }
  if (type === COMMAND.requestCorrection) {
    if (!authorised(performedBy, CAP.review, lane, false)) return 'signed_pack_correction_request_not_authorised'
    if (![STATUS.pendingReview, STATUS.acceptanceRecommended].includes(review.status)) return 'signed_pack_not_reviewable'
    const reasonCode = key(command.reasonCode || command.reason_code)
    const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id)
    if (!reasonCode || !decisionReferenceId) return 'signed_pack_correction_decision_required'
    review.status = STATUS.changesRequested
    review.reviewDecision = { type: 'changes_requested', reasonCode, decisionReferenceId, summary: text(command.summary) || null, reviewedAt: occurredAt, reviewedBy: performedBy }
    return null
  }
  if (type === COMMAND.accept) {
    if (!authorised(performedBy, CAP.accept, lane, false)) return 'signed_pack_acceptance_not_authorised'
    if (review.status !== STATUS.acceptanceRecommended) return 'signed_pack_acceptance_recommendation_required'
    const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id)
    const summary = text(command.summary)
    if (!decisionReferenceId || !summary) return 'signed_pack_acceptance_evidence_required'
    review.status = STATUS.accepted
    review.acceptance = { decisionReferenceId, summary, acceptedAt: occurredAt, acceptedBy: performedBy }
    return null
  }
  if (type === COMMAND.reject) {
    if (!authorised(performedBy, CAP.reject, lane, false)) return 'signed_pack_rejection_not_authorised'
    if (![STATUS.pendingReview, STATUS.acceptanceRecommended].includes(review.status)) return 'signed_pack_not_reviewable'
    const reasonCode = key(command.reasonCode || command.reason_code)
    const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id)
    if (!reasonCode || !decisionReferenceId) return 'signed_pack_rejection_decision_required'
    review.status = STATUS.rejected
    review.reviewDecision = { type: 'rejected', reasonCode, decisionReferenceId, summary: text(command.summary) || null, reviewedAt: occurredAt, reviewedBy: performedBy }
    return null
  }
  return 'signed_pack_review_command_unsupported'
}

export function executeConveyancerSignedPackReview({ review: input = {}, command = {}, actor: inputActor = {}, occurredAt = '', existingEvents = [] } = {}) {
  const currentValidation = validateReview(clone(input))
  if (!currentValidation.valid) return fail('signed_pack_review_contract_invalid', currentValidation.errors)
  const current = currentValidation.review
  const type = key(command.type)
  const commandId = text(command.commandId || command.command_id)
  const performedBy = actor(inputActor)
  const at = iso(occurredAt)
  if (!COMMANDS.has(type) || !commandId) return fail('valid_signed_pack_review_command_required')
  if (!at || new Date(at) < new Date(current.updatedAt)) return fail('signed_pack_review_command_chronology_invalid')
  if (TERMINAL.has(current.status)) return fail('signed_pack_review_terminal')
  const bindingError = expectedBinding(current, command)
  if (bindingError) return fail(bindingError)
  const hash = commandFingerprint(type, command, performedBy)
  const duplicate = (Array.isArray(existingEvents) ? existingEvents : []).find((item) => item.commandId === commandId)
  if (duplicate) {
    if (duplicate.commandFingerprint !== hash) return fail('signed_pack_review_command_id_conflict')
    return deepFreeze({ ok: true, duplicate: true, code: 'idempotent_replay', errors: [], review: current, event: duplicate })
  }
  const review = clone(current)
  const before = auditRuntimeSnapshot(review)
  const error = applyCommand(review, type, command, performedBy, at)
  if (error) return fail(error)
  review.runtimeRevision += 1
  review.updatedAt = at
  const auditEvent = event(review, { commandId, commandType: type, commandFingerprint: hash, performedBy, occurredAt: at, before })
  review.fingerprint = buildConveyancerSignedPackReviewFingerprint(review)
  const validation = validateReview(review)
  if (!validation.valid) return fail('resulting_signed_pack_review_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: `signed_pack_${type}_recorded`, errors: [], review, event: auditEvent })
}
