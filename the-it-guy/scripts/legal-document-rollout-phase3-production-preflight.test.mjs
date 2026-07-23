import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  assessLegalDocumentRolloutPhase3,
  createPendingLegalDocumentRolloutPhase3Receipt,
  rolloutPhase3ManifestDigest,
} from './legal-document-rollout-phase3-policy.mjs'
import {
  finalizeLegalDocumentRolloutPhase3Receipt,
} from './legal-document-rollout-phase3-finalize.mjs'

const now = Date.parse('2026-07-23T12:00:00.000Z')
const timestamp = (minutes) => new Date(Date.parse('2026-07-23T11:00:00.000Z') + minutes * 60_000).toISOString()
const digest = (character) => `sha256:${character.repeat(64)}`
const commit = 'a'.repeat(40)
const phase2Commit = 'b'.repeat(40)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function phase0Freeze() {
  return {
    manifestDigest: digest('0'),
    productionProjectRef: 'productionref001',
    templateReview: { boundB1ManifestDigest: digest('1') },
  }
}

function phase1Receipt() {
  return {
    status: 'staging_evidence_recorded',
    manifestDigest: digest('2'),
    environment: {
      productionProjectRef: 'productionref001',
      stagingProjectRef: 'stagingref001',
      stagingOrigin: 'https://stagingref001.supabase.co',
    },
    source: {
      commitSha: commit,
      packageLockSha256: digest('3'),
    },
    artifacts: {
      migrationSetDigest: digest('4'),
      edgeFunctionDeployUnitSha256: digest('5'),
      applicationManifestSha256: digest('6'),
      migrations: [
        { version: '202607220002', sha256: digest('7') },
        { version: '202607220003', sha256: digest('8') },
      ],
      edgeFunctions: [
        { name: 'generate-mandate', sourceTreeSha256: digest('9') },
        { name: 'generate-final-signed-document', sourceTreeSha256: digest('a') },
      ],
      releaseOrder: { constrainedFunctions: ['generate-final-signed-document'] },
    },
    evidence: { evidenceRecordedAt: timestamp(0) },
  }
}

function phase2Receipt() {
  return {
    status: 'acceptance_evidence_recorded',
    manifestDigest: digest('b'),
    environment: {
      productionProjectRef: 'productionref001',
      stagingProjectRef: 'stagingref001',
      stagingOrigin: 'https://stagingref001.supabase.co',
    },
    source: {
      phase1ReceiptManifestDigest: digest('2'),
      commitSha: commit,
      packageLockSha256: digest('3'),
    },
    evidence: { acceptanceRecordedAt: timestamp(10) },
  }
}

function phase2History() {
  return {
    receiptCommitSha: phase2Commit,
    receiptManifestDigest: digest('b'),
    receiptStatus: 'acceptance_evidence_recorded',
    phase1ReceiptManifestDigest: digest('2'),
  }
}

function fixture() {
  const p0 = phase0Freeze()
  const p1 = phase1Receipt()
  const p2 = phase2Receipt()
  const receipt = createPendingLegalDocumentRolloutPhase3Receipt({
    phase0Freeze: p0,
    phase1Receipt: p1,
    phase2Receipt: p2,
    phase2History: phase2History(),
    productionProjectRef: 'productionref001',
    productionOrigin: 'https://productionref001.supabase.co',
    productionUrl: 'https://legal.example.test',
    preparedBy: 'Release Manager',
    changeReference: 'REL-004',
    preparedAt: timestamp(20),
  })
  return {
    receipt,
    phase0Freeze: p0,
    phase0Report: {
      status: 'FROZEN',
      evidence: { phase1ReceiptChangeCount: 2, phase2ReceiptChangeCount: 1, phase3ReceiptChangeCount: 0 },
    },
    phase1Receipt: p1,
    phase1Report: { status: 'STAGING_EVIDENCE_RECORDED' },
    phase2Receipt: p2,
    phase2Report: { status: 'STAGING_ACCEPTANCE_RECORDED' },
    phase2History: phase2History(),
  }
}

