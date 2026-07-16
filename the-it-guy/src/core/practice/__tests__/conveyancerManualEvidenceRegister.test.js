import assert from 'node:assert/strict'
import {
  buildAttorneyEvidenceReviewQueue,
  buildEvidenceAuditEvent,
  buildEvidenceRegisterEntry,
  buildEvidenceReplacement,
  CANONICAL_EVIDENCE_TYPES,
  detectDuplicateEvidence,
  EVIDENCE_REVIEW_STATES,
  evaluateEvidenceQuality,
  projectApprovedCanonicalEvidence,
  transitionEvidenceReview,
} from '../conveyancerManualEvidenceRegister.js'

const org = '10000000-0000-4000-8000-000000000001'
const firm = '20000000-0000-4000-8000-000000000001'
const branch = '30000000-0000-4000-8000-000000000001'
const team = '40000000-0000-4000-8000-000000000001'
const matter = '50000000-0000-4000-8000-000000000001'
const attorney = '60000000-0000-4000-8000-000000000001'
const reviewer = '70000000-0000-4000-8000-000000000001'
const service = '80000000-0000-4000-8000-000000000001'
const profile = '90000000-0000-4000-8000-000000000001'
const at = '2026-07-16T12:00:00.000Z'
const hashA = `sha256:${'a'.repeat(64)}`
const hashB = `sha256:${'b'.repeat(64)}`

function identity(evidenceId = 'evidence:g3:1') {
  return { organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team, transactionId: matter, operationId: evidenceId, lane: 'transfer' }
}

function actor(role = 'responsible_attorney', userId = attorney) {
  return { userId, membershipId: `membership:${userId}`, role, organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team }
}

function policy() {
  return { policyId: 'evidence-policy:1', policyVersion: '1.0.0', policyFingerprint: 'fnv1a_1234abcd', effectiveAt: '2026-07-01T00:00:00Z' }
}

function capture(overrides = {}) {
  const evidenceId = overrides.evidenceId || 'evidence:g3:1'
  return buildEvidenceRegisterEntry({
    evidenceId,
    identity: identity(evidenceId),
    actor: actor(),
    policy: policy(),
    canonicalEvidenceType: CANONICAL_EVIDENCE_TYPES.bankGuarantee,
    source: { mode: 'manual', sourceReference: `upload://${evidenceId}`, capturedBy: attorney },
    issuingOrganisation: 'Example Bank',
    externalReference: 'GUAR-001',
    effectiveAt: '2026-07-15T00:00:00Z',
    receivedAt: at,
    expiresAt: '2026-08-16T00:00:00Z',
    documentReference: `document://${evidenceId}`,
    documentHash: hashA,
    requiredFields: ['amount', 'beneficiary'],
    confirmedFields: { amount: 1250000, beneficiary: 'Transfer Attorneys Trust' },
    ...overrides,
  })
}

function review(entry, toState, overrides = {}) {
  return transitionEvidenceReview({
    entry,
    toState,
    reviewer: actor('compliance', reviewer),
    reason: `Evidence moved to ${toState}.`,
    occurredAt: '2026-07-16T13:00:00Z',
    ...overrides,
  })
}

function accepted(overrides = {}) {
  const captured = capture(overrides)
  assert.equal(captured.ok, true, JSON.stringify(captured.errors))
  const underReview = review(captured.entry, EVIDENCE_REVIEW_STATES.underReview)
  assert.equal(underReview.ok, true, JSON.stringify(underReview.errors))
  const acceptedResult = review(underReview.entry, EVIDENCE_REVIEW_STATES.accepted, { occurredAt: '2026-07-16T14:00:00Z' })
  assert.equal(acceptedResult.ok, true, JSON.stringify(acceptedResult.errors))
  return acceptedResult.entry
}

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('defines the provider-dependent evidence vocabulary needed by A-F', () => {
  const values = Object.values(CANONICAL_EVIDENCE_TYPES)
  for (const required of ['cancellation_figures', 'bank_guarantee', 'transfer_duty_receipt', 'municipal_clearance_certificate', 'levy_clearance_certificate', 'deeds_lodgement', 'deeds_registration']) assert.ok(values.includes(required))
})

