import assert from 'node:assert/strict'
import { runConveyancerLegalInstrumentPilotScenario } from '../conveyancerLegalInstrumentPilot.js'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS as COMMAND,
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CONTROLS,
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_STATUSES as STATUS,
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_VERSION,
  executeConveyancerLegalInstrumentReview,
  startConveyancerLegalInstrumentReview,
  validateConveyancerLegalInstrumentReview,
} from '../conveyancerLegalInstrumentReview.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const generatedAt = '2026-07-15T10:00:00.000Z'
const submittedAt = '2026-07-15T10:05:00.000Z'
const reviewedAt = '2026-07-15T10:10:00.000Z'
const approvedAt = '2026-07-15T10:15:00.000Z'

function artifacts(scenarioId = 'residential_transfer_instruction') {
  const result = runConveyancerLegalInstrumentPilotScenario({ scenarioId, generatedAt, includeArtifacts: true })
  assert.equal(result.passed, true, JSON.stringify(result.errors))
  return structuredClone(result.artifacts)
}

function submit(scenarioId = 'residential_transfer_instruction', overrides = {}) {
  const evidence = artifacts(scenarioId)
  const result = startConveyancerLegalInstrumentReview({
    ...evidence,
    generationEvent: evidence.event,
    actor: evidence.document.generatedBy,
    occurredAt: submittedAt,
    commandId: `submit:${evidence.document.documentId}`,
    ...overrides,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return { evidence, result }
}

function controls() {
  return Object.fromEntries(CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CONTROLS.map((control) => [control.key, true]))
}

function boundCommand(review, type, payload = {}) {
  return {
    commandId: `${type}:${review.runtimeRevision}`,
    type,
    expectedReviewId: review.reviewId,
    expectedRuntimeRevision: review.runtimeRevision,
    expectedDocumentId: review.documentId,
    expectedContentFingerprint: review.contentFingerprint,
    expectedProvenanceFingerprint: review.provenanceFingerprint,
    ...payload,
  }
}

function execute(review, type, actor, payload = {}, occurredAt = reviewedAt, existingEvents = []) {
  return executeConveyancerLegalInstrumentReview({
    review,
    command: boundCommand(review, type, payload),
    actor,
    occurredAt,
    existingEvents,
  })
}

const transferReviewer = { role: 'transfer_attorney', userId: 'transfer-reviewer-c6' }
const transferApprover = { role: 'conveyancer', userId: 'transfer-approver-c6' }

test('submits an intact C5-assured draft into immutable review without side effects', () => {
  const { result } = submit()
  assert.equal(result.review.version, CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_VERSION)
  assert.equal(result.review.status, STATUS.pendingReview)
  assert.equal(result.review.runtimeRevision, 1)
  assert.equal(result.review.c5Assurance.decision, 'ready')
  assert.equal(Object.isFrozen(result.review), true)
  for (const flag of ['approvedForRelease', 'renderingAllowed', 'persistenceAllowed', 'signingAllowed', 'dispatchAllowed']) assert.equal(result.review[flag], false, flag)
  for (const flag of ['renderingPerformed', 'persistencePerformed', 'signingPerformed', 'dispatchPerformed']) assert.equal(result.event[flag], false, flag)
})

test('accepts an observed warning draft but records every warning for acknowledgement', () => {
  const { result } = submit('warning_requires_attorney_review')
  assert.equal(result.review.c5Assurance.decision, 'observe')
  assert.ok(result.review.warningCodes.length > 0)
  const incomplete = execute(result.review, COMMAND.recommendApproval, transferReviewer, { controls: controls(), summary: 'Reviewed warning draft.' })
  assert.equal(incomplete.code, 'data_warning_acknowledgement_incomplete')
  const complete = execute(result.review, COMMAND.recommendApproval, transferReviewer, {
    controls: controls(),
    summary: 'Warning reviewed against source evidence.',
    acknowledgedWarningCodes: result.review.warningCodes,
  })
  assert.equal(complete.ok, true, JSON.stringify(complete.errors))
})

test('blocks review submission when independent C5 assurance detects tampering', () => {
  const evidence = artifacts()
  evidence.document.renderModel.sections[0].body += '\nUnapproved alteration.'
  const result = startConveyancerLegalInstrumentReview({
    ...evidence,
    generationEvent: evidence.event,
    actor: evidence.document.generatedBy,
    occurredAt: submittedAt,
    commandId: 'submit:tampered',
  })
  assert.equal(result.code, 'c5_legal_instrument_assurance_blocked')
  assert.ok(result.errors.includes('content_fingerprint_integrity'))
})

test('requires complete legal controls and an independent reviewer', () => {
  const { result } = submit()
  const selfReview = execute(result.review, COMMAND.recommendApproval, result.review.preparer, { controls: controls(), summary: 'Self review.' })
  assert.equal(selfReview.code, 'independent_legal_review_required')
  const partialControls = controls()
  delete partialControls.legal_wording_and_clauses
  const incomplete = execute(result.review, COMMAND.recommendApproval, transferReviewer, { controls: partialControls, summary: 'Partial review.' })
  assert.equal(incomplete.code, 'review_controls_incomplete')
})

test('records a legal recommendation then a separately evidenced final approval', () => {
  const { result } = submit()
  const reviewed = execute(result.review, COMMAND.recommendApproval, transferReviewer, { controls: controls(), summary: 'All six legal controls confirmed.' })
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.errors))
  assert.equal(reviewed.review.status, STATUS.reviewed)
  const approved = execute(reviewed.review, COMMAND.approve, transferApprover, {
    summary: 'Final decision recorded after recommendation.',
    decisionReferenceId: 'approval-register-c6-001',
  }, approvedAt)
  assert.equal(approved.ok, true, JSON.stringify(approved.errors))
  assert.equal(approved.review.status, STATUS.approved)
  assert.equal(approved.review.approvedForRelease, true)
  assert.match(approved.review.approval.approvalFingerprint, /^[a-f0-9]{64}$/)
  assert.equal(approved.review.approval.reviewEventId, reviewed.event.eventId)
  for (const flag of ['renderingAllowed', 'persistenceAllowed', 'signingAllowed', 'dispatchAllowed']) assert.equal(approved.review[flag], false, flag)
})

