import assert from 'node:assert/strict'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_ASSURANCE_VERSION,
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_SCENARIOS,
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_VERSION,
  buildConveyancerLegalInstrumentSigningAssurance,
  buildConveyancerLegalInstrumentSigningPilotManifest,
  runConveyancerLegalInstrumentSigningPilotScenario,
  runConveyancerLegalInstrumentSigningPilotSuite,
  serializeConveyancerLegalInstrumentSigningAssuranceEvidence,
} from '../conveyancerLegalInstrumentSigningAssurance.js'

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

function scenarioEvidence(scenarioId = 'completed_transfer_signing') {
  const result = runConveyancerLegalInstrumentSigningPilotScenario({ scenarioId, generatedAt, includeArtifacts: true })
  assert.equal(result.passed, true, JSON.stringify(result.errors))
  assert.ok(result.artifacts)
  return structuredClone(result.artifacts)
}

function assure(fixture) {
  return buildConveyancerLegalInstrumentSigningAssurance({
    plan: fixture.artifacts.plan,
    template: fixture.artifacts.template,
    document: fixture.artifacts.document,
    generationEvent: fixture.artifacts.event,
    review: fixture.review,
    reviewEvents: fixture.reviewEvents,
    signing: fixture.signing,
    signingEvents: fixture.signingEvents,
    asOf: fixture.asOf,
  })
}

test('independently assures a completed C1-C7 signed legal instrument', () => {
  const assurance = assure(scenarioEvidence())
  assert.equal(assurance.version, CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_ASSURANCE_VERSION)
  assert.equal(assurance.decision, 'ready')
  assert.equal(assurance.releaseReady, true)
  assert.equal(assurance.failedCriticalCount, 0)
  assert.equal(Object.isFrozen(assurance), true)
})

test('observes valid in-progress and declined matter outcomes without calling them platform failures', () => {
  const inProgress = assure(scenarioEvidence('signing_in_progress'))
  assert.equal(inProgress.decision, 'observe')
  assert.ok(inProgress.failedChecks.some((item) => item.id === 'completed_signing_outcome' && item.category === 'matter'))
  assert.equal(inProgress.failedCriticalCount, 0)

  const declined = assure(scenarioEvidence('signer_declined'))
  assert.equal(declined.decision, 'observe')
  assert.equal(declined.failedCriticalCount, 0)
})

test('blocks a tampered signature artifact chain', () => {
  const result = runConveyancerLegalInstrumentSigningPilotScenario({ scenarioId: 'tampered_signature_chain', generatedAt })
  assert.equal(result.passed, true)
  assert.equal(result.actualOutcome, 'safe_block')
  assert.ok(result.assurance.failedChecks.some((item) => item.id === 'c7_signing_contract'))
})

test('blocks missing C6 approval events and forged review authority', () => {
  const missing = scenarioEvidence()
  missing.reviewEvents.pop()
  const missingAssurance = assure(missing)
  assert.equal(missingAssurance.decision, 'blocked')
  assert.ok(missingAssurance.failedChecks.some((item) => item.id === 'c6_audit_continuity'))

  const forged = scenarioEvidence()
  forged.reviewEvents[1].actor.role = 'client'
  const forgedAssurance = assure(forged)
  assert.equal(forgedAssurance.decision, 'blocked')
  assert.ok(forgedAssurance.failedChecks.find((item) => item.id === 'c6_audit_continuity').evidence.some((issue) => issue.includes('review_event_authority_invalid')))
})

test('blocks missing C7 evidence events and forged signing authority', () => {
  const missing = scenarioEvidence()
  missing.signingEvents.splice(1, 1)
  const missingAssurance = assure(missing)
  assert.equal(missingAssurance.decision, 'blocked')
  assert.ok(missingAssurance.failedChecks.some((item) => item.id === 'c7_audit_continuity'))

  const forged = scenarioEvidence()
  forged.signingEvents[1].actor.role = 'client'
  const forgedAssurance = assure(forged)
  assert.equal(forgedAssurance.decision, 'blocked')
})

test('blocks certificate, approval and embedded side-effect tampering', () => {
  const certificate = scenarioEvidence()
  certificate.signing.signedDocumentEvidence.completionCertificateHash = '0'.repeat(64)
  assert.equal(assure(certificate).decision, 'blocked')

  const approval = scenarioEvidence()
  approval.signing.c6ApprovalFingerprint = '1'.repeat(64)
  assert.equal(assure(approval).decision, 'blocked')

  const sideEffect = scenarioEvidence()
  sideEffect.signingEvents[1].dispatchPerformed = true
  const assurance = assure(sideEffect)
  assert.equal(assurance.decision, 'blocked')
  assert.ok(assurance.failedChecks.some((item) => item.id === 'no_embedded_side_effects'))
})

test('runs representative completed, observed and safe-block pilot scenarios', () => {
  const pilot = runConveyancerLegalInstrumentSigningPilotSuite({ generatedAt })
  assert.equal(pilot.version, CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_VERSION)
  assert.equal(pilot.decision, 'go')
  assert.equal(pilot.metrics.scenarioCount, 6)
  assert.equal(pilot.metrics.passedCount, 6)
  assert.equal(pilot.metrics.scenarioPassRate, 1)
  assert.deepEqual([...new Set(CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_SCENARIOS.map((item) => item.expectedOutcome))].sort(), ['observe', 'ready', 'safe_block'])
})

