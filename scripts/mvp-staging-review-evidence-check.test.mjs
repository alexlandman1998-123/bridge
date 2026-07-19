import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-phase5-'))
const journeyPath = path.join(directory, 'journeys.json')
const reviewPath = path.join(directory, 'review.json')
const checks = {
  leadCreated: true, offerAccepted: true, transactionCreated: true, participantsVisible: true,
  documentsSeeded: true, workflowLanesSeeded: true, onboardingGateBlockedThenCleared: true,
  otpGateBlockedThenCleared: true, financeGateBlockedThenCleared: true, transferGateBlockedThenCleared: true,
  registrationReady: true, postDeploySmokePassed: true,
}
const ids = ['cash_individual_resale', 'bond_company_private_sale', 'hybrid_trust_resale', 'development_company_development_sale']

try {
  writeFileSync(journeyPath, JSON.stringify({ environment: 'staging', scenarios: ids.map((id, index) => ({ id, transactionId: `tx-${index}`, acceptedOfferId: `offer-${index}`, checks })) }))
  writeFileSync(reviewPath, JSON.stringify({
    environment: 'staging', reviewedBy: 'operations.tester@arch9.test', findings: [{ severity: 'p2', resolved: false }],
    scenarioReviews: ids.map((id) => ({ id, completedWithoutDeveloperGuidance: true, nextActionClear: true, errorsActionable: true, postDeployDataReviewed: true })),
  }))
  const result = spawnSync(process.execPath, ['scripts/mvp-staging-review-evidence-check.mjs', `--journey-evidence=${journeyPath}`, `--review-evidence=${reviewPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).passed, true)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP staging review evidence checks passed.')