test('does not permit approval without a recommendation or by the preparer', () => {
  const { result } = submit()
  const premature = execute(result.review, COMMAND.approve, transferApprover, { summary: 'Too soon.', decisionReferenceId: 'x' })
  assert.equal(premature.code, 'final_approval_requires_review_recommendation')
  const reviewed = execute(result.review, COMMAND.recommendApproval, transferReviewer, { controls: controls(), summary: 'Reviewed.' })
  const selfApproval = execute(reviewed.review, COMMAND.approve, result.review.preparer, { summary: 'Self approval.', decisionReferenceId: 'x' }, approvedAt)
  assert.equal(selfApproval.code, 'independent_final_approval_required')
})

test('enforces legal-lane authority for transfer, bond and cancellation reviews', () => {
  const transfer = submit().result.review
  assert.equal(execute(transfer, COMMAND.recommendApproval, { role: 'bond_attorney', userId: 'wrong-lane' }, { controls: controls(), summary: 'Wrong lane.' }).code, 'review_actor_lane_not_authorised')

  for (const [scenarioId, role] of [['bank_bond_application', 'bond_attorney'], ['lender_cancellation_instruction', 'cancellation_attorney']]) {
    const review = submit(scenarioId).result.review
    const decision = execute(review, COMMAND.recommendApproval, { role, userId: `${role}-reviewer` }, { controls: controls(), summary: 'Correct legal lane reviewed.' })
    assert.equal(decision.ok, true, `${scenarioId}: ${JSON.stringify(decision.errors)}`)
  }
})

test('makes change requests and rejection terminal for that immutable document version', () => {
  const first = submit().result.review
  const changes = execute(first, COMMAND.requestChanges, transferReviewer, {
    reason: 'Execution block requires correction.',
    changeRequests: [{ category: 'execution', description: 'Correct the signatory capacity.' }],
  })
  assert.equal(changes.review.status, STATUS.changesRequested)
  assert.equal(execute(changes.review, COMMAND.recommendApproval, transferReviewer, { controls: controls(), summary: 'Retry.' }).code, 'terminal_legal_instrument_review')

  const cancellation = submit('lender_cancellation_instruction').result.review
  const rejected = execute(cancellation, COMMAND.reject, { role: 'cancellation_attorney', userId: 'cancel-reviewer' }, { reason: 'Instruction authority is not acceptable.' })
  assert.equal(rejected.review.status, STATUS.rejected)
})