function recordedEvidence() {
  const migrations = [
    {
      version: '202607220002',
      migrationSha256: digest('7'),
      targetProjectRef: 'productionref001',
      predecessorLedgerEvidenceDigest: digest('c'),
      ledgerEvidenceDigest: digest('d'),
      applied: true,
      catalogChecks: 'pass',
      behaviorChecks: 'pass',
      noResidue: 'pass',
      observedAt: timestamp(22),
      reviewedBy: 'Database Reviewer',
    },
    {
      version: '202607220003',
      migrationSha256: digest('8'),
      targetProjectRef: 'productionref001',
      predecessorLedgerEvidenceDigest: digest('d'),
      ledgerEvidenceDigest: digest('e'),
      applied: true,
      catalogChecks: 'pass',
      behaviorChecks: 'pass',
      noResidue: 'pass',
      observedAt: timestamp(23),
      reviewedBy: 'Database Reviewer',
    },
  ]
  return {
    preflightRecordedBy: 'Production Operator',
    reviewedBy: 'Release Reviewer',
    preflightRecordedAt: timestamp(30),
    overallEvidenceDigest: digest('f'),
    productionDeployment: {
      status: 'attested',
      provider: 'vercel',
      deploymentId: 'dpl_production_123',
      target: 'production',
      state: 'READY',
      productionUrl: 'https://legal.example.test',
      productionSupabaseOrigin: 'https://productionref001.supabase.co',
      sourceCommitSha: commit,
      deploymentMetadataEvidenceDigest: digest('0'),
      releaseMarkerEvidenceDigest: digest('1'),
      artifactManifestSha256: digest('2'),
      indexHtmlSha256: digest('3'),
      artifactTreeSha256: digest('4'),
      attestedAt: timestamp(21),
    },
    productionDatabase: {
      status: 'attested',
      baselineLedgerEvidenceDigest: digest('c'),
      finalLedgerEvidenceDigest: digest('e'),
      migrationEvidence: migrations,
      reviewedAt: timestamp(24),
      reviewedBy: 'Database Reviewer',
    },
    productionFunctions: {
      status: 'attested',
      edgeFunctionEvidence: [
        {
          name: 'generate-mandate',
          sourceTreeSha256: digest('9'),
          deployUnitSha256: digest('5'),
          targetProjectRef: 'productionref001',
          providerRevision: 'rev-mandate-1',
          deploymentReference: 'deploy-mandate-1',
          observedAt: timestamp(22),
        },
        {
          name: 'generate-final-signed-document',
          sourceTreeSha256: digest('a'),
          deployUnitSha256: digest('5'),
          targetProjectRef: 'productionref001',
          providerRevision: 'rev-final-1',
          deploymentReference: 'deploy-final-1',
          observedAt: timestamp(23),
        },
      ],
      configurationReviews: [
        {
          name: 'generate-final-signed-document',
          targetProjectRef: 'productionref001',
          configurationEvidenceDigest: digest('6'),
          reviewedAt: timestamp(24),
          reviewedBy: 'Function Reviewer',
        },
      ],
      reviewedAt: timestamp(24),
      reviewedBy: 'Function Reviewer',
    },
    runtimeHold: {
      status: 'attested',
      pilotEnabled: false,
      organisationIdsSentinel: '__none__',
      creationPaused: true,
      scaleEnabled: false,
      generationEnabled: false,
      customerDeliveryEnabled: false,
      evidenceDigest: digest('7'),
      reviewedAt: timestamp(25),
      reviewedBy: 'Operations Reviewer',
    },
    templateRelease: {
      status: 'attested',
      boundB1ManifestDigest: digest('1'),
      templateRouteSetDigest: digest('8'),
      routableTemplateCount: 3,
      evidenceDigest: digest('9'),
      reviewedAt: timestamp(26),
      reviewedBy: 'Legal Reviewer',
    },
    operationsReadiness: {
      status: 'attested',
      operationsOwner: 'Operations Owner',
      monitoringEvidenceDigest: digest('a'),
      incidentRunbookDigest: digest('b'),
      rollbackPlanEvidenceDigest: digest('c'),
      rollbackDryRunEvidenceDigest: digest('d'),
      evidenceDigest: digest('e'),
      reviewedAt: timestamp(27),
      reviewedBy: 'Operations Reviewer',
    },
  }
}

function codes(result) {
  return result.blockers.map((blocker) => blocker.code)
}

