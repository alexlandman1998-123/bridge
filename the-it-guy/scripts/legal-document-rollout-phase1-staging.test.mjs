import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PHASE1_DATABASE_TARGET_CONTRACT,
  PHASE1_EDGE_FUNCTIONS,
  PHASE1_MIGRATIONS,
  PHASE1_SUPABASE_CLI_VERSION,
  collectLegalDocumentRolloutPhase1Artifacts,
  edgeFunctionDeployUnitDigest,
  sha256Digest,
} from './legal-document-rollout-phase1-artifacts.mjs'
import {
  ROLLOUT_PHASE1_CONTRACT,
  ROLLOUT_PHASE1_EDGE_FUNCTION_EVIDENCE_FIELDS,
  assessLegalDocumentRolloutPhase1,
  createPendingLegalDocumentRolloutPhase1Receipt,
  rolloutPhase1ManifestDigest,
} from './legal-document-rollout-phase1-policy.mjs'
import { LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION } from './legal-document-rollout-phase1-preview-attestation.mjs'

const digest = (character) => `sha256:${character.repeat(64)}`
const hexCharacters = '123456789abcdef'

function timestamp(minutes) {
  return `2026-07-22T11:${String(minutes).padStart(2, '0')}:00.000Z`
}

function expectedArtifacts({ coverageStatus = 'complete' } = {}) {
  const migrations = PHASE1_MIGRATIONS.map((migration, index) => ({
    ...migration,
    path: `supabase/migrations/${migration.file}`,
    sha256: digest(hexCharacters[index]),
    bytes: index + 1,
  }))
  const edgeFunctions = PHASE1_EDGE_FUNCTIONS.map((name, index) => ({
    name,
    sourceTreeSha256: digest(hexCharacters[index]),
    sourceFileCount: index + 1,
    configStanzaDeclared: !['generate-final-signed-otp', 'dispatch-final-signed-document'].includes(name),
  }))
  const coverage = {
    expected: migrations.map(({ version, file }) => ({ version, file })),
    covered: coverageStatus === 'complete'
      ? migrations.map(({ version, file }) => ({ version, file, stream: 'legal_document_runtime', action: 'apply_original_after_dependency_check' }))
      : [],
    missing: coverageStatus === 'complete' ? [] : migrations.map(({ version, file }) => ({ version, file })),
    ambiguous: [],
    notExecutable: [],
    status: coverageStatus,
    digest: digest('f'),
  }
  const artifacts = {
    migrations,
    migrationSetDigest: digest('1'),
    applicationManifestSha256: digest('2'),
    applicationManifestCoverage: coverage,
    applicationManifestLinkedProjectRef: 'productionref001',
    edgeFunctions,
    edgeFunctionSetDigest: digest('3'),
    sharedRuntimeSha256: digest('4'),
    sharedRuntimeFileCount: 2,
    sharedRuntimeRequiredFileSha256: digest('5'),
    configTomlSha256: digest('6'),
    databaseRunnerSourceSha256: digest('7'),
    databaseRunnerProtectedProjectRef: 'productionref001',
    databaseRunnerTargetContract: PHASE1_DATABASE_TARGET_CONTRACT,
    databaseRunnerCliVersion: PHASE1_SUPABASE_CLI_VERSION,
    frontend: {
      root: 'the-it-guy',
      buildCommand: 'npm run build:guarded',
      vercelBuildCommand: 'npm run build:guarded',
      vercelConfigSha256: digest('8'),
      packageJsonSha256: digest('9'),
      packageLockSha256: digest('a'),
      viteConfigSha256: digest('b'),
      sourceTreeSha256: digest('c'),
      sourceFileCount: 1,
    },
    releaseOrder: {
      edgeFunctionsBeforeMigration: '202607220006',
      migrations: migrations.map((migration) => migration.version),
      constrainedFunctions: ['generate-final-signed-otp', 'dispatch-final-signed-document'],
    },
  }
  artifacts.edgeFunctionDeployUnitSha256 = edgeFunctionDeployUnitDigest(artifacts)
  return artifacts
}