test('captures immutable manual evidence with G1 and G2 bindings', () => {
  const result = capture()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.entry.state, 'captured')
  assert.equal(result.entry.identity.transactionId, matter)
  assert.deepEqual(result.informationResource.classifications, ['financial', 'privileged'])
  assert.equal(Object.isFrozen(result.entry), true)
})

test('checks quality, completeness, dates and type-specific expiry', () => {
  const result = capture({ externalReference: '', expiresAt: '', confirmedFields: { amount: 1250000 } })
  assert.equal(result.ok, true)
  assert.equal(result.entry.quality.complete, false)
  assert.ok(result.entry.quality.issues.includes('evidence_external_reference_required'))
  assert.ok(result.entry.quality.issues.includes('evidence_expiry_date_required'))
  assert.ok(result.entry.quality.issues.includes('evidence_required_field_missing:beneficiary'))
  assert.equal(evaluateEvidenceQuality(result.entry).complete, false)
})

test('keeps OCR and AI extraction as proposals that cannot approve evidence', () => {
  const proposed = capture({ extractionProposal: { engine: 'ocr', engineVersion: '1', confidence: 0.94, proposedAt: at, proposedFields: { amount: 1250000 } } })
  assert.equal(proposed.ok, true)
  assert.equal(proposed.entry.extractionProposal.status, 'proposal_only')
  assert.equal(proposed.entry.state, 'captured')
  const selfApproved = capture({ acceptedAt: at, acceptedBy: attorney })
  assert.ok(selfApproved.errors.includes('evidence_capture_cannot_self_approve'))
})

test('requires authorised independent human review before acceptance', () => {
  const result = capture()
  const selfReview = transitionEvidenceReview({ entry: result.entry, toState: 'under_review', reviewer: actor(), reason: 'Self review.', occurredAt: at })
  assert.ok(selfReview.errors.includes('evidence_independent_review_required'))
  const secretaryReview = transitionEvidenceReview({ entry: result.entry, toState: 'under_review', reviewer: actor('conveyancing_secretary', reviewer), reason: 'Review.', occurredAt: at })
  assert.ok(secretaryReview.errors.includes('evidence_review_not_authorised'))
  const acceptedEntry = accepted()
  assert.equal(acceptedEntry.state, 'accepted')
  assert.equal(acceptedEntry.reviewedBy.userId, reviewer)
})

test('prevents incomplete evidence from being accepted but permits reasoned rejection', () => {
  const result = capture({ confirmedFields: {} })
  const underReview = review(result.entry, 'under_review')
  const acceptance = review(underReview.entry, 'accepted')
  assert.ok(acceptance.errors.includes('evidence_quality_incomplete'))
  const rejection = review(underReview.entry, 'rejected', { reason: 'Guarantee beneficiary is missing.' })
  assert.equal(rejection.ok, true)
})

test('supports replacement and explicit supersession lineage', () => {
  const predecessor = accepted()
  const replacementResult = buildEvidenceReplacement({ predecessor, replacement: {
    ...capture({ evidenceId: 'evidence:g3:2', externalReference: 'GUAR-002', documentHash: hashB }).entry,
    evidenceId: 'evidence:g3:2',
    identity: identity('evidence:g3:2'),
    actor: actor(),
    policy: policy(),
    source: { mode: 'manual', sourceReference: 'upload://evidence/g3/2', capturedBy: attorney },
  } })
  assert.equal(replacementResult.ok, true, JSON.stringify(replacementResult.errors))
  assert.equal(replacementResult.replacement.predecessorEvidenceId, predecessor.evidenceId)
  const superseded = review(predecessor, 'superseded', { replacementEvidenceId: replacementResult.replacement.evidenceId })
  assert.equal(superseded.ok, true, JSON.stringify(superseded.errors))
  assert.equal(superseded.entry.supersededByEvidenceId, 'evidence:g3:2')
})

