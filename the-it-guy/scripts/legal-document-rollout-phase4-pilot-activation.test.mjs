import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  assessLegalDocumentRolloutPhase4,
  createPendingLegalDocumentRolloutPhase4Receipt,
  rolloutPhase4ManifestDigest,
} from './legal-document-rollout-phase4-policy.mjs'
import {
  finalizeLegalDocumentRolloutPhase4Receipt,
} from './legal-document-rollout-phase4-finalize.mjs'

const now = Date.parse('2026-07-23T10:25:00.000Z')
const timestamp = (minutes) => new Date(Date.parse('2026-07-23T10:00:00.000Z') + minutes * 60_000).toISOString()
const digest = (character) => `sha256:${character.repeat(64)}`
const sourceCommit = 'a'.repeat(40)
const phase2Commit = 'b'.repeat(40)
const phase3Commit = 'c'.repeat(40)
const organisationId = '11111111-1111-4111-8111-111111111111'
const productionProjectRef = 'productionref001'
const productionOrigin = `https://${productionProjectRef}.supabase.co`
const productionUrl = 'https://legal.example.test'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function phase0Freeze() {
  return {
    manifestDigest: digest('0'),
    productionProjectRef,
  }
}

function phase1Receipt() {
  return {
    status: 'staging_evidence_recorded',
    manifestDigest: digest('1'),
    environment: {
      productionProjectRef,
      stagingProjectRef: 'stagingref001',
      stagingOrigin: 'https://stagingref001.supabase.co',
    },
    source: {
      commitSha: sourceCommit,
      packageLockSha256: digest('2'),
    },
  }
}

function phase2Receipt() {
  return {
    status: 'acceptance_evidence_recorded',
    manifestDigest: digest('3'),
    environment: {
      productionProjectRef,
      stagingProjectRef: 'stagingref001',
      stagingOrigin: 'https://stagingref001.supabase.co',
    },
    source: {
      phase1ReceiptManifestDigest: digest('1'),
      commitSha: sourceCommit,
      packageLockSha256: digest('2'),
    },
  }
}

function phase3Receipt() {
  return {
    status: 'production_preflight_recorded',
    manifestDigest: digest('4'),
    environment: {
      productionProjectRef,
      productionOrigin,
      productionUrl,
    },
    source: {
      phase2ReceiptManifestDigest: digest('3'),
      phase2ReceiptCommitSha: phase2Commit,
      commitSha: sourceCommit,
      packageLockSha256: digest('2'),
    },
    evidence: {
      preflightRecordedAt: timestamp(0),
    },
    execution: {
      productionDeployment: {
        artifactTreeSha256: digest('5'),
      },
      overallEvidenceDigest: digest('6'),
    },
  }
}

function phase3History() {
  return {
    receiptCommitSha: phase3Commit,
    receiptManifestDigest: digest('4'),
    receiptStatus: 'production_preflight_recorded',
    phase2ReceiptManifestDigest: digest('3'),
    phase2ReceiptCommitSha: phase2Commit,
    sourceCommitSha: sourceCommit,
  }
}

function fixture() {
  const p0 = phase0Freeze()
  const p1 = phase1Receipt()
  const p2 = phase2Receipt()
  const p3 = phase3Receipt()
  const receipt = createPendingLegalDocumentRolloutPhase4Receipt({
    phase0Freeze: p0,
    phase1Receipt: p1,
    phase2Receipt: p2,
    phase3Receipt: p3,
    phase3History: phase3History(),
    organisationId,
    productionProjectRef,
    productionOrigin,
    productionUrl,
    preparedBy: 'Release Manager',
    changeReference: 'REL-005',
    approvedBy: 'Release Approver',
    approvedAt: timestamp(5),
    approvalReference: 'CAB-005',
    legalApprovalEvidenceDigest: digest('7'),
    releaseApprovalEvidenceDigest: digest('8'),
    preparedAt: timestamp(10),
  })
  return {
    receipt,
    phase0Freeze: p0,
    phase0Report: {
      status: 'FROZEN',
      evidence: {
        phase1ReceiptChangeCount: 2,
        phase2ReceiptChangeCount: 1,
        phase3ReceiptChangeCount: 1,
        phase4ReceiptChangeCount: 0,
      },
    },
    phase1Receipt: p1,
    phase1Report: { status: 'STAGING_EVIDENCE_RECORDED' },
    phase2Receipt: p2,
    phase2Report: { status: 'STAGING_ACCEPTANCE_RECORDED' },
    phase3Receipt: p3,
    phase3Report: { status: 'PRODUCTION_PREFLIGHT_RECORDED' },
    phase3History: phase3History(),
  }
}