function phase0Freeze() {
  return {
    manifestDigest: digest('d'),
    productionProjectRef: 'productionref001',
    frozenAt: '2026-07-22T10:00:00.000Z',
    source: {
      commitSha: 'a'.repeat(40),
      packageLockSha256: digest('e'),
    },
    templateReview: {
      boundB1ManifestDigest: digest('f'),
      evidenceProjectRef: 'stagingref001',
    },
  }
}

function validPendingFixture() {
  const artifacts = expectedArtifacts()
  const freeze = phase0Freeze()
  const receipt = createPendingLegalDocumentRolloutPhase1Receipt({
    phase0Freeze: freeze,
    artifacts,
    stagingProjectRef: 'stagingref001',
    stagingOrigin: 'https://stagingref001.supabase.co',
    preparedBy: 'Release Manager',
    changeReference: 'REL-002',
    preparedAt: timestamp(0),
  })
  return {
    receipt,
    freeze,
    phase0Freeze: freeze,
    artifacts,
    expectedArtifacts: artifacts,
    // Planning happens from the Phase 0 receipt commit; the first Phase 1
    // receipt change has not been committed yet.
    phase0Report: { status: 'FROZEN', evidence: { phase1ReceiptChangeCount: 0 } },
    phase1History: null,
  }
}

function validRecordedFixture() {
  const fixture = validPendingFixture()
  const { receipt, artifacts, freeze } = fixture
  const pendingReceiptManifestDigest = receipt.manifestDigest
  receipt.status = 'staging_evidence_recorded'
  receipt.source.pendingReceiptManifestDigest = pendingReceiptManifestDigest
  fixture.phase0Report.evidence.phase1ReceiptChangeCount = 2
  fixture.phase1History = { pendingReceiptManifestDigest, pendingReceiptStatus: 'pending_staging', pendingReceiptParentDigest: null }
  let previousLedgerDigest = digest('1')
  const migrationEvidence = artifacts.migrations.map((migration, index) => {
    const ledgerEvidenceDigest = digest(hexCharacters[(index + 2) % hexCharacters.length])
    const item = {
      version: migration.version,
      targetProjectRef: 'stagingref001',
      migrationSha256: migration.sha256,
      predecessorLedgerEvidenceDigest: previousLedgerDigest,
      sqlApplied: true,
      applyEvidenceDigest: digest(hexCharacters[(index + 3) % hexCharacters.length]),
      ledgerEvidenceDigest,
      catalogChecks: 'pass',
      behaviorChecks: 'pass',
      rollbackOrNoResidue: 'pass',
      reviewedBy: 'DB Reviewer',
      appliedAt: timestamp(index + 2),
      ledgerRecordedAt: timestamp(index + 3),
    }
    previousLedgerDigest = ledgerEvidenceDigest
    return item
  })
  const edgeFunctionEvidence = artifacts.edgeFunctions.map((edgeFunction, index) => ({
    name: edgeFunction.name,
    targetProjectRef: 'stagingref001',
    sourceTreeSha256: edgeFunction.sourceTreeSha256,
    deployUnitSha256: artifacts.edgeFunctionDeployUnitSha256,
    providerRevision: `revision-${index + 1}`,
    deploymentReference: `EDGE-${index + 1}`,
    deployedAt: timestamp(index === 2 ? 1 : index + 2),
  }))
  receipt.execution = {
    databaseRunner: 'scripts/supabase-phase6-staging-execution.mjs',
    databaseRunnerCliVersion: PHASE1_SUPABASE_CLI_VERSION,
    recoveryEvidenceReference: 'REC-002',
    preflightLedgerEvidenceDigest: digest('1'),
    migrationEvidence,
    edgeFunctionEvidence,
    functionConfigurationReviews: [
      {
        name: 'generate-final-signed-otp',
        targetProjectRef: 'stagingref001',
        configurationEvidenceDigest: digest('2'),
        reviewedBy: 'Security Reviewer',
        reviewedAt: timestamp(20),
      },
      {
        name: 'dispatch-final-signed-document',
        targetProjectRef: 'stagingref001',
        configurationEvidenceDigest: digest('3'),
        reviewedBy: 'Security Reviewer',
        reviewedAt: timestamp(21),
      },
    ],
    previewEvidence: {
      provider: 'vercel',
      attestationVersion: LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION,
      attestationEvidenceDigest: digest('4'),
      deploymentId: 'dpl_preview123',
      deploymentSourceCommitSha: freeze.source.commitSha,
      deploymentMetadataEvidenceDigest: digest('5'),
      previewUrl: 'https://legal-docs-phase1-preview.vercel.app',
      previewReleaseId: freeze.source.commitSha,
      previewReleaseManifestSha256: digest('6'),
      previewIndexHtmlSha256: digest('7'),
      previewArtifactTreeSha256: digest('8'),
      publicSupabaseOrigin: 'https://stagingref001.supabase.co',
      attestedAt: timestamp(25),
    },
    postDeployContractEvidenceDigest: digest('9'),
  }
  receipt.evidence.evidenceRecordedBy = 'Staging Verifier'
  receipt.evidence.reviewedBy = 'Release Reviewer'
  receipt.evidence.evidenceRecordedAt = timestamp(30)
  receipt.manifestDigest = rolloutPhase1ManifestDigest(receipt)
  return fixture
}

