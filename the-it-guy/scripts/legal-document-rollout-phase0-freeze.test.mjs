import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  ROLLOUT_PHASE0_AUTHORITY_STATES,
  ROLLOUT_PHASE0_CONTROL_RECEIPT_PATHS,
  ROLLOUT_PHASE0_CONTRACT,
  assessLegalDocumentRolloutPhase0Freeze,
  authorityStateDigest,
  b1ManifestDigest,
  freezeManifestDigest,
  sha256,
} from './legal-document-rollout-phase0-policy.mjs'

function validFixture() {
  const reviewManifest = {
    version: 1,
    phase: 'B1',
    status: 'frozen_for_counsel_review',
    projectRef: 'isdowlnollckzvltkasn',
    generatedAt: '2026-07-22T10:00:00.000Z',
    templates: [],
    manifestDigest: '',
  }
  reviewManifest.manifestDigest = b1ManifestDigest(reviewManifest)
  const freeze = {
    version: 1,
    phase: 'ROLL_OUT_0',
    contract: ROLLOUT_PHASE0_CONTRACT,
    status: 'frozen',
    environment: 'production',
    productionProjectRef: 'productionref001',
    source: {
      commitSha: 'a'.repeat(40),
      packageLockSha256: `sha256:${'b'.repeat(64)}`,
    },
    allowedPilotOrganisationIds: [],
    runtime: { pilotEnabled: false, organisationIdsSentinel: '__none__' },
    creation: { paused: true },
    templateReview: {
      boundB1ManifestDigest: reviewManifest.manifestDigest,
      evidenceProjectRef: reviewManifest.projectRef,
    },
    releaseAuthority: {
      states: ROLLOUT_PHASE0_AUTHORITY_STATES,
      stateDigest: authorityStateDigest(ROLLOUT_PHASE0_AUTHORITY_STATES),
    },
    exceptions: { allowExistingSignerCompletion: true, allowFinalArtifactDownload: true },
    frozenAt: '2026-07-22T10:00:00.000Z',
    frozenBy: 'Release Manager',
    releaseOwner: 'Release Owner',
    legalOwner: 'Legal Owner',
    operationsOwner: 'Operations Owner',
    changeReference: 'REL-001',
    manifestDigest: '',
  }
  freeze.manifestDigest = freezeManifestDigest(freeze)
  return {
    freeze,
    reviewManifest,
    pilot: { enabled: false, organisationIds: [], releasePreparation: { organisationIds: [] }, activation: { status: 'inactive' } },
    scale: { enabled: false },
    authorityStates: ROLLOUT_PHASE0_AUTHORITY_STATES,
    currentCommit: freeze.source.commitSha,
    sourceContinuity: {
      status: 'EXACT',
      sourceCommitSha: freeze.source.commitSha,
      currentCommitSha: freeze.source.commitSha,
      commits: [],
      changedPaths: [],
      phase0FreezeChangeCount: 0,
    },
    currentPackageLockDigest: freeze.source.packageLockSha256,
    worktreeClean: true,
    creationPaused: true,
    now: Date.parse('2026-07-22T10:01:00.000Z'),
  }
}

function codes(result) {
  return result.blockers.map((blocker) => blocker.code)
}

const valid = assessLegalDocumentRolloutPhase0Freeze(validFixture())
assert.equal(valid.status, 'FROZEN')
assert.equal(valid.mutatedData, false)
assert.equal(valid.scope, 'local_repository')
assert.ok(valid.doesNotVerify.includes('runtime_secrets'))
assert.equal(sha256('bridge9'), 'b6756ed8cc22e0c850948a01648a45a501ef1880893dd56809979400a2c02d90')

const receiptOnly = validFixture()
receiptOnly.currentCommit = 'c'.repeat(40)
receiptOnly.sourceContinuity = {
  status: 'RECEIPT_ONLY_DESCENDANT',
  sourceCommitSha: receiptOnly.freeze.source.commitSha,
  currentCommitSha: receiptOnly.currentCommit,
  commits: [{ sha: receiptOnly.currentCommit, changedPaths: [...ROLLOUT_PHASE0_CONTROL_RECEIPT_PATHS] }],
  changedPaths: [...ROLLOUT_PHASE0_CONTROL_RECEIPT_PATHS],
  phase0FreezeChangeCount: 1,
}
assert.equal(assessLegalDocumentRolloutPhase0Freeze(receiptOnly).status, 'FROZEN')

