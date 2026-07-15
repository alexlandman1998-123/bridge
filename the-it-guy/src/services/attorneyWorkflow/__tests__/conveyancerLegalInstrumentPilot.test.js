import assert from 'node:assert/strict'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_ASSURANCE_VERSION,
  CONVEYANCER_LEGAL_INSTRUMENT_PILOT_SCENARIOS,
  CONVEYANCER_LEGAL_INSTRUMENT_PILOT_VERSION,
  buildConveyancerLegalInstrumentAssurance,
  buildConveyancerLegalInstrumentPilotManifest,
  runConveyancerLegalInstrumentPilotScenario,
  runConveyancerLegalInstrumentPilotSuite,
  serializeConveyancerLegalInstrumentAssuranceEvidence,
} from '../conveyancerLegalInstrumentPilot.js'

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

function scenarioEvidence(scenarioId = 'residential_transfer_instruction') {
  const result = runConveyancerLegalInstrumentPilotScenario({ scenarioId, generatedAt, includeArtifacts: true })
  assert.equal(result.passed, true, JSON.stringify(result.errors))
  assert.ok(result.artifacts)
  return structuredClone(result.artifacts)
}

test('assures an intact C1-C4 legal-instrument draft for attorney review', () => {
  const artifacts = scenarioEvidence()
  const assurance = buildConveyancerLegalInstrumentAssurance({ ...artifacts, asOf: generatedAt })
  assert.equal(assurance.version, CONVEYANCER_LEGAL_INSTRUMENT_ASSURANCE_VERSION)
  assert.equal(assurance.decision, 'ready')
  assert.equal(assurance.reviewReady, true)
  assert.equal(assurance.releaseReady, true)
  assert.equal(assurance.failedCriticalCount, 0)
  assert.equal(Object.isFrozen(assurance), true)
})

test('blocks a draft whose assembled content was altered', () => {
  const artifacts = scenarioEvidence()
  artifacts.document.renderModel.sections[0].body += '\nChanged after generation.'
  const assurance = buildConveyancerLegalInstrumentAssurance({ ...artifacts, asOf: generatedAt })
  assert.equal(assurance.decision, 'blocked')
  assert.ok(assurance.failedChecks.some((item) => item.id === 'content_fingerprint_integrity'))
})

test('blocks tampering with field, clause or validation provenance', () => {
  const artifacts = scenarioEvidence()
  artifacts.document.variableManifest[0].source = 'manual.unapproved_source'
  const assurance = buildConveyancerLegalInstrumentAssurance({ ...artifacts, asOf: generatedAt })
  assert.equal(assurance.decision, 'blocked')
  assert.ok(assurance.failedChecks.some((item) => item.id === 'provenance_fingerprint_integrity'))
})

test('blocks template-governance drift and unknown legal-instrument families', () => {
  const artifacts = scenarioEvidence()
  artifacts.template.instrumentFamily = 'unknown_family'
  const assurance = buildConveyancerLegalInstrumentAssurance({ ...artifacts, asOf: generatedAt })
  assert.equal(assurance.decision, 'blocked')
  assert.ok(assurance.failedChecks.some((item) => item.id === 'c1_template_contract'))
  assert.ok(assurance.failedChecks.some((item) => item.id === 'legal_instrument_family'))
})

test('blocks any render, persistence, signing or dispatch side-effect evidence', () => {
  for (const flag of ['renderingPerformed', 'persistencePerformed', 'signingPerformed', 'dispatchPerformed']) {
    const artifacts = scenarioEvidence()
    artifacts.event[flag] = true
    const assurance = buildConveyancerLegalInstrumentAssurance({ ...artifacts, asOf: generatedAt })
    assert.equal(assurance.decision, 'blocked', flag)
    assert.ok(assurance.failedChecks.some((item) => item.id === 'no_side_effect_evidence'))
  }
})

test('treats warning-only data as observable rather than legally approved', () => {
  const result = runConveyancerLegalInstrumentPilotScenario({ scenarioId: 'warning_requires_attorney_review', generatedAt })
  assert.equal(result.passed, true)
  assert.equal(result.actualOutcome, 'observe')
  assert.equal(result.assurance.reviewReady, true)
  assert.equal(result.assurance.releaseReady, false)
})

test('certifies invalid source data only when assembly fails closed', () => {
  const result = runConveyancerLegalInstrumentPilotScenario({ scenarioId: 'invalid_identity_fails_closed', generatedAt })
  assert.equal(result.passed, true)
  assert.equal(result.expectedOutcome, 'safe_block')
  assert.equal(result.actualOutcome, 'safe_block')
  assert.equal(result.assurance, null)
})

test('runs representative transfer, bond and cancellation pilot scenarios', () => {
  const pilot = runConveyancerLegalInstrumentPilotSuite({ generatedAt })
  assert.equal(pilot.version, CONVEYANCER_LEGAL_INSTRUMENT_PILOT_VERSION)
  assert.equal(pilot.decision, 'go')
  assert.equal(pilot.metrics.scenarioCount, 6)
  assert.equal(pilot.metrics.passedCount, 6)
  assert.equal(pilot.metrics.scenarioPassRate, 1)
  assert.equal(pilot.metrics.readyCount, 4)
  assert.equal(pilot.metrics.observeCount, 1)
  assert.equal(pilot.metrics.expectedSafeBlockCount, 1)
  assert.deepEqual([...new Set(CONVEYANCER_LEGAL_INSTRUMENT_PILOT_SCENARIOS.map((item) => item.lane))].sort(), ['bond', 'cancellation', 'transfer'])
  assert.equal(Object.isFrozen(pilot), true)
})