function codes(result) {
  return result.blockers.map((blocker) => blocker.code)
}

const now = Date.parse('2026-07-22T11:40:00.000Z')
const pending = validPendingFixture()
const planned = assessLegalDocumentRolloutPhase1({ ...pending, now })
assert.equal(planned.status, 'STAGING_PLANNED')
assert.equal(planned.blockerCount, 0)
assert.equal(planned.pendingCount, 1)
assert.equal(planned.mutatedData, false)
assert.ok(planned.doesNotAuthorize.includes('database_migration_apply_or_repair'))

const recorded = validRecordedFixture()
const complete = assessLegalDocumentRolloutPhase1({ ...recorded, now })
assert.equal(complete.status, 'STAGING_EVIDENCE_RECORDED')
assert.equal(complete.attestationLevel, 'locally_recorded_evidence_not_live_attestation')
assert.equal(complete.blockerCount, 0)

for (const [label, mutate, expectedCode] of [
  ['environment collision', (fixture) => { fixture.receipt.environment.stagingProjectRef = fixture.receipt.environment.productionProjectRef }, 'P1_ENVIRONMENT_IDENTITY_COLLISION'],
  ['B1 environment drift', (fixture) => { fixture.receipt.environment.stagingProjectRef = 'otherstage001'; fixture.receipt.environment.stagingOrigin = 'https://otherstage001.supabase.co' }, 'P1_STAGING_B1_IDENTITY_DRIFT'],
  ['phase zero', (fixture) => { fixture.phase0Report.status = 'HOLD' }, 'P1_PHASE0_NOT_FROZEN'],
  ['recorded receipt history', (fixture) => { fixture.phase0Report.evidence.phase1ReceiptChangeCount = 1 }, 'P1_RECEIPT_HISTORY_INVALID'],
  ['recorded parent digest', (fixture) => { fixture.phase1History.pendingReceiptManifestDigest = digest('0') }, 'P1_PENDING_RECEIPT_PARENT_DRIFT'],
  ['recorded parent state', (fixture) => { fixture.phase1History.pendingReceiptStatus = 'staging_evidence_recorded' }, 'P1_PENDING_RECEIPT_PARENT_DRIFT'],
  ['runner production guard', (fixture) => { fixture.expectedArtifacts.databaseRunnerProtectedProjectRef = 'wrongprod001' }, 'P1_DATABASE_RUNNER_PRODUCTION_GUARD_DRIFT'],
  ['runner target guard', (fixture) => { fixture.expectedArtifacts.databaseRunnerTargetContract = 'unverified' }, 'P1_DATABASE_RUNNER_TARGET_GUARD_INVALID'],
  ['manifest identity', (fixture) => { fixture.expectedArtifacts.applicationManifestLinkedProjectRef = 'wrongprod001' }, 'P1_APPLICATION_MANIFEST_PRODUCTION_IDENTITY_DRIFT'],
  ['build command', (fixture) => { fixture.expectedArtifacts.frontend.vercelBuildCommand = 'npm run build' }, 'P1_VERCEL_BUILD_COMMAND_MISMATCH'],
  ['migration ordering', (fixture) => { fixture.receipt.execution.migrationEvidence[4].predecessorLedgerEvidenceDigest = digest('f') }, 'P1_MIGRATION_EVIDENCE_ORDER_INVALID'],
  ['reused migration ledger evidence', (fixture) => { fixture.receipt.execution.migrationEvidence[1].ledgerEvidenceDigest = fixture.receipt.execution.migrationEvidence[1].predecessorLedgerEvidenceDigest }, 'P1_MIGRATION_LEDGER_EVIDENCE_REUSED'],
  ['migration timestamp after evidence recording', (fixture) => { fixture.receipt.execution.migrationEvidence[0].ledgerRecordedAt = timestamp(31) }, 'P1_MIGRATION_EVIDENCE_TIME_ORDER_INVALID'],
  ['edge deployment timestamp after evidence recording', (fixture) => { fixture.receipt.execution.edgeFunctionEvidence[0].deployedAt = timestamp(31) }, 'P1_EDGE_FUNCTION_EVIDENCE_TIME_INVALID'],
  ['configuration review timestamp before preparation', (fixture) => { fixture.receipt.execution.functionConfigurationReviews[0].reviewedAt = '2026-07-22T10:59:00.000Z' }, 'P1_FUNCTION_CONFIGURATION_REVIEW_TIME_INVALID'],
  ['preview timestamp before preparation', (fixture) => { fixture.receipt.execution.previewEvidence.attestedAt = '2026-07-22T10:59:00.000Z' }, 'P1_PREVIEW_EVIDENCE_TIME_INVALID'],
  ['edge deploy unit hash', (fixture) => { fixture.receipt.execution.edgeFunctionEvidence[0].deployUnitSha256 = digest('0') }, 'P1_EDGE_FUNCTION_DEPLOY_UNIT_DRIFT'],
  ['edge provider revision', (fixture) => { fixture.receipt.execution.edgeFunctionEvidence[0].providerRevision = '   ' }, 'P1_EDGE_FUNCTION_PROVIDER_REFERENCE_INVALID'],
  ['edge provider reference', (fixture) => { fixture.receipt.execution.edgeFunctionEvidence[0].deploymentReference = '' }, 'P1_EDGE_FUNCTION_PROVIDER_REFERENCE_INVALID'],
  ['deploy unit artifact integrity', (fixture) => { fixture.expectedArtifacts.edgeFunctionDeployUnitSha256 = digest('0') }, 'P1_EDGE_FUNCTION_DEPLOY_UNIT_INVALID'],
  ['finaliser ordering', (fixture) => { fixture.receipt.execution.edgeFunctionEvidence.find((item) => item.name === 'generate-final-signed-document').deployedAt = timestamp(20) }, 'P1_FINALISER_DEPLOYMENT_ORDER_INVALID'],
  ['preview target', (fixture) => { fixture.receipt.execution.previewEvidence.publicSupabaseOrigin = 'https://otherstage001.supabase.co' }, 'P1_PREVIEW_ENVIRONMENT_BINDING_INVALID'],
  ['preview production host', (fixture) => { fixture.receipt.execution.previewEvidence.previewUrl = 'https://app.arch9.co.za' }, 'P1_PREVIEW_ENVIRONMENT_BINDING_INVALID'],
  ['fixture write', (fixture) => { fixture.receipt.evidence.fixtureWrites = 1 }, 'P1_FIXTURE_WRITES_NOT_ZERO'],
]) {
  const fixture = validRecordedFixture()
  mutate(fixture)
  fixture.receipt.manifestDigest = rolloutPhase1ManifestDigest(fixture.receipt)
  assert.ok(codes(assessLegalDocumentRolloutPhase1({ ...fixture, now })).includes(expectedCode), `${label} should produce ${expectedCode}`)
}