test('supports withdrawal and date-controlled expiry', () => {
  const entry = accepted({ expiresAt: '2026-07-20T00:00:00Z' })
  const early = review(entry, 'expired', { occurredAt: '2026-07-19T00:00:00Z' })
  assert.ok(early.errors.includes('evidence_not_yet_expired'))
  const expired = review(entry, 'expired', { occurredAt: '2026-07-21T00:00:00Z' })
  assert.equal(expired.ok, true)
  const withdrawal = review(accepted({ evidenceId: 'evidence:g3:withdraw' }), 'withdrawn')
  assert.equal(withdrawal.ok, true)
})

test('flags exact and issuer-reference duplicates without merging records', () => {
  const existing = accepted()
  const candidate = capture({ evidenceId: 'evidence:g3:duplicate' }).entry
  const result = detectDuplicateEvidence(candidate, [existing])
  assert.equal(result.duplicate, true)
  assert.deepEqual(result.matches[0].reasons, ['same_document_hash', 'same_issuer_external_reference'])
  assert.equal(result.action, 'human_duplicate_review_required')
})

test('produces equivalent approved contracts for manual and integrated sources', () => {
  const manual = accepted({ evidenceId: 'evidence:g3:manual' })
  const integrationCapture = capture({
    evidenceId: 'evidence:g3:integration',
    actor: actor('service', service),
    source: { mode: 'integration', sourceReference: 'provider://guarantee/1', integrationProfileId: profile, providerEventId: 'event:g3:1' },
  })
  assert.equal(integrationCapture.ok, true, JSON.stringify(integrationCapture.errors))
  const integrationReview = review(integrationCapture.entry, 'under_review')
  const integrationAccepted = review(integrationReview.entry, 'accepted', { occurredAt: '2026-07-16T14:00:00Z' })
  assert.equal(integrationAccepted.ok, true, JSON.stringify(integrationAccepted.errors))
  const manualProjection = projectApprovedCanonicalEvidence(manual)
  const integrationProjection = projectApprovedCanonicalEvidence(integrationAccepted.entry)
  assert.equal(manualProjection.ok, true)
  assert.equal(integrationProjection.ok, true)
  assert.equal(manualProjection.evidence.equivalenceKey, integrationProjection.evidence.equivalenceKey)
  assert.equal('source' in manualProjection.evidence, false)
})

test('builds an attorney review queue prioritising expiry and quality problems', () => {
  const complete = capture({ evidenceId: 'evidence:g3:complete' }).entry
  const incomplete = capture({ evidenceId: 'evidence:g3:incomplete', confirmedFields: {} }).entry
  const expired = capture({ evidenceId: 'evidence:g3:expired', receivedAt: '2026-06-01T00:00:00Z', effectiveAt: '2026-05-01T00:00:00Z', expiresAt: '2026-07-01T00:00:00Z' }).entry
  const queue = buildAttorneyEvidenceReviewQueue({ entries: [complete, incomplete, expired, accepted({ evidenceId: 'evidence:g3:accepted' })], asOf: at })
  assert.equal(queue.count, 3)
  assert.equal(queue.items[0].evidenceId, 'evidence:g3:expired')
  assert.equal(queue.items[1].evidenceId, 'evidence:g3:incomplete')
})

test('records evidence lifecycle decisions in the common G1 audit shape', () => {
  const entry = accepted()
  const audit = buildEvidenceAuditEvent({ entry, eventId: 'audit:g3:1', actorUserId: reviewer, reason: 'Guarantee accepted after legal review.', occurredAt: entry.reviewedAt, detailReference: 'evidence-review://g3/1', detailHash: hashB })
  assert.equal(audit.ok, true, JSON.stringify(audit.errors))
  assert.equal(audit.event.eventType, 'evidence_accepted')
})

console.log('G3 manual-evidence register tests passed.')
