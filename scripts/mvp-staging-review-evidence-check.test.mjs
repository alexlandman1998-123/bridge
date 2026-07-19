import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-phase5-'))
const journeyPath = path.join(directory, 'journeys.json')
const deploymentEvidencePath = path.join(directory, 'deployment-evidence.json')
const reviewPath = path.join(directory, 'review.json')
const checks = {
  leadCreated: true, offerAccepted: true, transactionCreated: true, participantsVisible: true,
  documentsSeeded: true, workflowLanesSeeded: true, onboardingGateBlockedThenCleared: true,
  otpGateBlockedThenCleared: true, financeGateBlockedThenCleared: true, transferGateBlockedThenCleared: true,
  registrationReady: true, postDeploySmokePassed: true,
}
const ids = ['cash_individual_resale', 'bond_company_private_sale', 'hybrid_trust_resale', 'development_company_development_sale']
const projectRef = 'abcdefghijklmnopqrst'

try {
  writeFileSync(deploymentEvidencePath, JSON.stringify({
    environment: 'staging', projectRef, deployedAt: '2026-07-19T00:00:00.000Z', verifiedBy: 'release@arch9.test', productionCredentialsUsed: false,
    preflight: { decision: 'ready_for_human_approved_staging_apply', projectRef, migrationOrder: ['202607180046', '202607190001'] },
    postApplyLedger: { projectRef, appliedVersions: ['202607180046', '202607190001'] },
    rpcCheck: { rpc: 'bridge_create_mvp_transaction', passed: true, result: 'deployed', httpStatus: 401 },
  }))
  writeFileSync(journeyPath, JSON.stringify({ environment: 'staging', projectRef, executedBy: 'operations.tester@arch9.test', completedAt: '2026-07-19T01:00:00.000Z', executionMethod: 'ui', scenarios: ids.map((id, index) => ({ id, transactionId: `tx-${index}`, acceptedOfferId: `offer-${index}`, createdThrough: 'accepted_offer_ui', checks })) }))
  const reviewEvidence = {
    environment: 'staging', reviewedBy: 'conveyancer.reviewer@arch9.test', reviewedAt: '2026-07-19T02:00:00.000Z', reviewerRole: 'conveyancing', reviewerIsDeveloper: false, reviewedIndependently: true,
    findings: [{ id: 'MVP-UX-001', severity: 'p2', summary: 'Clarify one supporting-document next action.', owner: 'operations.owner@arch9.test', recordedAt: '2026-07-19T02:00:00.000Z', status: 'deferred', resolved: false, nextReviewAt: '2026-08-01T00:00:00.000Z' }],
    stagingAcceptance: { decision: 'accepted_for_pilot_consideration', decidedBy: 'operations.lead@arch9.test', decidedAt: '2026-07-19T03:00:00.000Z', deciderIsDeveloper: false, scope: 'all_four_mvp_scenarios', deferredFindingIds: ['MVP-UX-001'] },
    scenarioReviews: ids.map((id) => ({ id, completedWithoutDeveloperGuidance: true, nextActionClear: true, errorsActionable: true, postDeployDataReviewed: true })),
  }
  writeFileSync(reviewPath, JSON.stringify(reviewEvidence))
  const result = spawnSync(process.execPath, ['scripts/mvp-staging-review-evidence-check.mjs', `--journey-evidence=${journeyPath}`, `--deployment-evidence=${deploymentEvidencePath}`, `--review-evidence=${reviewPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).passed, true)
  writeFileSync(reviewPath, JSON.stringify({ ...reviewEvidence, reviewedBy: 'operations.tester@arch9.test' }))
  const selfCertified = spawnSync(process.execPath, ['scripts/mvp-staging-review-evidence-check.mjs', `--journey-evidence=${journeyPath}`, `--deployment-evidence=${deploymentEvidencePath}`, `--review-evidence=${reviewPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(selfCertified.status, 1, 'A journey operator must not self-certify Phase 5 review evidence.')
  writeFileSync(reviewPath, JSON.stringify({ ...reviewEvidence, findings: [{ ...reviewEvidence.findings[0], severity: 'p1' }] }))
  const unresolvedBlocking = spawnSync(process.execPath, ['scripts/mvp-staging-review-evidence-check.mjs', `--journey-evidence=${journeyPath}`, `--deployment-evidence=${deploymentEvidencePath}`, `--review-evidence=${reviewPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(unresolvedBlocking.status, 1, 'A release-blocking finding may not be deferred.')
  writeFileSync(reviewPath, JSON.stringify({ ...reviewEvidence, stagingAcceptance: { ...reviewEvidence.stagingAcceptance, deferredFindingIds: [] } }))
  const unacknowledgedDeferred = spawnSync(process.execPath, ['scripts/mvp-staging-review-evidence-check.mjs', `--journey-evidence=${journeyPath}`, `--deployment-evidence=${deploymentEvidencePath}`, `--review-evidence=${reviewPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(unacknowledgedDeferred.status, 1, 'Staging acceptance must acknowledge each deferred finding.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP staging review evidence checks passed.')