test('rejects stale revisions and exact-document fingerprint mismatches', () => {
  const { result } = submit()
  const staleRevision = boundCommand(result.review, COMMAND.recommendApproval, { controls: controls(), summary: 'Review.' })
  staleRevision.expectedRuntimeRevision = 0
  assert.equal(executeConveyancerLegalInstrumentReview({ review: result.review, command: staleRevision, actor: transferReviewer, occurredAt: reviewedAt }).code, 'stale_review_revision')
  const staleContent = boundCommand(result.review, COMMAND.recommendApproval, { controls: controls(), summary: 'Review.' })
  staleContent.expectedContentFingerprint = '0'.repeat(64)
  assert.equal(executeConveyancerLegalInstrumentReview({ review: result.review, command: staleContent, actor: transferReviewer, occurredAt: reviewedAt }).code, 'stale_review_content_fingerprint')
})

test('provides idempotent submission and decision replay', () => {
  const { evidence, result } = submit()
  const duplicateSubmission = startConveyancerLegalInstrumentReview({
    ...evidence,
    generationEvent: evidence.event,
    actor: evidence.document.generatedBy,
    occurredAt: submittedAt,
    commandId: result.review.submissionCommandId,
    existingReviews: [{ review: result.review, event: result.event }],
  })
  assert.equal(duplicateSubmission.duplicate, true)
  const conflictingSubmitter = startConveyancerLegalInstrumentReview({
    ...evidence,
    generationEvent: evidence.event,
    actor: { ...evidence.document.generatedBy, userId: 'different-submitter' },
    occurredAt: submittedAt,
    commandId: result.review.submissionCommandId,
    existingReviews: [{ review: result.review, event: result.event }],
  })
  assert.equal(conflictingSubmitter.code, 'submission_command_id_conflict')
  const recommendationCommand = boundCommand(result.review, COMMAND.recommendApproval, { controls: controls(), summary: 'Reviewed.' })
  const reviewed = executeConveyancerLegalInstrumentReview({ review: result.review, command: recommendationCommand, actor: transferReviewer, occurredAt: reviewedAt })
  const replay = executeConveyancerLegalInstrumentReview({
    review: reviewed.review,
    command: recommendationCommand,
    actor: transferReviewer,
    occurredAt: reviewedAt,
    existingEvents: [reviewed.event],
  })
  assert.equal(replay.duplicate, true)
  const conflict = executeConveyancerLegalInstrumentReview({
    review: reviewed.review,
    command: { ...boundCommand(reviewed.review, COMMAND.approve), commandId: reviewed.event.commandId, summary: 'Different command.', decisionReferenceId: 'different' },
    actor: transferReviewer,
    occurredAt: approvedAt,
    existingEvents: [reviewed.event],
  })
  assert.equal(conflict.code, 'review_command_id_conflict')
})

test('detects immutable binding, authority and approval-evidence tampering', () => {
  const { result } = submit()
  const tamperedBinding = structuredClone(result.review)
  tamperedBinding.warningCodes.push('injected_warning')
  assert.ok(validateConveyancerLegalInstrumentReview(tamperedBinding).errors.includes('review_binding_fingerprint_invalid'))

  const reviewed = execute(result.review, COMMAND.recommendApproval, transferReviewer, { controls: controls(), summary: 'Reviewed.' })
  const invalidAuthority = structuredClone(reviewed.review)
  invalidAuthority.reviewDecision.decidedBy.role = 'client'
  assert.ok(validateConveyancerLegalInstrumentReview(invalidAuthority).errors.includes('legal_review_authority_invalid'))

  const approved = execute(reviewed.review, COMMAND.approve, transferApprover, { summary: 'Approved.', decisionReferenceId: 'register-2' }, approvedAt)
  const tamperedApproval = structuredClone(approved.review)
  tamperedApproval.approval.summary = 'Changed after approval.'
  assert.ok(validateConveyancerLegalInstrumentReview(tamperedApproval).errors.includes('approval_fingerprint_invalid'))
})

test('does not mutate inputs or disclose document content in audit events', () => {
  const { result } = submit()
  const before = structuredClone(result.review)
  const reviewed = execute(result.review, COMMAND.recommendApproval, transferReviewer, { controls: controls(), summary: 'Reviewed without copying source values.' })
  assert.deepEqual(result.review, before)
  const serialized = JSON.stringify(reviewed.event)
  assert.equal(serialized.includes('8001015009087'), false)
  assert.equal(serialized.includes('Erf 123 Pilot Township'), false)
})

console.log('conveyancer legal-instrument C6 review and approval tests passed')
