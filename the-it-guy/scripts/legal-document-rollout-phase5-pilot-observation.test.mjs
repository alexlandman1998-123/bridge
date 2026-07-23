import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  assessLegalDocumentRolloutPhase5,
  createPendingLegalDocumentRolloutPhase5Receipt,
  rolloutPhase5ManifestDigest,
} from './legal-document-rollout-phase5-policy.mjs'
import { rolloutPhase4ManifestDigest } from './legal-document-rollout-phase4-policy.mjs'
import { sha256Digest } from './legal-document-rollout-phase1-artifacts.mjs'
import {
  finalizeLegalDocumentRolloutPhase5Receipt,
} from './legal-document-rollout-phase5-finalize.mjs'

const now = Date.parse('2026-07-07T01:00:00.000Z')
const activationAt = '2026-07-01T00:00:00.000Z'
const observationEnd = '2026-07-07T00:00:00.000Z'
const timestamp = (hours) => new Date(Date.parse(activationAt) + hours * 60 * 60_000).toISOString()
const digest = (character) => `sha256:${character.repeat(64)}`
const sourceCommit = 'a'.repeat(40)
const phase2Commit = 'b'.repeat(40)
const phase3Commit = 'c'.repeat(40)
const phase4Commit = 'd'.repeat(40)
const organisationId = '11111111-1111-4111-8111-111111111111'
const productionProjectRef = 'productionref001'
const productionOrigin = `https://${productionProjectRef}.supabase.co`
const productionUrl = 'https://legal.example.test'
const oneOrganisationCohortDigest = sha256Digest(organisationId)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function phase0Freeze() {
  return { manifestDigest: digest('0'), productionProjectRef }
}

function phase1Receipt() {
  return {
    status: 'staging_evidence_recorded',
    manifestDigest: digest('1'),
    environment: { productionProjectRef, stagingProjectRef: 'stagingref001', stagingOrigin: 'https://stagingref001.supabase.co' },
    source: { commitSha: sourceCommit, packageLockSha256: digest('2') },
  }
}

function phase2Receipt() {
  return {
    status: 'acceptance_evidence_recorded',
    manifestDigest: digest('3'),
    environment: { productionProjectRef, stagingProjectRef: 'stagingref001', stagingOrigin: 'https://stagingref001.supabase.co' },
    source: { phase1ReceiptManifestDigest: digest('1'), commitSha: sourceCommit, packageLockSha256: digest('2') },
  }
}

function phase3Receipt() {
  return {
    status: 'production_preflight_recorded',
    manifestDigest: digest('4'),
    environment: { productionProjectRef, productionOrigin, productionUrl },
    source: { phase2ReceiptManifestDigest: digest('3'), phase2ReceiptCommitSha: phase2Commit, commitSha: sourceCommit, packageLockSha256: digest('2') },
  }
}