function recordedEvidence(plan) {
  const cohortDigest = plan.cohort.cohortDigest
  return {
    activationRecordedAt: timestamp(20),
    activationRecordedBy: 'Production Operator',
    reviewedBy: 'Release Reviewer',
    overallEvidenceDigest: digest('9'),
    preActivation: {
      status: 'attested',
      productionProjectRef,
      pilotEnabled: false,
      organisationIdsSentinel: '__none__',
      scaleEnabled: false,
      evidenceDigest: digest('a'),
      checkedAt: timestamp(12),
      checkedBy: 'Production Operator',
    },
    candidateReadiness: {
      status: 'attested',
      organisationId,
      activeAgentCount: 2,
      requiredPacketTypes: ['mandate', 'otp'],
      preferredAttorneyVerified: true,
      templateRouteSetDigest: digest('b'),
      legalTemplateBindingDigest: digest('c'),
      evidenceDigest: digest('d'),
      assessedAt: timestamp(13),
      assessedBy: 'Legal Reviewer',
    },
    activation: {
      status: 'attested',
      productionProjectRef,
      organisationIds: [organisationId],
      cohortDigest,
      pilotEnabled: true,
      activationPlanDigest: plan.source.activationPlanDigest,
      runtimeGuardContract: 'legal-document-pilot-release-v1',
      activatedAt: timestamp(15),
      activatedBy: 'Production Operator',
      activationReference: 'P4-ACT-001',
      configurationEvidenceDigest: digest('e'),
      verificationEvidenceDigest: digest('f'),
      routeCoverageEvidenceDigest: digest('0'),
      evidenceDigest: digest('1'),
    },
    monitoring: {
      status: 'armed',
      watchdogContract: 'phase5-f2-f3-f4-v2',
      scopeMode: 'configured_organisations',
      cohortDigest,
      snapshotStatus: 'warning_empty',
      blockerCount: 0,
      schedulerEvidenceDigest: digest('2'),
      probeEvidenceDigest: digest('3'),
      evidenceDigest: digest('4'),
      checkedAt: timestamp(16),
      checkedBy: 'Operations Reviewer',
    },
    rollbackReadiness: {
      status: 'attested',
      productionProjectRef,
      rollbackOwner: 'Operations Owner',
      rollbackPlanEvidenceDigest: digest('5'),
      darkLaunchRestoreEvidenceDigest: digest('6'),
      dryRunEvidenceDigest: digest('7'),
      evidenceDigest: digest('8'),
      checkedAt: timestamp(14),
      checkedBy: 'Operations Reviewer',
    },
  }
}

function codes(result) {
  return result.blockers.map((blocker) => blocker.code)
}

function rehash(receipt) {
  receipt.manifestDigest = rolloutPhase4ManifestDigest(receipt)
}

const pending = fixture()
const planned = assessLegalDocumentRolloutPhase4({ ...pending, now })
assert.equal(planned.status, 'PILOT_ACTIVATION_PLANNED')
assert.equal(planned.blockerCount, 0)
assert.equal(planned.pendingCount, 1)
assert.equal(planned.mutatedData, false)
assert.equal(planned.evidence.cohortSize, 1)
assert.ok(planned.doesNotAuthorize.includes('cohort_expansion_or_scale'))
assert.ok(planned.doesNotVerify.includes('a_completed_customer_mandate_or_otp_lifecycle'))

const finalized = finalizeLegalDocumentRolloutPhase4Receipt({
  pendingPlan: pending.receipt,
  evidenceInput: recordedEvidence(pending.receipt),
  now,
})
const recorded = {
  ...pending,
  receipt: finalized,
  phase0Report: {
    ...pending.phase0Report,
    evidence: { ...pending.phase0Report.evidence, phase4ReceiptChangeCount: 1 },
  },
}
const completed = assessLegalDocumentRolloutPhase4({ ...recorded, now })
assert.equal(completed.status, 'PILOT_ACTIVATION_RECORDED')
assert.equal(completed.blockerCount, 0)
assert.equal(completed.pendingCount, 0)

for (const [label, mutate, expectedCode] of [
  ['Phase 3 report status before activation', (value) => { value.phase3Report.status = 'HOLD' }, 'P4_PHASE3_NOT_PREFLIGHTED'],
  ['Phase 2 acceptance status before activation', (value) => { value.phase2Report.status = 'HOLD' }, 'P4_PHASE2_NOT_ACCEPTED'],
  ['approval after plan preparation', (value) => { value.receipt.approval.approvedAt = timestamp(11) }, 'P4_APPROVAL_ORDER_INVALID'],
]) {
  const value = clone(pending)
  mutate(value)
  assert.ok(codes(assessLegalDocumentRolloutPhase4({ ...value, now })).includes(expectedCode), `${label} should produce ${expectedCode}`)
}

