import assert from 'node:assert/strict'

import {
  BOND_APPLICATION_BROWSER_E2E_SCENARIOS,
  BOND_APPLICATION_BROWSER_E2E_VERSION,
  BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION,
  BOND_ORIGINATOR_LIVE_FLOW_MAX_EVIDENCE_AGE_HOURS,
  BOND_ORIGINATOR_LIVE_FLOW_STEPS,
  BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION,
  buildBondOriginatorLiveFlowCertification,
  buildBondOriginatorLiveFlowEvidenceTemplate,
} from '../index.js'

const generatedAt = '2026-08-28T12:00:00.000Z'
const artifactId = 'vercel-staging-artifact-9'
const fixtureId = 'bond-live-fixture-company-joint-1'

function result(item) {
  return {
    key: item.key,
    actor: item.actor,
    passed: true,
    environment: 'staging',
    fixtureId,
    artifactId,
    observedAt: '2026-08-28T11:30:00.000Z',
    evidenceRef: `playwright/${item.key}.zip`,
  }
}

function readyInput() {
  return {
    generatedAt,
    environment: 'staging',
    build: { commitSha: 'abcdef123456', artifactId, deploymentUrl: 'https://staging.example.test' },
    fixture: { id: fixtureId, version: 'fixture-v1', description: 'Joint applicants purchasing through a company' },
    promotionArtifact: { version: BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION, status: 'promotion_ready', ready: true, fingerprint: 'phase-7-v1:ready' },
    browserEvidence: {
      observedAt: '2026-08-28T11:30:00.000Z',
      contractVersion: BOND_APPLICATION_BROWSER_E2E_VERSION,
      authenticatedActors: { buyer: true, bond_originator: true },
      journeySteps: BOND_ORIGINATOR_LIVE_FLOW_STEPS.map(result),
      contractScenarios: BOND_APPLICATION_BROWSER_E2E_SCENARIOS.map(result),
      consoleErrors: [],
      apiErrors: [],
      pageErrors: [],
    },
    reconciliationEvidence: {
      firstRunActiveCount: 12,
      secondRunActiveCount: 12,
      firstRunActiveIdentities: ['primary:id', 'company:cipc'],
      secondRunActiveIdentities: ['company:cipc', 'primary:id'],
      duplicateActiveIdentityCount: 0,
      uploadedDocumentIdsBefore: ['document-1'],
      uploadedDocumentIdsAfter: ['document-1'],
    },
    artifactEvidence: {
      brandedPackDownloaded: true,
      packFingerprint: 'phase-5-v1:pack',
      controlledHandoffPrepared: true,
      handoffIdempotencyKey: 'phase-6-v1:handoff',
      artifactId,
      fixtureId,
      evidenceRef: 'playwright/download-and-handoff.zip',
    },
    versions: {
      applicationSchema: 'phase-7-v1',
      browserContract: BOND_APPLICATION_BROWSER_E2E_VERSION,
      documentRules: 'phase-2-v1',
      requirementProfile: 'za-baseline-2026-08-v1',
      reconciliation: 'phase-3-v1',
      originatorPack: 'phase-5-v1',
      controlledHandoff: 'phase-6-v1',
    },
    mutatedProduction: false,
  }
}

const template = buildBondOriginatorLiveFlowEvidenceTemplate({ generatedAt, fixtureId, artifactId })
assert.equal(template.browserEvidence.journeySteps.length, 8)
assert.equal(template.browserEvidence.contractScenarios.length, BOND_APPLICATION_BROWSER_E2E_SCENARIOS.length)
assert.equal(template.browserEvidence.journeySteps.every((item) => item.passed === false), true)

const ready = buildBondOriginatorLiveFlowCertification(readyInput())
assert.equal(BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION, 'phase-9-v1')
assert.equal(BOND_ORIGINATOR_LIVE_FLOW_MAX_EVIDENCE_AGE_HOURS, 4)
assert.equal(ready.ready, true)
assert.equal(ready.status, 'live_certification_ready')
assert.equal(ready.metrics.blockerCount, 0)
assert.match(ready.fingerprint, /^phase-9-v1:/)

function assertBlocked(mutator, keys) {
  const input = readyInput()
  mutator(input)
  const result = buildBondOriginatorLiveFlowCertification(input)
  assert.equal(result.ready, false)
  for (const key of keys) assert.ok(result.blockers.some((item) => item.key === key), `${key} should block certification`)
}

assertBlocked((input) => input.browserEvidence.journeySteps.pop(), ['journey_complete'])
assertBlocked((input) => { input.browserEvidence.consoleErrors.push('Unhandled error'); input.browserEvidence.apiErrors.push('500 /rest/v1') }, ['runtime_errors_absent'])
assertBlocked((input) => { input.browserEvidence.journeySteps[0].artifactId = 'different-build' }, ['single_build_fixture_evidence'])
assertBlocked((input) => { input.browserEvidence.journeySteps[0].actor = 'bond_originator' }, ['journey_actor_boundaries'])
assertBlocked((input) => { input.reconciliationEvidence.secondRunActiveCount = 13; input.reconciliationEvidence.duplicateActiveIdentityCount = 1 }, ['reconciliation_idempotent'])
assertBlocked((input) => input.reconciliationEvidence.uploadedDocumentIdsAfter.push('replacement'), ['uploads_preserved'])
assertBlocked((input) => { input.browserEvidence.observedAt = '2026-08-28T06:00:00.000Z' }, ['evidence_fresh'])
assertBlocked((input) => { input.promotionArtifact.ready = false; input.promotionArtifact.status = 'promotion_blocked' }, ['phase7_promotion_ready'])
assertBlocked((input) => { delete input.versions.documentRules }, ['version_manifest_complete'])
assertBlocked((input) => { input.artifactEvidence.artifactId = 'different-build' }, ['download_and_handoff_evidenced'])
assertBlocked((input) => { input.environment = 'production'; input.mutatedProduction = true }, ['staging_environment_only', 'production_untouched'])

console.log('Phase 9 authenticated live-flow certification passed')