test('holds an empty or failing scenario suite', () => {
  const empty = runConveyancerLegalInstrumentSigningPilotSuite({ scenarios: [], generatedAt })
  assert.equal(empty.decision, 'hold')
  assert.ok(empty.releaseBlockers.includes('no_pilot_scenarios'))
  assert.ok(empty.releaseBlockers.includes('scenario_pass_rate'))

  const failed = runConveyancerLegalInstrumentSigningPilotSuite({ scenarios: ['missing'], generatedAt })
  assert.equal(failed.decision, 'hold')
  assert.equal(failed.metrics.scenarioPassRate, 0)
})

test('observes operational warnings and holds on evidence integrity triggers', () => {
  const observed = runConveyancerLegalInstrumentSigningPilotSuite({ generatedAt, operationalMetrics: { signingAttempts: 100, overdueSignings: 6 } })
  assert.equal(observed.decision, 'observe')
  assert.ok(observed.rollbackTriggers.some((item) => item.key === 'overdue_signing_rate' && item.severity === 'warning'))

  for (const metrics of [
    { evidenceIntegrityFailures: 1 },
    { auditGaps: 1 },
    { identityVerificationFailures: 1 },
    { completionCertificateFailures: 1 },
    { sideEffectAttempts: 1 },
  ]) {
    const held = runConveyancerLegalInstrumentSigningPilotSuite({ generatedAt, operationalMetrics: metrics })
    assert.equal(held.decision, 'hold', JSON.stringify(metrics))
  }
})

test('rejects threshold overrides that weaken assurance safety', () => {
  const pilot = runConveyancerLegalInstrumentSigningPilotSuite({ generatedAt, thresholds: { minimumScenarioPassRate: 0.5, maximumAuditGaps: 2, maximumDeclineRate: 0.9 } })
  assert.equal(pilot.decision, 'hold')
  assert.ok(pilot.thresholdErrors.includes('unsafe_pilot_threshold:minimumScenarioPassRate'))
  assert.ok(pilot.thresholdErrors.includes('unsafe_pilot_threshold:maximumAuditGaps'))
  assert.ok(pilot.thresholdErrors.includes('unsafe_pilot_threshold:maximumDeclineRate'))
})

test('builds a narrow no-write C8 pilot manifest with named ownership', () => {
  const manifest = buildConveyancerLegalInstrumentSigningPilotManifest({
    firmIds: ['firm-c8-1'],
    templateVersionIds: ['transfer-v1', 'bond-v1'],
    signingProviderIds: ['provider-c8-1'],
    lanes: ['transfer', 'bond', 'cancellation'],
    startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2026-08-15T00:00:00.000Z',
    maximumMatters: 10,
    maximumDocumentsPerMatter: 5,
    assuranceOwnerId: 'assurance-c8',
    signingOwnerId: 'signing-c8',
    rollbackOwnerId: 'rollback-c8',
    supportOwnerId: 'support-c8',
  })
  assert.equal(manifest.valid, true, JSON.stringify(manifest.errors))
  assert.equal(manifest.controls.providerWebhookVerificationRequired, true)
  assert.equal(manifest.controls.completionCertificateRequired, true)
  assert.equal(manifest.controls.databaseWritesEnabledByManifest, false)
  assert.equal(manifest.controls.automaticSigningRequestDispatch, false)
  assert.equal(manifest.controls.productionPacketIntegration, false)
  assert.equal(Object.isFrozen(manifest), true)
})

test('rejects broad, providerless or ownerless C8 pilot manifests', () => {
  const manifest = buildConveyancerLegalInstrumentSigningPilotManifest({
    firmIds: ['one', 'two', 'three', 'four'],
    templateVersionIds: [],
    signingProviderIds: [],
    lanes: ['shared'],
    startsAt: 'invalid',
    endsAt: '2026-08-01T00:00:00.000Z',
    maximumMatters: 100,
    maximumDocumentsPerMatter: 20,
  })
  assert.equal(manifest.valid, false)
  assert.ok(manifest.errors.includes('pilot_firm_count_out_of_range'))
  assert.ok(manifest.errors.includes('pilot_signing_provider_count_out_of_range'))
  assert.ok(manifest.errors.includes('assurance_owner_required'))
  assert.ok(manifest.errors.includes('signing_owner_required'))
})

test('serializes redacted assurance evidence without document or signer data', () => {
  const serialized = serializeConveyancerLegalInstrumentSigningAssuranceEvidence(assure(scenarioEvidence()))
  assert.match(serialized, /completed/)
  assert.equal(serialized.includes('8001015009087'), false)
  assert.equal(serialized.includes('Erf 123 Pilot Township'), false)
  assert.equal(serialized.includes('signer:'), false)
})

test('does not mutate assurance inputs and fails unknown scenarios safely', () => {
  const fixture = scenarioEvidence()
  const before = structuredClone(fixture)
  assure(fixture)
  assert.deepEqual(fixture, before)

  const result = runConveyancerLegalInstrumentSigningPilotScenario({ scenarioId: 'missing', generatedAt })
  assert.equal(result.passed, false)
  assert.equal(result.actualOutcome, 'scenario_not_found')
  assert.deepEqual(result.errors, ['pilot_scenario_not_found'])
})

console.log('conveyancer legal-instrument C8 assurance tests passed')