const pending = fixture()
const planned = assessLegalDocumentRolloutPhase3({ ...pending, now })
assert.equal(planned.status, 'PRODUCTION_PREFLIGHT_PLANNED')
assert.equal(planned.blockerCount, 0)
assert.equal(planned.pendingCount, 1)
assert.equal(planned.mutatedData, false)
assert.ok(planned.doesNotAuthorize.includes('pilot_or_cohort_activation'))

const finalized = finalizeLegalDocumentRolloutPhase3Receipt({ pendingPlan: pending.receipt, evidenceInput: recordedEvidence(), now })
const recorded = {
  ...pending,
  receipt: finalized,
  phase0Report: {
    ...pending.phase0Report,
    evidence: { ...pending.phase0Report.evidence, phase3ReceiptChangeCount: 1 },
  },
}
const completed = assessLegalDocumentRolloutPhase3({ ...recorded, now })
assert.equal(completed.status, 'PRODUCTION_PREFLIGHT_RECORDED')
assert.equal(completed.blockerCount, 0)

for (const [label, mutate, expectedCode] of [
  ['phase two acceptance', (value) => { value.phase2Report.status = 'HOLD' }, 'P3_PHASE2_NOT_ACCEPTED'],
  ['phase two committed history', (value) => { value.phase2History.receiptCommitSha = commit }, 'P3_PHASE2_COMMITTED_HISTORY_INVALID'],
  ['production deployment source', (value) => { value.receipt.execution.productionDeployment.sourceCommitSha = phase2Commit }, 'P3_PRODUCTION_DEPLOYMENT_BINDING_INVALID'],
  ['runtime hold', (value) => { value.receipt.execution.runtimeHold.customerDeliveryEnabled = true }, 'P3_RUNTIME_HOLD_INVALID'],
  ['migration source', (value) => { value.receipt.execution.productionDatabase.migrationEvidence[0].migrationSha256 = digest('f') }, 'P3_PRODUCTION_MIGRATION_BINDING_INVALID'],
  ['template review', (value) => { value.receipt.execution.templateRelease.boundB1ManifestDigest = digest('f') }, 'P3_TEMPLATE_RELEASE_EVIDENCE_INVALID'],
  ['receipt history', (value) => { value.phase0Report.evidence.phase3ReceiptChangeCount = 0 }, 'P3_RECEIPT_HISTORY_INVALID'],
]) {
  const value = clone(recorded)
  mutate(value)
  value.receipt.manifestDigest = rolloutPhase3ManifestDigest(value.receipt)
  assert.ok(codes(assessLegalDocumentRolloutPhase3({ ...value, now })).includes(expectedCode), `${label} should produce ${expectedCode}`)
}

const staleParent = clone(recorded)
staleParent.phase2Receipt.evidence.acceptanceRecordedAt = '2026-07-22T09:00:00.000Z'
assert.ok(codes(assessLegalDocumentRolloutPhase3({ ...staleParent, now })).includes('P3_PARENT_EVIDENCE_STALE_OR_ORDER_INVALID'))

assert.throws(
  () => finalizeLegalDocumentRolloutPhase3Receipt({
    pendingPlan: pending.receipt,
    evidenceInput: { ...recordedEvidence(), runtimeHold: { ...recordedEvidence().runtimeHold, secretValue: 'not-allowed' } },
    now,
  }),
  /Evidence input has missing or unknown fields|forbidden sensitive field/,
)

const policy = fs.readFileSync(new URL('./legal-document-rollout-phase3-policy.mjs', import.meta.url), 'utf8')
const plan = fs.readFileSync(new URL('./legal-document-rollout-phase3-plan.mjs', import.meta.url), 'utf8')
const verify = fs.readFileSync(new URL('./legal-document-rollout-phase3-verify.mjs', import.meta.url), 'utf8')
const workOrder = fs.readFileSync(new URL('./legal-document-rollout-phase3-work-order.mjs', import.meta.url), 'utf8')
for (const source of [policy, plan, verify, workOrder]) {
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|fetch\(|npx\s+supabase|secrets\s+(?:list|set)|writeFileSync/)
}
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
for (const name of [
  'test:legal-documents:rollout-phase3',
  'plan:legal-documents:rollout-phase3',
  'work-order:legal-documents:rollout-phase3',
  'finalize:legal-documents:rollout-phase3',
  'verify:legal-documents:rollout-phase3',
]) assert.ok(pkg.scripts?.[name], `Missing ${name}`)

console.log('Legal-document rollout Phase 3 production-preflight contract passed.')