function phase4Receipt() {
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_4',
    contract: 'legal-document-production-pilot-v1',
    status: 'pilot_activation_recorded',
    environment: { productionProjectRef, productionOrigin, productionUrl },
    source: {
      phase0ManifestDigest: digest('0'),
      phase1ReceiptManifestDigest: digest('1'),
      phase2ReceiptManifestDigest: digest('3'),
      phase2ReceiptCommitSha: phase2Commit,
      phase3ReceiptManifestDigest: digest('4'),
      phase3ReceiptCommitSha: phase3Commit,
      commitSha: sourceCommit,
      packageLockSha256: digest('2'),
      phase3DeploymentArtifactTreeSha256: digest('5'),
      phase3OverallEvidenceDigest: digest('6'),
      activationPlanDigest: digest('7'),
    },
    cohort: { organisationIds: [organisationId], cohortDigest: oneOrganisationCohortDigest, maxOrganisations: 1, requiredPacketTypes: ['mandate', 'otp'] },
    safety: { runtimeGuardContract: 'legal-document-pilot-release-v1' },
    execution: {
      activation: { activationPlanDigest: digest('7'), runtimeGuardContract: 'legal-document-pilot-release-v1', activatedAt: activationAt },
      monitoring: { watchdogContract: 'phase5-f2-f3-f4-v2' },
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase4ManifestDigest(receipt)
  return receipt
}

function phase4History() {
  return {
    receiptCommitSha: phase4Commit,
    receiptManifestDigest: phase4Receipt().manifestDigest,
    receiptStatus: 'pilot_activation_recorded',
    phase3ReceiptManifestDigest: digest('4'),
    phase3ReceiptCommitSha: phase3Commit,
    sourceCommitSha: sourceCommit,
    activationPlanDigest: digest('7'),
    cohortDigest: oneOrganisationCohortDigest,
    organisationIds: [organisationId],
    runtimeGuardContract: 'legal-document-pilot-release-v1',
    watchdogContract: 'phase5-f2-f3-f4-v2',
  }
}

function fixture() {
  const p0 = phase0Freeze()
  const p1 = phase1Receipt()
  const p2 = phase2Receipt()
  const p3 = phase3Receipt()
  const p4 = phase4Receipt()
  const receipt = createPendingLegalDocumentRolloutPhase5Receipt({
    phase0Freeze: p0,
    phase1Receipt: p1,
    phase2Receipt: p2,
    phase3Receipt: p3,
    phase4Receipt: p4,
    phase4History: phase4History(),
    preparedBy: 'Release Manager',
    changeReference: 'REL-006',
    preparedAt: timestamp(1),
  })
  return {
    receipt,
    phase0Freeze: p0,
    phase0Report: { status: 'FROZEN', evidence: { phase1ReceiptChangeCount: 2, phase2ReceiptChangeCount: 1, phase3ReceiptChangeCount: 1, phase4ReceiptChangeCount: 1, phase5ReceiptChangeCount: 0 } },
    phase1Receipt: p1,
    phase1Report: { status: 'STAGING_EVIDENCE_RECORDED' },
    phase2Receipt: p2,
    phase2Report: { status: 'STAGING_ACCEPTANCE_RECORDED' },
    phase3Receipt: p3,
    phase3Report: { status: 'PRODUCTION_PREFLIGHT_RECORDED' },
    phase4Receipt: p4,
    phase4Report: { status: 'PILOT_ACTIVATION_RECORDED' },
    phase4History: phase4History(),
  }
}

function stage(character, hours) {
  return { status: 'attested', releaseMarkerBound: true, evidenceDigest: digest(character), observedAt: timestamp(hours) }
}

function lifecycleProof(packetType, referenceCharacter, startHour) {
  return {
    packetType,
    organisationId,
    packetReferenceDigest: digest(referenceCharacter),
    cohortDigest: oneOrganisationCohortDigest,
    activationPlanDigest: digest('7'),
    lifecycleTraceContract: 'legal-document-pilot-lifecycle-trace-v1',
    generation: stage('a', startHour),
    signing: stage('b', startHour + 1),
    f2FinalArtifact: stage('c', startHour + 2),
    f3DeliveryAndTransaction: stage('d', startHour + 3),
    f4SurfaceCompletion: stage('e', startHour + 4),
    finalResolverAccess: stage('f', startHour + 5),
    completedAt: timestamp(startHour + 5),
    evidenceDigest: digest('9'),
  }
}

function recordedEvidence() {
  return {
    observationRecordedAt: timestamp(144.5),
    observationRecordedBy: 'Production Observer',
    reviewedBy: 'Release Reviewer',
    overallEvidenceDigest: digest('a'),
    lifecycleProofs: [
      lifecycleProof('mandate', '1', 2),
      lifecycleProof('otp', '2', 24),
    ],
    monitoring: {
      status: 'attested',
      watchdogContract: 'phase5-f2-f3-f4-v2',
      runtimeGuardContract: 'legal-document-pilot-release-v1',
      scopeMode: 'configured_organisations',
      organisationIds: [organisationId],
      cohortDigest: oneOrganisationCohortDigest,
      activationPlanDigest: digest('7'),
      observationStartedAt: activationAt,
      observationEndedAt: observationEnd,
      healthyScopedSnapshotCount: 7,
      warningScopedSnapshotCount: 0,
      criticalScopedSnapshotCount: 0,
      blockerCount: 0,
      maximumObservedGapMinutes: 90,
      snapshotEvidenceDigest: digest('b'),
      evidenceDigest: digest('c'),
      reviewedAt: timestamp(144.25),
      reviewedBy: 'Operations Reviewer',
    },
    reconciliation: {
      status: 'attested',
      organisationIds: [organisationId],
      cohortDigest: oneOrganisationCohortDigest,
      activationPlanDigest: digest('7'),
      packetTypes: ['mandate', 'otp'],
      unresolvedGenerationFailures: 0,
      staleSigningPackets: 0,
      missingFinalArtifacts: 0,
      f2Failures: 0,
      f3Failures: 0,
      f4Failures: 0,
      finalResolverAccessFailures: 0,
      blockerCount: 0,
      evidenceDigest: digest('d'),
      reviewedAt: timestamp(144.3),
      reviewedBy: 'Operations Reviewer',
    },
    rollbackReadiness: {
      status: 'attested',
      organisationIds: [organisationId],
      activationPlanDigest: digest('7'),
      pilotEnabled: true,
      creationPaused: true,
      scaleEnabled: false,
      rollbackPlanEvidenceDigest: digest('e'),
      darkLaunchRestoreEvidenceDigest: digest('f'),
      evidenceDigest: digest('0'),
      checkedAt: timestamp(144.4),
      checkedBy: 'Operations Reviewer',
    },
  }
}

function codes(result) {
  return result.blockers.map((blocker) => blocker.code)
}

function rehash(receipt) {
  receipt.manifestDigest = rolloutPhase5ManifestDigest(receipt)
}

const pending = fixture()
const planned = assessLegalDocumentRolloutPhase5({ ...pending, now: Date.parse(timestamp(2)) })
assert.equal(planned.status, 'PILOT_OBSERVATION_PLANNED')
assert.equal(planned.blockerCount, 0)
assert.equal(planned.pendingCount, 1)
assert.equal(planned.mutatedData, false)
assert.equal(planned.evidence.cohortSize, 1)
assert.ok(planned.doesNotAuthorize.includes('cohort_expansion_or_scale'))
assert.ok(planned.doesNotVerify.includes('future_customer_lifecycles_after_the_observation_window'))

const finalized = finalizeLegalDocumentRolloutPhase5Receipt({ pendingPlan: pending.receipt, evidenceInput: recordedEvidence(), now })
const recorded = {
  ...pending,
  receipt: finalized,
  phase0Report: {
    ...pending.phase0Report,
    evidence: { ...pending.phase0Report.evidence, phase5ReceiptChangeCount: 1 },
  },
}
const completed = assessLegalDocumentRolloutPhase5({ ...recorded, now })
assert.equal(completed.status, 'PILOT_OBSERVATION_RECORDED')
assert.equal(completed.blockerCount, 0)
assert.equal(completed.pendingCount, 0)

for (const [label, mutate, expectedCode] of [
  ['committed Phase 4 history', (value) => { value.phase4History.receiptCommitSha = sourceCommit }, 'P5_PHASE4_COMMITTED_HISTORY_INVALID'],
  ['cohort expansion', (value) => { value.receipt.cohort.organisationIds.push('22222222-2222-4222-8222-222222222222') }, 'P5_COHORT_SCOPE_INVALID'],
  ['lifecycle release marker drift', (value) => { value.receipt.execution.lifecycleProofs[0].generation.releaseMarkerBound = false }, 'P5_LIFECYCLE_PROOF_INVALID'],
  ['fewer than seven healthy snapshots', (value) => { value.receipt.execution.monitoring.healthyScopedSnapshotCount = 6 }, 'P5_SCOPED_WATCHDOG_OBSERVATION_INVALID'],
  ['a warning snapshot', (value) => { value.receipt.execution.monitoring.warningScopedSnapshotCount = 1 }, 'P5_SCOPED_WATCHDOG_OBSERVATION_INVALID'],
  ['short observation window', (value) => { value.receipt.execution.monitoring.observationEndedAt = timestamp(143) }, 'P5_SCOPED_WATCHDOG_OBSERVATION_INVALID'],
  ['evidence digest tamper', (value) => { value.receipt.evidence.reviewedBy = 'Different Reviewer' }, 'P5_EVIDENCE_PACKET_DIGEST_INVALID'],
  ['scale posture drift', (value) => { value.receipt.execution.rollbackReadiness.scaleEnabled = true }, 'P5_NO_SCALE_ROLLBACK_READINESS_INVALID'],
  ['recorded Phase 5 receipt count', (value) => { value.phase0Report.evidence.phase5ReceiptChangeCount = 0 }, 'P5_RECEIPT_HISTORY_INVALID'],
]) {
  const value = clone(recorded)
  mutate(value)
  rehash(value.receipt)
  assert.ok(codes(assessLegalDocumentRolloutPhase5({ ...value, now })).includes(expectedCode), `${label} should produce ${expectedCode}`)
}

assert.throws(
  () => finalizeLegalDocumentRolloutPhase5Receipt({
    pendingPlan: pending.receipt,
    evidenceInput: {
      ...recordedEvidence(),
      lifecycleProofs: [{ ...recordedEvidence().lifecycleProofs[0], emailAddress: 'forbidden' }, recordedEvidence().lifecycleProofs[1]],
    },
    now,
  }),
  /forbidden sensitive field/,
)

const policy = fs.readFileSync(new URL('./legal-document-rollout-phase5-policy.mjs', import.meta.url), 'utf8')
const context = fs.readFileSync(new URL('./legal-document-rollout-phase5-context.mjs', import.meta.url), 'utf8')
const finalizer = fs.readFileSync(new URL('./legal-document-rollout-phase5-finalize.mjs', import.meta.url), 'utf8')
const plan = fs.readFileSync(new URL('./legal-document-rollout-phase5-plan.mjs', import.meta.url), 'utf8')
const verify = fs.readFileSync(new URL('./legal-document-rollout-phase5-verify.mjs', import.meta.url), 'utf8')
const workOrder = fs.readFileSync(new URL('./legal-document-rollout-phase5-work-order.mjs', import.meta.url), 'utf8')
for (const source of [policy, context, finalizer, plan, verify, workOrder]) {
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|fetch\(|npx\s+supabase|secrets\s+(?:list|set)/)
}
for (const source of [policy, context, plan, verify, workOrder]) {
  assert.doesNotMatch(source, /writeFileSync/)
}
assert.match(finalizer, /RECORD_PHASE5_PILOT_OBSERVATION/)
assert.match(finalizer, /legal-document-rollout-phase5-pilot-observation\.json/)
assert.match(finalizer, /status !== 'not_recorded'/, 'The finalizer must refuse to overwrite a Phase 5 receipt that is no longer the inert frozen placeholder.')

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
for (const name of [
  'test:legal-documents:rollout-phase5',
  'plan:legal-documents:rollout-phase5',
  'work-order:legal-documents:rollout-phase5',
  'finalize:legal-documents:rollout-phase5',
  'verify:legal-documents:rollout-phase5',
]) assert.ok(pkg.scripts?.[name], `Missing ${name}`)

console.log('Legal-document rollout Phase 5 pilot-observation contract passed.')
