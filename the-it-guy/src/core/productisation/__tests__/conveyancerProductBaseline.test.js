import assert from 'node:assert/strict'
import {
  CONVEYANCER_PRODUCT_BASELINE_BOUNDARY,
  CONVEYANCER_PRODUCT_BASELINE_VERSION,
  CONVEYANCER_PRODUCT_PHASE_IDS,
  CONVEYANCER_PRODUCT_PILOT_ARCHETYPES,
  CONVEYANCER_PRODUCT_RECORD_CATALOGUE,
  CONVEYANCER_PRODUCT_SUCCESS_METRICS,
  buildConveyancerProductBaseline,
  evaluateConveyancerProductBaselineMetrics,
  serializeConveyancerProductBaselineEvidence,
  validateConveyancerProductBaseline,
} from '../conveyancerProductBaseline.js'

function test(name, fn) {
  try { fn(); console.log(`ok - ${name}`) }
  catch (error) { console.error(`not ok - ${name}`); throw error }
}

const generatedAt = '2026-07-16T08:00:00.000Z'
const approvalAreas = ['product', 'legal', 'security', 'data', 'operations', 'rollback']

function approvals(overrides = {}) {
  return approvalAreas.map((area, index) => ({
    area,
    decision: 'accepted',
    userId: `approver:${area}`,
    approvedAt: `2026-07-16T${String(index + 9).padStart(2, '0')}:00:00.000Z`,
    referenceId: `approval:p0:${area}`,
    ...(overrides[area] || {}),
  }))
}

function fixture(overrides = {}) {
  const result = buildConveyancerProductBaseline({
    baselineId: 'baseline:p0:1',
    releaseCandidateId: 'release:attorney-productisation:1',
    organisationId: 'organisation:p0',
    generatedAt,
    generatedBy: { role: 'product_owner', userId: 'product-owner:p0' },
    approvals: approvals(),
    ...overrides,
  })
  return result
}

function passingMeasurements() {
  return Object.fromEntries(CONVEYANCER_PRODUCT_SUCCESS_METRICS.map((metric) => [metric.key, metric.target]))
}

test('builds an immutable P0 baseline ready for productisation', () => {
  const result = fixture()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.baseline.version, CONVEYANCER_PRODUCT_BASELINE_VERSION)
  assert.equal(result.baseline.status, 'ready')
  assert.equal(Object.isFrozen(result.baseline), true)
  assert.deepEqual(result.baseline.controls, CONVEYANCER_PRODUCT_BASELINE_BOUNDARY)
})

test('defines all five manual-first pilot archetypes', () => {
  const baseline = fixture().baseline
  assert.equal(baseline.pilotArchetypes.length, 5)
  assert.deepEqual(baseline.pilotArchetypes, CONVEYANCER_PRODUCT_PILOT_ARCHETYPES)
  assert.deepEqual(baseline.pilotArchetypes[0].requiredLanes, ['transfer'])
  assert.deepEqual(baseline.pilotArchetypes[3].requiredLanes, ['transfer', 'bond', 'cancellation'])
  assert.equal(baseline.pilotArchetypes[4].requiredExternalEvidence.includes('levy_clearance'), true)
})

test('classifies canonical records separately from read-only projections', () => {
  const records = new Map(CONVEYANCER_PRODUCT_RECORD_CATALOGUE.map((item) => [item.key, item]))
  assert.equal(records.get('matter_plan').mode, 'canonical_persisted')
  assert.equal(records.get('action_queue').mode, 'derived_projection')
  assert.equal(records.get('professional_timeline').mode, 'derived_projection')
  assert.equal(records.get('external_document').mode, 'external_reference_only')
  assert.equal(records.get('inbound_integration_event').mode, 'append_only_persisted')
})

test('traces every A1-F8 phase to a baseline record', () => {
  const baseline = fixture().baseline
  assert.equal(CONVEYANCER_PRODUCT_PHASE_IDS.length, 45)
  assert.deepEqual(baseline.phaseTraceability.map((item) => item.phase), CONVEYANCER_PRODUCT_PHASE_IDS)
  assert.equal(baseline.phaseTraceability.every((item) => item.verificationRequired), true)
})

test('requires independent approval from all six P0 owners', () => {
  const missing = fixture({ approvals: approvals().slice(0, 5) })
  assert.equal(missing.ok, false)
  assert.equal(missing.errors.includes('product_baseline_approval_coverage_invalid'), true)
  const duplicateUsers = approvals({ legal: { userId: 'approver:product' } })
  const duplicate = fixture({ approvals: duplicateUsers })
  assert.equal(duplicate.errors.includes('product_baseline_independent_approvers_required'), true)
})