const staleEvidenceFixture = validRecordedFixture()
staleEvidenceFixture.freeze.frozenAt = '2026-07-20T10:00:00.000Z'
staleEvidenceFixture.receipt.evidence.preparedAt = '2026-07-21T10:00:00.000Z'
staleEvidenceFixture.receipt.execution.functionConfigurationReviews[0].reviewedAt = '2026-07-21T10:01:00.000Z'
staleEvidenceFixture.receipt.manifestDigest = rolloutPhase1ManifestDigest(staleEvidenceFixture.receipt)
assert.ok(codes(assessLegalDocumentRolloutPhase1({ ...staleEvidenceFixture, now })).includes('P1_FUNCTION_CONFIGURATION_REVIEW_TIME_INVALID'), 'configuration evidence older than 24 hours must be rejected')

const coverageFixture = validRecordedFixture()
coverageFixture.artifacts = expectedArtifacts({ coverageStatus: 'incomplete' })
coverageFixture.expectedArtifacts = coverageFixture.artifacts
coverageFixture.receipt.artifacts.applicationManifestCoverageDigest = coverageFixture.artifacts.applicationManifestCoverage.digest
coverageFixture.receipt.manifestDigest = rolloutPhase1ManifestDigest(coverageFixture.receipt)
assert.ok(codes(assessLegalDocumentRolloutPhase1({ ...coverageFixture, now })).includes('P1_LEGAL_MIGRATION_MANIFEST_COVERAGE_MISSING'))

