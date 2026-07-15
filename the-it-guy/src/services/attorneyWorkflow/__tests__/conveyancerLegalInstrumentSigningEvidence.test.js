import assert from 'node:assert/strict'
import { buildConveyancerGovernedContentHash } from '../conveyancerCorrespondenceGenerator.js'
import { runConveyancerLegalInstrumentPilotScenario } from '../conveyancerLegalInstrumentPilot.js'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS as REVIEW_COMMAND,
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CONTROLS,
  executeConveyancerLegalInstrumentReview,
  startConveyancerLegalInstrumentReview,
} from '../conveyancerLegalInstrumentReview.js'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_COMMANDS as COMMAND,
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_EVIDENCE_VERSION,
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_STATUSES as STATUS,
  executeConveyancerLegalInstrumentSigningEvidence,
  startConveyancerLegalInstrumentSigningEvidence,
  validateConveyancerLegalInstrumentSigningEvidence,
} from '../conveyancerLegalInstrumentSigningEvidence.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const t = {
  generated: '2026-07-15T10:00:00.000Z',
  submitted: '2026-07-15T10:05:00.000Z',
  reviewed: '2026-07-15T10:10:00.000Z',
  approved: '2026-07-15T10:15:00.000Z',
  rendered: '2026-07-15T10:20:00.000Z',
  prepared: '2026-07-15T10:25:00.000Z',
  viewed: '2026-07-15T10:30:00.000Z',
  signed: '2026-07-15T10:35:00.000Z',
  completed: '2026-07-15T10:40:00.000Z',
  expires: '2026-07-22T10:25:00.000Z',
}

const hash = (value) => buildConveyancerGovernedContentHash(value)
const controls = () => Object.fromEntries(CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CONTROLS.map((item) => [item.key, true]))

function reviewCommand(review, type, payload = {}) {
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

function approvedArtifacts(scenarioId = 'residential_transfer_instruction') {
  const pilot = runConveyancerLegalInstrumentPilotScenario({ scenarioId, generatedAt: t.generated, includeArtifacts: true })
  assert.equal(pilot.passed, true, JSON.stringify(pilot.errors))
  const artifacts = structuredClone(pilot.artifacts)
  const submitted = startConveyancerLegalInstrumentReview({ ...artifacts, generationEvent: artifacts.event, actor: artifacts.document.generatedBy, occurredAt: t.submitted, commandId: `submit:${artifacts.document.documentId}` })
  assert.equal(submitted.ok, true, JSON.stringify(submitted.errors))
  const reviewerRole = artifacts.document.lane === 'bond' ? 'bond_attorney' : artifacts.document.lane === 'cancellation' ? 'cancellation_attorney' : 'transfer_attorney'
  const reviewPayload = { controls: controls(), summary: 'Legal review completed.', acknowledgedWarningCodes: submitted.review.warningCodes }
  const reviewed = executeConveyancerLegalInstrumentReview({ review: submitted.review, command: reviewCommand(submitted.review, REVIEW_COMMAND.recommendApproval, reviewPayload), actor: { role: reviewerRole, userId: `${reviewerRole}-reviewer` }, occurredAt: t.reviewed })
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.errors))
  const approved = executeConveyancerLegalInstrumentReview({ review: reviewed.review, command: reviewCommand(reviewed.review, REVIEW_COMMAND.approve, { summary: 'Approved for signing preparation.', decisionReferenceId: 'approval-c7-1' }), actor: { role: reviewerRole, userId: `${reviewerRole}-approver` }, occurredAt: t.approved })
  assert.equal(approved.ok, true, JSON.stringify(approved.errors))
  return { artifacts, review: approved.review }
}