test('holds a pilot without scenario evidence', () => {
  const pilot = runConveyancerLegalInstrumentPilotSuite({ scenarios: [], generatedAt })
  assert.equal(pilot.decision, 'hold')
  assert.ok(pilot.releaseBlockers.includes('no_pilot_scenarios'))
  assert.ok(pilot.releaseBlockers.includes('scenario_pass_rate'))
})

test('observes threshold warnings and holds on critical operational triggers', () => {
  const observed = runConveyancerLegalInstrumentPilotSuite({
    generatedAt,
    operationalMetrics: { generationAttempts: 100, validatedDrafts: 100, dataValidationBlocks: 15 },
  })
  assert.equal(observed.decision, 'observe')
  assert.ok(observed.rollbackTriggers.some((item) => item.key === 'data_block_rate' && item.severity === 'warning'))

  const held = runConveyancerLegalInstrumentPilotSuite({ generatedAt, operationalMetrics: { contentIntegrityFailures: 1 } })
  assert.equal(held.decision, 'hold')
  assert.ok(held.releaseBlockers.includes('content_integrity_failure'))

  const sideEffect = runConveyancerLegalInstrumentPilotSuite({ generatedAt, operationalMetrics: { signingAttempts: 1 } })
  assert.equal(sideEffect.decision, 'hold')
  assert.ok(sideEffect.releaseBlockers.includes('signing_attempted'))
})

test('rejects threshold overrides that weaken pilot safety', () => {
  const pilot = runConveyancerLegalInstrumentPilotSuite({
    generatedAt,
    thresholds: { minimumScenarioPassRate: 0.5, maximumDataBlockRate: 0.9 },
  })
  assert.equal(pilot.decision, 'hold')
  assert.ok(pilot.thresholdErrors.includes('unsafe_pilot_threshold:minimumScenarioPassRate'))
  assert.ok(pilot.thresholdErrors.includes('unsafe_pilot_threshold:maximumDataBlockRate'))
})

test('builds a narrow no-write pilot manifest with named legal review ownership', () => {
  const manifest = buildConveyancerLegalInstrumentPilotManifest({
    firmIds: ['firm-c5-1'],
    templateVersionIds: ['template-transfer-v1', 'template-bond-v1'],
    instrumentFamilies: ['residential_resale', 'commercial_sale'],
    lanes: ['transfer', 'bond', 'cancellation'],
    startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2026-08-15T00:00:00.000Z',
    maximumMatters: 10,
    maximumDocumentsPerMatter: 5,
    assuranceOwnerId: 'assurance-c5',
    legalReviewOwnerId: 'review-c5',
    rollbackOwnerId: 'rollback-c5',
    supportOwnerId: 'support-c5',
  })
  assert.equal(manifest.valid, true, JSON.stringify(manifest.errors))
  assert.equal(manifest.controls.humanAttorneyReviewRequired, true)
  assert.equal(manifest.controls.databaseWritesEnabledByManifest, false)
  assert.equal(manifest.controls.automaticRendering, false)
  assert.equal(manifest.controls.automaticLegalApproval, false)
  assert.equal(manifest.controls.automaticSigning, false)
  assert.equal(manifest.controls.automaticDispatch, false)
  assert.equal(manifest.controls.productionPacketIntegration, false)
  assert.equal(Object.isFrozen(manifest), true)
})

test('rejects broad, ownerless or unknown-family pilot manifests', () => {
  const manifest = buildConveyancerLegalInstrumentPilotManifest({
    firmIds: ['one', 'two', 'three', 'four'],
    templateVersionIds: [],
    instrumentFamilies: ['unknown_family'],
    lanes: ['shared'],
    startsAt: 'invalid',
    endsAt: '2026-08-01T00:00:00.000Z',
    maximumMatters: 100,
    maximumDocumentsPerMatter: 20,
  })
  assert.equal(manifest.valid, false)
  assert.ok(manifest.errors.includes('pilot_firm_count_out_of_range'))
  assert.ok(manifest.errors.includes('pilot_template_version_required'))
  assert.ok(manifest.errors.includes('unknown_pilot_instrument_family:unknown_family'))
  assert.ok(manifest.errors.includes('valid_pilot_lane_required'))
  assert.ok(manifest.errors.includes('assurance_owner_required'))
  assert.ok(manifest.errors.includes('legal_review_owner_required'))
})

test('serializes redacted assurance evidence without document content', () => {
  const result = runConveyancerLegalInstrumentPilotScenario({ scenarioId: 'residential_transfer_instruction', generatedAt })
  const serialized = serializeConveyancerLegalInstrumentAssuranceEvidence(result.assurance)
  assert.match(serialized, /residential_resale/)
  assert.equal(serialized.includes('8001015009087'), false)
  assert.equal(serialized.includes('Erf 123 Pilot Township'), false)
})

test('does not mutate assurance inputs or operational metrics', () => {
  const artifacts = scenarioEvidence()
  const before = structuredClone(artifacts)
  buildConveyancerLegalInstrumentAssurance({ ...artifacts, asOf: generatedAt })
  assert.deepEqual(artifacts, before)

  const operationalMetrics = { generationAttempts: 100, validatedDrafts: 100, warningDrafts: 5 }
  const metricsBefore = structuredClone(operationalMetrics)
  runConveyancerLegalInstrumentPilotSuite({ generatedAt, operationalMetrics })
  assert.deepEqual(operationalMetrics, metricsBefore)
})

test('fails an unknown individual pilot scenario safely', () => {
  const result = runConveyancerLegalInstrumentPilotScenario({ scenarioId: 'missing', generatedAt })
  assert.equal(result.passed, false)
  assert.equal(result.actualOutcome, 'scenario_not_found')
  assert.deepEqual(result.errors, ['pilot_scenario_not_found'])
})

console.log('conveyancer legal-instrument C5 pilot tests passed')