const expiredPending = assessLegalDocumentRolloutPhase4({
  ...pending,
  now: Date.parse('2026-07-23T10:41:00.000Z'),
})
assert.ok(codes(expiredPending).includes('P4_SEALED_ACTIVATION_WINDOW_EXPIRED'), 'A sealed pending activation plan must expire after 30 minutes.')

for (const [label, mutate, expectedCode] of [
  ['committed Phase 3 history', (value) => { value.phase3History.receiptCommitSha = sourceCommit }, 'P4_PHASE3_COMMITTED_HISTORY_INVALID'],
  ['Phase 3 deployment artifact', (value) => { value.phase3Receipt.execution.productionDeployment.artifactTreeSha256 = digest('f') }, 'P4_PARENT_OR_SOURCE_DRIFT'],
  ['cohort expansion', (value) => { value.receipt.cohort.organisationIds.push('22222222-2222-4222-8222-222222222222') }, 'P4_COHORT_SCOPE_INVALID'],
  ['sealed activation plan digest', (value) => { value.receipt.source.activationPlanDigest = digest('f') }, 'P4_ACTIVATION_PLAN_DIGEST_INVALID'],
  ['runtime activation plan binding', (value) => { value.receipt.execution.activation.activationPlanDigest = digest('f') }, 'P4_RUNTIME_ACTIVATION_INVALID'],
  ['scoped watchdog blockers', (value) => { value.receipt.execution.monitoring.blockerCount = 1 }, 'P4_MONITORING_ARMING_INVALID'],
  ['dark-launch rollback evidence', (value) => { value.receipt.execution.rollbackReadiness.dryRunEvidenceDigest = null }, 'P4_ROLLBACK_READINESS_INVALID'],
  ['recorded Phase 4 receipt count', (value) => { value.phase0Report.evidence.phase4ReceiptChangeCount = 0 }, 'P4_RECEIPT_HISTORY_INVALID'],
]) {
  const value = clone(recorded)
  mutate(value)
  rehash(value.receipt)
  assert.ok(codes(assessLegalDocumentRolloutPhase4({ ...value, now })).includes(expectedCode), `${label} should produce ${expectedCode}`)
}

assert.throws(
  () => finalizeLegalDocumentRolloutPhase4Receipt({
    pendingPlan: pending.receipt,
    evidenceInput: {
      ...recordedEvidence(pending.receipt),
      activation: { ...recordedEvidence(pending.receipt).activation, rawLog: 'forbidden' },
    },
    now,
  }),
  /forbidden sensitive field/,
)

const policy = fs.readFileSync(new URL('./legal-document-rollout-phase4-policy.mjs', import.meta.url), 'utf8')
const finalizer = fs.readFileSync(new URL('./legal-document-rollout-phase4-finalize.mjs', import.meta.url), 'utf8')
const plan = fs.readFileSync(new URL('./legal-document-rollout-phase4-plan.mjs', import.meta.url), 'utf8')
const verify = fs.readFileSync(new URL('./legal-document-rollout-phase4-verify.mjs', import.meta.url), 'utf8')
const workOrder = fs.readFileSync(new URL('./legal-document-rollout-phase4-work-order.mjs', import.meta.url), 'utf8')
for (const source of [policy, finalizer, plan, verify, workOrder]) {
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|fetch\(|npx\s+supabase|secrets\s+(?:list|set)/)
}
for (const source of [policy, plan, verify, workOrder]) {
  assert.doesNotMatch(source, /writeFileSync/)
}
assert.match(finalizer, /RECORD_PHASE4_PILOT_ACTIVATION/)
assert.match(finalizer, /legal-document-rollout-phase4-pilot-activation\.json/)
assert.match(finalizer, /status !== 'not_recorded'/, 'The finalizer must refuse to overwrite a Phase 4 receipt that is no longer the inert frozen placeholder.')

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
for (const name of [
  'test:legal-documents:rollout-phase4',
  'plan:legal-documents:rollout-phase4',
  'work-order:legal-documents:rollout-phase4',
  'finalize:legal-documents:rollout-phase4',
  'verify:legal-documents:rollout-phase4',
]) assert.ok(pkg.scripts?.[name], `Missing ${name}`)

console.log('Legal-document rollout Phase 4 pilot-activation contract passed.')