test('rejects stale, rejected or unreferenced approvals', () => {
  const stale = fixture({ approvals: approvals({ security: { approvedAt: '2026-07-15T07:00:00.000Z' } }) })
  assert.equal(stale.errors.includes('product_baseline_approval_invalid'), true)
  const rejected = fixture({ approvals: approvals({ legal: { decision: 'rejected' } }) })
  assert.equal(rejected.ok, false)
})

test('prevents external systems from becoming canonical truth', () => {
  const baseline = fixture().baseline
  assert.equal(baseline.sourceOfTruthMatrix.every((item) => item.externalOverwriteAllowed === false), true)
  assert.equal(baseline.sourceOfTruthMatrix.find((item) => item.domain === 'registration').canonicalSource, 'reviewed_registration_evidence')
  assert.equal(baseline.sourceOfTruthMatrix.find((item) => item.domain === 'provider_events').conflictPolicy, 'idempotency_or_quarantine')
})

test('defines fail-closed migration and recovery controls', () => {
  const policy = fixture().baseline.migrationPolicy
  assert.equal(policy.strategy, 'expand_migrate_verify_contract')
  assert.equal(policy.destructiveRollbackAllowed, false)
  assert.equal(policy.dryRunRequired, true)
  assert.equal(policy.restoreTestRequired, true)
  assert.equal(policy.fingerprintReconciliationRequired, true)
  assert.equal(policy.rollbackOwnerRequired, true)
})

test('covers tenancy, privilege, privacy, financial and continuity threats', () => {
  const categories = new Set(fixture().baseline.threatModel.map((item) => item.category))
  for (const category of ['tenancy', 'privilege', 'privacy', 'financial', 'migration', 'continuity']) assert.equal(categories.has(category), true)
  assert.equal(fixture().baseline.threatModel.filter((item) => item.severity === 'critical').length >= 10, true)
})

test('evaluates measurable P0 exit gates before P1', () => {
  const baseline = fixture().baseline
  const ready = evaluateConveyancerProductBaselineMetrics({ baseline, measurements: passingMeasurements() })
  assert.equal(ready.decision, 'ready_for_p1')
  assert.equal(ready.failures.length, 0)
  const blocked = evaluateConveyancerProductBaselineMetrics({ baseline, measurements: { ...passingMeasurements(), provider_required_for_manual_workflow: 1 } })
  assert.equal(blocked.decision, 'blocked')
  assert.deepEqual(blocked.failures, ['provider_required_for_manual_workflow'])
})

test('detects terminology, traceability, control and fingerprint tampering', () => {
  const baseline = fixture().baseline
  const terminology = structuredClone(baseline); terminology.canonicalTerms.matterStatuses.completed = 'done'
  assert.equal(validateConveyancerProductBaseline(terminology).errors.includes('product_baseline_terminology_drift'), true)
  const trace = structuredClone(baseline); trace.phaseTraceability.pop()
  assert.equal(validateConveyancerProductBaseline(trace).errors.includes('product_baseline_phase_traceability_invalid'), true)
  const boundary = structuredClone(baseline); boundary.controls.databaseWritesPerformed = true
  assert.equal(validateConveyancerProductBaseline(boundary).errors.includes('product_baseline_side_effect_boundary_violated'), true)
  const fingerprint = structuredClone(baseline); fingerprint.releaseCandidateId = 'release:changed'
  assert.equal(validateConveyancerProductBaseline(fingerprint).errors.includes('product_baseline_fingerprint_invalid'), true)
})

test('serializes redacted baseline evidence without approver identities or secrets', () => {
  const baseline = fixture().baseline
  const metrics = evaluateConveyancerProductBaselineMetrics({ baseline, measurements: passingMeasurements() })
  const serialized = serializeConveyancerProductBaselineEvidence({ baseline: { ...baseline, apiKey: 'SECRET', customerIdentity: 'SECRET' }, metricEvaluation: metrics })
  assert.equal(serialized.includes('SECRET'), false)
  assert.equal(serialized.includes('approver:legal'), false)
  assert.equal(serialized.includes('apiKey'), false)
  assert.equal(serialized.includes('ready_for_p1'), true)
})

console.log('P0 conveyancer product baseline tests passed.')