function renderEvidence(document, review, overrides = {}) {
  return {
    artifactId: `artifact:${document.documentId}`,
    artifactVersionId: `artifact-version:${document.documentId}:1`,
    artifactHash: hash(`rendered:${document.documentId}`),
    mimeType: 'application/pdf',
    pageCount: 4,
    rendererName: 'controlled-pdf-renderer',
    rendererVersion: '1.0.0',
    renderedAt: t.rendered,
    renderedBy: { role: 'system', userId: 'renderer-c7' },
    sourceDocumentId: document.documentId,
    sourceContentFingerprint: document.contentFingerprint,
    sourceProvenanceFingerprint: document.provenanceFingerprint,
    sourceApprovalFingerprint: review.approval.approvalFingerprint,
    ...overrides,
  }
}

function signer(role = 'transfer_attorney', signerKey = 'primary-signatory', order = 1) {
  return { signerKey, signerRole: role, signerReferenceHash: hash(`signer:${signerKey}`), signingOrder: order, required: true, allowedMethods: ['electronic', 'wet_ink'] }
}

function prepare(scenarioId = 'residential_transfer_instruction', overrides = {}) {
  const { artifacts, review } = approvedArtifacts(scenarioId)
  const role = artifacts.document.lane === 'bond' ? 'bond_attorney' : artifacts.document.lane === 'cancellation' ? 'cancellation_attorney' : 'transfer_attorney'
  const result = startConveyancerLegalInstrumentSigningEvidence({
    review,
    document: artifacts.document,
    renderEvidence: renderEvidence(artifacts.document, review),
    signers: [signer(role)],
    actor: { role, userId: `${role}-signing-preparer` },
    occurredAt: t.prepared,
    expiresAt: t.expires,
    commandId: `prepare:${artifacts.document.documentId}`,
    ...overrides,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return { artifacts, review, result }
}

function signingCommand(signing, type, payload = {}) {
  return {
    commandId: `${type}:${signing.runtimeRevision}`,
    type,
    expectedSigningId: signing.signingId,
    expectedRuntimeRevision: signing.runtimeRevision,
    expectedBindingFingerprint: signing.bindingFingerprint,
    expectedArtifactHash: signing.currentArtifactHash,
    ...payload,
  }
}

function execute(signing, type, actor, payload = {}, occurredAt = t.signed, existingEvents = []) {
  return executeConveyancerLegalInstrumentSigningEvidence({ signing, command: signingCommand(signing, type, payload), actor, occurredAt, existingEvents })
}

function signaturePayload(signing, overrides = {}) {
  return {
    signerKey: 'primary-signatory',
    method: 'electronic',
    signedAt: t.signed,
    evidenceReferenceId: 'provider-evidence-c7-1',
    providerEventId: 'provider-event-c7-1',
    inputArtifactHash: signing.currentArtifactHash,
    outputArtifactHash: hash(`signed:${signing.documentId}:1`),
    identityVerification: { method: 'provider_otp_and_id_match', verifiedAt: t.signed, referenceHash: hash('identity-verification-c7-1') },
    ...overrides,
  }
}

const transferActor = { role: 'transfer_attorney', userId: 'transfer-evidence-c7' }

test('prepares signing only from an intact C6-approved document and rendered PDF', () => {
  const { result } = prepare()
  assert.equal(result.signing.version, CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_EVIDENCE_VERSION)
  assert.equal(result.signing.status, STATUS.prepared)
  assert.equal(result.signing.currentArtifactHash, result.signing.renderEvidence.artifactHash)
  assert.equal(result.signing.signerContract[0].signerRole, 'transfer_attorney')
  assert.equal(Object.isFrozen(result.signing), true)
  assert.equal(result.signing.externalSigningRequested, false)
  for (const flag of ['renderingPerformed', 'persistencePerformed', 'signingPerformed', 'dispatchPerformed']) assert.equal(result.event[flag], false, flag)
})

test('blocks stale approval, altered C4 content and mismatched render evidence', () => {
  const { artifacts, review } = approvedArtifacts()
  const changed = structuredClone(artifacts.document)
  changed.renderModel.sections[0].body += '\nChanged after approval.'
  const altered = startConveyancerLegalInstrumentSigningEvidence({ review, document: changed, renderEvidence: renderEvidence(changed, review), signers: [signer()], actor: transferActor, occurredAt: t.prepared, expiresAt: t.expires, commandId: 'prepare:altered' })
  assert.equal(altered.code, 'approved_document_integrity_invalid')
  const wrongApproval = startConveyancerLegalInstrumentSigningEvidence({ review, document: artifacts.document, renderEvidence: renderEvidence(artifacts.document, review, { sourceApprovalFingerprint: hash('wrong') }), signers: [signer()], actor: transferActor, occurredAt: t.prepared, expiresAt: t.expires, commandId: 'prepare:wrong-render' })
  assert.equal(wrongApproval.code, 'render_evidence_invalid')
  assert.ok(wrongApproval.errors.includes('render_source_approval_fingerprint_mismatch'))
})

test('requires a PDF hash, renderer provenance, valid signing window and required signer roles', () => {
  const { artifacts, review } = approvedArtifacts()
  const badRender = startConveyancerLegalInstrumentSigningEvidence({ review, document: artifacts.document, renderEvidence: renderEvidence(artifacts.document, review, { mimeType: 'application/msword', artifactHash: 'bad' }), signers: [signer()], actor: transferActor, occurredAt: t.prepared, expiresAt: t.expires, commandId: 'prepare:bad-render' })
  assert.equal(badRender.code, 'render_evidence_invalid')
  assert.ok(badRender.errors.includes('signable_pdf_required'))
  const wrongSigner = startConveyancerLegalInstrumentSigningEvidence({ review, document: artifacts.document, renderEvidence: renderEvidence(artifacts.document, review), signers: [signer('client')], actor: transferActor, occurredAt: t.prepared, expiresAt: t.expires, commandId: 'prepare:bad-signer' })
  assert.equal(wrongSigner.code, 'signer_contract_invalid')
  assert.ok(wrongSigner.errors.includes('required_document_signer_role_missing:transfer_attorney'))
})

test('enforces lane authority while permitting secretary preparation and system evidence ingestion', () => {
  const { artifacts, review } = approvedArtifacts()
  const wrongLane = startConveyancerLegalInstrumentSigningEvidence({ review, document: artifacts.document, renderEvidence: renderEvidence(artifacts.document, review), signers: [signer()], actor: { role: 'bond_attorney', userId: 'wrong-lane' }, occurredAt: t.prepared, expiresAt: t.expires, commandId: 'prepare:wrong-lane' })
  assert.equal(wrongLane.code, 'signing_preparation_lane_not_authorised')
  const secretary = startConveyancerLegalInstrumentSigningEvidence({ review, document: artifacts.document, renderEvidence: renderEvidence(artifacts.document, review), signers: [signer()], actor: { role: 'secretary', userId: 'secretary-c7' }, occurredAt: t.prepared, expiresAt: t.expires, commandId: 'prepare:secretary' })
  assert.equal(secretary.ok, true, JSON.stringify(secretary.errors))
  const signed = execute(secretary.signing, COMMAND.recordSignature, { role: 'system', userId: 'sign-provider-c7' }, signaturePayload(secretary.signing))
  assert.equal(signed.ok, true, JSON.stringify(signed.errors))
})

test('records view and signature evidence without performing or dispatching signing', () => {
  const { result } = prepare()
  const viewed = execute(result.signing, COMMAND.recordViewed, transferActor, { signerKey: 'primary-signatory' }, t.viewed)
  assert.equal(viewed.review, undefined)
  assert.equal(viewed.signing.status, STATUS.inProgress)
  const signed = execute(viewed.signing, COMMAND.recordSignature, transferActor, signaturePayload(viewed.signing))
  assert.equal(signed.ok, true, JSON.stringify(signed.errors))
  assert.equal(signed.signing.status, STATUS.awaitingCompletionEvidence)
  assert.equal(signed.signing.signerStates[0].status, 'signed')
  assert.equal(signed.event.signingPerformed, false)
  assert.equal(signed.event.dispatchPerformed, false)
  assert.equal(signed.event.signingEvidenceRecorded, true)
})

test('enforces signing order and a continuous artifact hash chain', () => {
  const base = prepare('residential_transfer_instruction', { signers: [signer('transfer_attorney', 'first', 1), signer('transfer_attorney', 'second', 2)] }).result.signing
  const secondTooSoon = execute(base, COMMAND.recordSignature, transferActor, signaturePayload(base, { signerKey: 'second', providerEventId: 'event-second', outputArtifactHash: hash('second-output') }))
  assert.equal(secondTooSoon.code, 'signing_order_not_reached')
  const badInput = execute(base, COMMAND.recordSignature, transferActor, signaturePayload(base, { signerKey: 'first', inputArtifactHash: hash('wrong-input') }))
  assert.equal(badInput.code, 'signature_evidence_required')
  const first = execute(base, COMMAND.recordSignature, transferActor, signaturePayload(base, { signerKey: 'first', outputArtifactHash: hash('first-output') }))
  assert.equal(first.ok, true, JSON.stringify(first.errors))
  const second = execute(first.signing, COMMAND.recordSignature, transferActor, signaturePayload(first.signing, { signerKey: 'second', providerEventId: 'event-second', evidenceReferenceId: 'evidence-second', outputArtifactHash: hash('second-output'), signedAt: '2026-07-15T10:36:00.000Z', identityVerification: { method: 'provider_otp', verifiedAt: '2026-07-15T10:36:00.000Z', referenceHash: hash('identity-two') } }), '2026-07-15T10:36:00.000Z')
  assert.equal(second.signing.status, STATUS.awaitingCompletionEvidence)
  const tampered = structuredClone(second.signing)
  tampered.signerStates[1].signatureEvidence.inputArtifactHash = hash('broken-chain')
  assert.ok(validateConveyancerLegalInstrumentSigningEvidence(tampered).errors.includes('signature_artifact_chain_broken:second'))
})

test('requires complete signed-document and certificate evidence before completion', () => {
  const { result } = prepare()
  const premature = execute(result.signing, COMMAND.complete, transferActor, {})
  assert.equal(premature.code, 'required_signatures_incomplete')
  const signed = execute(result.signing, COMMAND.recordSignature, transferActor, signaturePayload(result.signing))
  const incomplete = execute(signed.signing, COMMAND.complete, transferActor, { signedDocumentEvidence: { finalArtifactHash: signed.signing.currentArtifactHash } }, t.completed)
  assert.equal(incomplete.code, 'signed_document_evidence_required')
  const completed = execute(signed.signing, COMMAND.complete, transferActor, {
    signedDocumentEvidence: {
      signedDocumentId: `signed:${signed.signing.documentId}`,
      signedDocumentVersionId: `signed-version:${signed.signing.documentId}:1`,
      finalArtifactHash: signed.signing.currentArtifactHash,
      storageReferenceHash: hash('signed-storage-reference'),
      completionCertificateHash: hash('completion-certificate-binary'),
      certificateReferenceHash: hash('completion-certificate-reference'),
      providerEnvelopeId: 'provider-envelope-c7-1',
    },
  }, t.completed)
  assert.equal(completed.ok, true, JSON.stringify(completed.errors))
  assert.equal(completed.signing.status, STATUS.completed)
  assert.match(completed.signing.completionFingerprint, /^[a-f0-9]{64}$/)
  assert.equal(completed.signing.persistenceAllowed, false)
  assert.equal(completed.signing.dispatchAllowed, false)
})

test('records signer decline, expiry and reasoned voiding as terminal outcomes', () => {
  const declinedBase = prepare().result.signing
  const declined = execute(declinedBase, COMMAND.recordDecline, transferActor, { signerKey: 'primary-signatory', reasonCode: 'terms_not_accepted', evidenceReferenceId: 'decline-proof-1', providerEventId: 'decline-event-1' })
  assert.equal(declined.signing.status, STATUS.declined)
  assert.equal(execute(declined.signing, COMMAND.recordViewed, transferActor, { signerKey: 'primary-signatory' }).code, 'terminal_signing_evidence')

  const expiredBase = prepare().result.signing
  const tooSoon = execute(expiredBase, COMMAND.expire, { role: 'system', userId: 'expiry-worker' }, {}, '2026-07-16T10:00:00.000Z')
  assert.equal(tooSoon.code, 'signing_not_expired')
  const expired = execute(expiredBase, COMMAND.expire, { role: 'system', userId: 'expiry-worker' }, {}, t.expires)
  assert.equal(expired.signing.status, STATUS.expired)

  const voidBase = prepare().result.signing
  assert.equal(execute(voidBase, COMMAND.void, { role: 'secretary', userId: 'secretary' }, { reason: 'Wrong envelope.' }).code, 'signing_void_not_authorised')
  const voided = execute(voidBase, COMMAND.void, transferActor, { reason: 'Signing envelope created against the wrong execution route.' })
  assert.equal(voided.signing.status, STATUS.voided)
})

test('rejects stale tabs, expired-window events and reused provider event IDs', () => {
  const { result } = prepare()
  const stale = signingCommand(result.signing, COMMAND.recordViewed, { signerKey: 'primary-signatory' })
  stale.expectedRuntimeRevision = 0
  assert.equal(executeConveyancerLegalInstrumentSigningEvidence({ signing: result.signing, command: stale, actor: transferActor, occurredAt: t.viewed }).code, 'stale_signing_revision')
  const afterExpiry = execute(result.signing, COMMAND.recordViewed, transferActor, { signerKey: 'primary-signatory' }, '2026-07-23T10:00:00.000Z')
  assert.equal(afterExpiry.code, 'signing_window_expired')
})

test('supports exact idempotent replay and rejects command-id conflicts', () => {
  const { result } = prepare()
  const command = signingCommand(result.signing, COMMAND.recordViewed, { signerKey: 'primary-signatory' })
  const viewed = executeConveyancerLegalInstrumentSigningEvidence({ signing: result.signing, command, actor: transferActor, occurredAt: t.viewed })
  const replay = executeConveyancerLegalInstrumentSigningEvidence({ signing: viewed.signing, command, actor: transferActor, occurredAt: t.viewed, existingEvents: [viewed.event] })
  assert.equal(replay.duplicate, true)
  const conflict = executeConveyancerLegalInstrumentSigningEvidence({ signing: viewed.signing, command: { ...signingCommand(viewed.signing, COMMAND.void, { reason: 'Different.' }), commandId: command.commandId }, actor: transferActor, occurredAt: t.signed, existingEvents: [viewed.event] })
  assert.equal(conflict.code, 'signing_command_id_conflict')
})

test('detects binding, completion and authority tampering', () => {
  const { result } = prepare()
  const binding = structuredClone(result.signing)
  binding.expiresAt = '2026-08-01T00:00:00.000Z'
  assert.ok(validateConveyancerLegalInstrumentSigningEvidence(binding).errors.includes('signing_binding_fingerprint_invalid'))

  const signed = execute(result.signing, COMMAND.recordSignature, transferActor, signaturePayload(result.signing))
  const authority = structuredClone(signed.signing)
  authority.signerStates[0].signatureEvidence.recordedBy.role = 'client'
  assert.ok(validateConveyancerLegalInstrumentSigningEvidence(authority).errors.includes('signature_evidence_authority_invalid:primary_signatory'))
})

test('does not mutate source records or leak signer references into audit events', () => {
  const { result } = prepare()
  const before = structuredClone(result.signing)
  const signed = execute(result.signing, COMMAND.recordSignature, transferActor, signaturePayload(result.signing))
  assert.deepEqual(result.signing, before)
  const serialized = JSON.stringify(signed.event)
  assert.equal(serialized.includes('8001015009087'), false)
  assert.equal(serialized.includes('Erf 123 Pilot Township'), false)
})

console.log('conveyancer legal-instrument C7 signing and document evidence tests passed')
