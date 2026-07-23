import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  collectLegalDocumentRolloutPhase6History,
  ROLLOUT_PHASE6_RECEIPT_PATH,
} from './legal-document-rollout-phase6-history.mjs'
import {
  createPendingLegalDocumentRolloutPhase6Receipt,
  rolloutPhase6ManifestDigest,
  rolloutPhase6ProposalPlanDigest,
} from './legal-document-rollout-phase6-policy.mjs'
import {
  collectLegalDocumentRolloutPhase5History,
  ROLLOUT_PHASE5_RECEIPT_PATH,
} from './legal-document-rollout-phase5-history.mjs'
import { rolloutPhase5ManifestDigest } from './legal-document-rollout-phase5-policy.mjs'
import { ROLLOUT_CONTROL_RECEIPT_PATHS } from './legal-document-rollout-source-continuity.mjs'
import { sha256Digest } from './legal-document-rollout-phase1-artifacts.mjs'

const digest = (character) => `sha256:${character.repeat(64)}`
const organisationId = '11111111-1111-4111-8111-111111111111'
const packageLockPath = 'the-it-guy/package-lock.json'
const sourceMarkerPath = 'the-it-guy/source-marker.txt'
const [phase0Path, phase1Path, phase2Path, phase3Path, phase4Path] = ROLLOUT_CONTROL_RECEIPT_PATHS

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  return String(result.stdout || '').trim()
}

function write(repo, relativePath, content) {
  const destination = path.join(repo, relativePath)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, content, 'utf8')
}

function writeJson(repo, relativePath, value) {
  write(repo, relativePath, `${JSON.stringify(value, null, 2)}\n`)
}

function commitAll(repo, message) {
  git(repo, ['add', '--all'])
  git(repo, ['commit', '-qm', message])
  return git(repo, ['rev-parse', 'HEAD'])
}

function regularBlobSha256(repo, relativePath) {
  const bytes = fs.readFileSync(path.join(repo, relativePath))
  return sha256Digest(bytes)
}