const actual = collectLegalDocumentRolloutPhase1Artifacts()
assert.equal(actual.migrations.length, 12)
assert.equal(actual.edgeFunctions.length, 13)
assert.equal(actual.edgeFunctionDeployUnitSha256, edgeFunctionDeployUnitDigest(actual))
assert.notEqual(actual.edgeFunctionDeployUnitSha256, edgeFunctionDeployUnitDigest({ ...actual, configTomlSha256: digest('0') }))
assert.notEqual(actual.edgeFunctionDeployUnitSha256, edgeFunctionDeployUnitDigest({ ...actual, sharedRuntimeSha256: digest('0') }))
assert.notEqual(actual.edgeFunctionDeployUnitSha256, edgeFunctionDeployUnitDigest({
  ...actual,
  edgeFunctions: actual.edgeFunctions.map((edgeFunction, index) => index === 0 ? { ...edgeFunction, sourceTreeSha256: digest('0') } : edgeFunction),
}))
assert.equal(actual.applicationManifestCoverage.status, 'incomplete')
assert.deepEqual(actual.applicationManifestCoverage.missing.map((row) => row.version), [
  '202607220002', '202607220003', '202607220004', '202607220005', '202607220006', '202607220007', '202607220008', '202607220009', '202607220010', '202607220011', '202607220012', '202607230004',
])
assert.deepEqual(actual.releaseOrder.constrainedFunctions, ['generate-final-signed-otp', 'dispatch-final-signed-document'])
assert.equal(actual.databaseRunnerTargetContract, PHASE1_DATABASE_TARGET_CONTRACT)
assert.equal(actual.databaseRunnerCliVersion, PHASE1_SUPABASE_CLI_VERSION)
assert.equal(actual.frontend.buildCommand, 'npm run build:guarded')
assert.equal(actual.frontend.vercelBuildCommand, 'npm run build:guarded')

const sources = [
  fs.readFileSync('scripts/legal-document-rollout-phase1-artifacts.mjs', 'utf8'),
  fs.readFileSync('scripts/legal-document-rollout-phase1-policy.mjs', 'utf8'),
  fs.readFileSync('scripts/legal-document-rollout-phase1-plan.mjs', 'utf8'),
  fs.readFileSync('scripts/legal-document-rollout-phase1-verify.mjs', 'utf8'),
]
for (const source of sources) {
  assert.doesNotMatch(source, /fetch\(|createClient\(|SUPABASE_SERVICE_ROLE_KEY|npx\s+supabase|writeFileSync|\.insert\(|\.upsert\(|\.delete\(/)
}
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of [
  'test:legal-documents:rollout-phase1',
  'plan:legal-documents:rollout-phase1',
  'verify:legal-documents:rollout-phase1',
  'attest:legal-documents:rollout-phase1-preview',
  'finalize:legal-documents:rollout-phase1',
]) assert.ok(packageJson.scripts?.[name], `Missing ${name}`)
assert.equal(ROLLOUT_PHASE1_CONTRACT, 'legal-document-staging-release-v2')
assert.deepEqual(ROLLOUT_PHASE1_EDGE_FUNCTION_EVIDENCE_FIELDS, [
  'deployUnitSha256', 'deployedAt', 'deploymentReference', 'name', 'providerRevision', 'sourceTreeSha256', 'targetProjectRef',
])
assert.equal(sha256Digest('bridge9'), 'sha256:b6756ed8cc22e0c850948a01648a45a501ef1880893dd56809979400a2c02d90')

console.log('Legal-document rollout Phase 1 staging receipt contract passed.')