const sourceChange = validFixture()
sourceChange.currentCommit = 'c'.repeat(40)
sourceChange.sourceContinuity = {
  status: 'INVALID',
  sourceCommitSha: sourceChange.freeze.source.commitSha,
  currentCommitSha: sourceChange.currentCommit,
  commits: [],
  changedPaths: ['supabase/functions/generate-mandate/index.ts'],
  phase0FreezeChangeCount: 0,
}
assert.ok(codes(assessLegalDocumentRolloutPhase0Freeze(sourceChange)).includes('P0_SOURCE_COMMIT_DRIFT'))

for (const [label, mutate, expectedCode] of [
  ['digest', (fixture) => { fixture.freeze.manifestDigest = 'sha256:bad' }, 'P0_MANIFEST_DIGEST_INVALID'],
  ['b1 evidence target', (fixture) => { fixture.freeze.templateReview.evidenceProjectRef = 'wrongenvironment'; fixture.freeze.manifestDigest = freezeManifestDigest(fixture.freeze) }, 'P0_B1_EVIDENCE_PROJECT_DRIFT'],
  ['environment collision', (fixture) => { fixture.freeze.productionProjectRef = fixture.freeze.templateReview.evidenceProjectRef; fixture.freeze.manifestDigest = freezeManifestDigest(fixture.freeze) }, 'P0_ENVIRONMENT_IDENTITY_COLLISION'],
  ['pilot', (fixture) => { fixture.pilot.enabled = true }, 'P0_PILOT_ENABLED'],
  ['cohort', (fixture) => { fixture.pilot.organisationIds = ['a'] }, 'P0_PILOT_COHORT_NOT_EMPTY'],
  ['activation', (fixture) => { fixture.pilot.activation.status = 'active' }, 'P0_PILOT_ACTIVATION_NOT_INERT'],
  ['scale', (fixture) => { fixture.scale.enabled = true }, 'P0_SCALE_ENABLED'],
  ['authority', (fixture) => { fixture.authorityStates = { ...fixture.authorityStates, 'legal-document-release-claim.json': 'claimed' } }, 'P0_RELEASE_AUTHORITY_ACTIVE'],
  ['creation', (fixture) => { fixture.creationPaused = false }, 'P0_CREATION_PAUSE_CLEARED'],
  ['b1', (fixture) => { fixture.reviewManifest.manifestDigest = 'sha256:bad' }, 'P0_B1_MANIFEST_INVALID'],
  ['worktree', (fixture) => { fixture.worktreeClean = false }, 'P0_WORKTREE_DIRTY'],
]) {
  const fixture = validFixture()
  mutate(fixture)
  assert.ok(codes(assessLegalDocumentRolloutPhase0Freeze(fixture)).includes(expectedCode), `${label} should produce ${expectedCode}`)
}

const policy = fs.readFileSync('scripts/legal-document-rollout-phase0-policy.mjs', 'utf8')
const freeze = fs.readFileSync('scripts/legal-document-rollout-phase0-freeze.mjs', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-rollout-phase0-verify.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const source of [policy, freeze, verify]) {
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|fetch\(|npx\s+supabase|secrets\s+(?:list|set)|envFile\(/)
}
for (const source of [freeze, verify]) {
  assert.match(source, /JSON\.stringify/)
  assert.doesNotMatch(source, /writeFileSync|\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
}
for (const name of [
  'test:legal-documents:rollout-phase0',
  'freeze:legal-documents:rollout-phase0',
  'verify:legal-documents:rollout-phase0',
]) assert.ok(pkg.scripts?.[name], `Missing ${name}`)

console.log('Legal-document rollout Phase 0 freeze contract passed.')