function phase5RecordedReceipt({ sourceCommitSha, packageLockSha256, phase2ReceiptCommitSha, phase3ReceiptCommitSha, phase4ReceiptCommitSha }) {
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_5',
    contract: 'legal-document-production-pilot-observation-v1',
    status: 'pilot_observation_recorded',
    environment: {
      productionProjectRef: 'productionref001',
      productionOrigin: 'https://productionref001.supabase.co',
      productionUrl: 'https://legal.example.test',
    },
    source: {
      phase0ManifestDigest: digest('0'),
      phase1ReceiptManifestDigest: digest('1'),
      phase2ReceiptCommitSha,
      phase2ReceiptManifestDigest: digest('2'),
      phase3ReceiptCommitSha,
      phase3ReceiptManifestDigest: digest('3'),
      phase4ReceiptCommitSha,
      phase4ReceiptManifestDigest: digest('4'),
      commitSha: sourceCommitSha,
      packageLockSha256,
      activationPlanDigest: digest('5'),
      observationPlanDigest: digest('6'),
    },
    cohort: {
      organisationIds: [organisationId],
      cohortDigest: sha256Digest(organisationId),
      maxOrganisations: 1,
      requiredPacketTypes: ['mandate', 'otp'],
    },
    safety: {
      creationPaused: true,
      customerDeliveryPolicy: 'activated_cohort_and_release_marker_only',
      noScaleAuthorization: true,
      rollbackToDarkLaunchRequired: true,
      runtimeGuardContract: 'legal-document-pilot-release-v1',
      scaleEnabled: false,
      watchdogContract: 'phase5-f2-f3-f4-v2',
    },
    observation: {
      maximumBlockers: 0,
      maximumCriticalSnapshots: 0,
      maximumSnapshotGapMinutes: 90,
      maximumWarningSnapshots: 0,
      minimumHealthyScopedSnapshots: 7,
      minimumObservationHours: 144,
    },
    evidence: {
      changeReference: 'PHASE5-HISTORY-TEST',
      observationRecordedAt: '2026-07-07T00:00:00.000Z',
      observationRecordedBy: 'phase5_history_test',
      preparedAt: '2026-07-01T00:00:00.000Z',
      preparedBy: 'phase5_history_test',
      reviewedBy: 'phase5_history_test',
    },
    execution: {
      evidencePacketDigest: digest('7'),
      lifecycleProofs: [],
      monitoring: {},
      overallEvidenceDigest: digest('8'),
      reconciliation: {},
      rollbackReadiness: {},
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase5ManifestDigest(receipt)
  return receipt
}

/**
 * Produces a complete P0→P5 Git receipt chain. The receipt contents before
 * P5 are intentionally inert: this test exercises history shape, not the
 * remote/runtime rollout checks performed by the phase-specific policies.
 */
function buildPhase5Fixture({ mutateAndRevertSource = false, insertMerge = false, phase5PackageLockSha256 = null } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-document-phase6-history-'))
  git(repo, ['init', '-q'])
  git(repo, ['config', 'user.name', 'Phase Seven History Test'])
  git(repo, ['config', 'user.email', 'phase7-history@example.test'])

  for (const receiptPath of [...ROLLOUT_CONTROL_RECEIPT_PATHS, ROLLOUT_PHASE6_RECEIPT_PATH]) {
    writeJson(repo, receiptPath, { state: 'inert_placeholder', receiptPath })
  }
  write(repo, packageLockPath, '{"lockfileVersion":3}\n')
  write(repo, sourceMarkerPath, 'frozen source\n')
  const sourceCommitSha = commitAll(repo, 'freeze phase seven history source')
  const packageLockSha256 = regularBlobSha256(repo, packageLockPath)

  writeJson(repo, phase0Path, { state: 'phase0_recorded' })
  commitAll(repo, 'record phase zero')

  if (mutateAndRevertSource) {
    write(repo, sourceMarkerPath, 'source mutation that must remain visible in history\n')
    commitAll(repo, 'mutate frozen source')
    write(repo, sourceMarkerPath, 'frozen source\n')
    commitAll(repo, 'revert frozen source mutation')
  }

  if (insertMerge) {
    git(repo, ['checkout', '-qb', 'phase7-history-side'])
    write(repo, 'the-it-guy/merge-marker.txt', 'side branch history mutation\n')
    commitAll(repo, 'create side branch history')
    git(repo, ['checkout', '-q', '-'])
    git(repo, ['merge', '--no-ff', '--no-edit', 'phase7-history-side'])
  }

  writeJson(repo, phase1Path, { state: 'phase1_pending' })
  commitAll(repo, 'record phase one pending')
  writeJson(repo, phase1Path, { state: 'phase1_recorded' })
  commitAll(repo, 'record phase one evidence')
  writeJson(repo, phase2Path, { state: 'phase2_recorded' })
  const phase2ReceiptCommitSha = commitAll(repo, 'record phase two')
  writeJson(repo, phase3Path, { state: 'phase3_recorded' })
  const phase3ReceiptCommitSha = commitAll(repo, 'record phase three')
  writeJson(repo, phase4Path, { state: 'phase4_recorded' })
  const phase4ReceiptCommitSha = commitAll(repo, 'record phase four')

  writeJson(repo, ROLLOUT_PHASE5_RECEIPT_PATH, phase5RecordedReceipt({
    sourceCommitSha,
    packageLockSha256: phase5PackageLockSha256 || packageLockSha256,
    phase2ReceiptCommitSha,
    phase3ReceiptCommitSha,
    phase4ReceiptCommitSha,
  }))
  const phase5ReceiptCommitSha = commitAll(repo, 'record phase five')
  const phase5History = collectLegalDocumentRolloutPhase5History({ repoRoot: repo, receiptCommitSha: phase5ReceiptCommitSha })
  return { repo, sourceCommitSha, packageLockSha256, phase5ReceiptCommitSha, phase5History }
}

function pendingPhase6Receipt(phase5History) {
  return createPendingLegalDocumentRolloutPhase6Receipt({
    phase5History,
    preparedByReference: 'phase7_history_preparer',
    changeReference: 'PHASE7-HISTORY-TEST',
    preparedAt: new Date(Date.now() - 1_000).toISOString(),
  })
}

function commitPhase6Receipt(fixture, { extraPath = null, executable = false, symlink = false, mutateReceipt = null } = {}) {
  const receipt = pendingPhase6Receipt(fixture.phase5History)
  mutateReceipt?.(receipt)
  const receiptPath = path.join(fixture.repo, ROLLOUT_PHASE6_RECEIPT_PATH)
  writeJson(fixture.repo, ROLLOUT_PHASE6_RECEIPT_PATH, receipt)
  if (executable) {
    fs.chmodSync(receiptPath, 0o755)
    git(fixture.repo, ['add', ROLLOUT_PHASE6_RECEIPT_PATH])
    git(fixture.repo, ['update-index', '--chmod=+x', ROLLOUT_PHASE6_RECEIPT_PATH])
  }
  if (symlink) {
    fs.rmSync(receiptPath)
    fs.symlinkSync('nonexistent-phase6-receipt-target', receiptPath)
  }
  if (extraPath) write(fixture.repo, extraPath, 'unexpected companion change\n')
  return commitAll(fixture.repo, 'record phase six successor proposal')
}

function rehashPhase6(receipt) {
  receipt.source.proposalPlanDigest = rolloutPhase6ProposalPlanDigest(receipt)
  receipt.manifestDigest = rolloutPhase6ManifestDigest(receipt)
}

function removeFixture(fixture) {
  fs.rmSync(fixture.repo, { recursive: true, force: true })
}

{
  const fixture = buildPhase5Fixture()
  try {
    const phase6ReceiptCommitSha = commitPhase6Receipt(fixture)
    const history = collectLegalDocumentRolloutPhase6History({ repoRoot: fixture.repo, receiptCommitSha: phase6ReceiptCommitSha })

    assert.equal(history.receiptCommitSha, phase6ReceiptCommitSha)
    assert.equal(history.receiptOnlyCommit, true)
    assert.equal(history.directParentSha, fixture.phase5ReceiptCommitSha)
    assert.equal(history.directParentMatchesDeclaredPhase5, true)
    assert.equal(history.parentPhase5BlobSchemaValid, true)
    assert.equal(history.parentPhase5BlobManifestValid, true)
    assert.equal(history.parentPhase5PackageLockValid, true)
    assert.equal(history.phase6PackageLockValid, true)
    assert.equal(history.phase6AssessmentStatus, 'SUCCESSOR_PROPOSAL_READY')
    assert.equal(history.parentPhase5TerminalContinuityValid, true)
    assert.equal(history.phase5TerminalContinuity.status, 'RECEIPT_ONLY_DESCENDANT')
    assert.deepEqual({
      phase0: history.phase5TerminalContinuity.phase0FreezeChangeCount,
      phase1: history.phase5TerminalContinuity.phase1ReceiptChangeCount,
      phase2: history.phase5TerminalContinuity.phase2ReceiptChangeCount,
      phase3: history.phase5TerminalContinuity.phase3ReceiptChangeCount,
      phase4: history.phase5TerminalContinuity.phase4ReceiptChangeCount,
      phase5: history.phase5TerminalContinuity.phase5ReceiptChangeCount,
    }, { phase0: 1, phase1: 2, phase2: 1, phase3: 1, phase4: 1, phase5: 1 })

    // The helper must be a committed-history reader. A malicious or merely
    // unfinished working-tree edit cannot alter its result.
    writeJson(fixture.repo, ROLLOUT_PHASE6_RECEIPT_PATH, { status: 'working_tree_tamper' })
    const afterWorkingTreeEdit = collectLegalDocumentRolloutPhase6History({ repoRoot: fixture.repo, receiptCommitSha: phase6ReceiptCommitSha })
    assert.equal(afterWorkingTreeEdit.receipt?.status, 'pending_proposal')
    assert.equal(afterWorkingTreeEdit.receiptManifestDigest, history.receiptManifestDigest)
    assert.equal(afterWorkingTreeEdit.directParentSha, fixture.phase5ReceiptCommitSha)
  } finally {
    removeFixture(fixture)
  }
}

{
  const fixture = buildPhase5Fixture()
  try {
    write(fixture.repo, 'the-it-guy/foreign-parent-marker.txt', 'not the declared phase five receipt\n')
    const foreignParentSha = commitAll(fixture.repo, 'insert foreign parent')
    const phase6ReceiptCommitSha = commitPhase6Receipt(fixture)
    const history = collectLegalDocumentRolloutPhase6History({ repoRoot: fixture.repo, receiptCommitSha: phase6ReceiptCommitSha })

    assert.equal(history.receiptOnlyCommit, true)
    assert.equal(history.directParentSha, foreignParentSha)
    assert.equal(history.directParentMatchesDeclaredPhase5, false, 'Phase 6 must be directly parented by the declared committed Phase 5 receipt.')
  } finally {
    removeFixture(fixture)
  }
}

{
  const fixture = buildPhase5Fixture()
  try {
    const phase6ReceiptCommitSha = commitPhase6Receipt(fixture, { extraPath: 'the-it-guy/unexpected-phase6-companion.txt' })
    const history = collectLegalDocumentRolloutPhase6History({ repoRoot: fixture.repo, receiptCommitSha: phase6ReceiptCommitSha })

    assert.equal(history.directParentMatchesDeclaredPhase5, true)
    assert.equal(history.receiptOnlyCommit, false, 'A Phase 6 receipt commit may not carry an extra path.')
  } finally {
    removeFixture(fixture)
  }
}

{
  const fixture = buildPhase5Fixture()
  try {
    const phase6ReceiptCommitSha = commitPhase6Receipt(fixture, { executable: true })
    const history = collectLegalDocumentRolloutPhase6History({ repoRoot: fixture.repo, receiptCommitSha: phase6ReceiptCommitSha })

    assert.equal(history.receipt?.status, 'pending_proposal')
    assert.equal(history.receiptOnlyCommit, false, 'The Phase 6 receipt must remain a regular 100644 JSON blob.')
  } finally {
    removeFixture(fixture)
  }
}

{
  const fixture = buildPhase5Fixture()
  try {
    const phase6ReceiptCommitSha = commitPhase6Receipt(fixture, { symlink: true })
    const history = collectLegalDocumentRolloutPhase6History({ repoRoot: fixture.repo, receiptCommitSha: phase6ReceiptCommitSha })

    assert.equal(history.receiptCommitSha, phase6ReceiptCommitSha)
    assert.equal(history.receipt, null)
    assert.equal(history.receiptOnlyCommit, false, 'A symlink is not an admissible Phase 6 receipt.')
  } finally {
    removeFixture(fixture)
  }
}

{
  const fixture = buildPhase5Fixture({ phase5PackageLockSha256: digest('f') })
  try {
    const phase6ReceiptCommitSha = commitPhase6Receipt(fixture)
    const history = collectLegalDocumentRolloutPhase6History({ repoRoot: fixture.repo, receiptCommitSha: phase6ReceiptCommitSha })

    assert.equal(history.parentPhase5PackageLockValid, false, 'The P5 receipt must bind the actual frozen package-lock blob.')
    assert.equal(history.phase6PackageLockValid, false, 'The P6 receipt must bind the same actual frozen package-lock blob.')
  } finally {
    removeFixture(fixture)
  }
}

for (const [label, options] of [
  ['source mutation and revert', { mutateAndRevertSource: true }],
  ['merge commit', { insertMerge: true }],
]) {
  const fixture = buildPhase5Fixture(options)
  try {
    const phase6ReceiptCommitSha = commitPhase6Receipt(fixture)
    const history = collectLegalDocumentRolloutPhase6History({ repoRoot: fixture.repo, receiptCommitSha: phase6ReceiptCommitSha })

    assert.equal(history.parentPhase5TerminalContinuityValid, false, `${label} must invalidate P0→P5 terminal continuity.`)
    assert.equal(history.phase5TerminalContinuity.status, 'INVALID')
  } finally {
    removeFixture(fixture)
  }
}

console.log('Legal-document Phase 6 committed-history contract passed.')
