import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requiredChecks = {
  leadCreated: true, offerAccepted: true, transactionCreated: true, participantsVisible: true,
  documentsSeeded: true, workflowLanesSeeded: true, onboardingGateBlockedThenCleared: true,
  otpGateBlockedThenCleared: true, financeGateBlockedThenCleared: true,
  transferGateBlockedThenCleared: true, registrationReady: true, postDeploySmokePassed: true,
}
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-phase4-'))
const evidencePath = path.join(directory, 'evidence.json')
const deploymentEvidencePath = path.join(directory, 'deployment-evidence.json')
const projectRef = 'abcdefghijklmnopqrst'

try {
  writeFileSync(deploymentEvidencePath, JSON.stringify({
    environment: 'staging', projectRef, deployedAt: '2026-07-19T00:00:00.000Z', verifiedBy: 'release@arch9.test', productionCredentialsUsed: false,
    preflight: { decision: 'ready_for_human_approved_staging_apply', projectRef, migrationOrder: ['202607180046', '202607190001'] },
    postApplyLedger: { projectRef, appliedVersions: ['202607180046', '202607190001'] },
    rpcCheck: { rpc: 'bridge_create_mvp_transaction', passed: true, result: 'deployed', httpStatus: 401 },
  }))
  writeFileSync(evidencePath, JSON.stringify({
    environment: 'staging', projectRef, executedBy: 'operations.tester@arch9.test', completedAt: '2026-07-19T01:00:00.000Z', executionMethod: 'ui',
    scenarios: [
      'cash_individual_resale', 'bond_company_private_sale', 'hybrid_trust_resale', 'development_company_development_sale',
    ].map((id, index) => ({ id, transactionId: `tx-${index + 1}`, acceptedOfferId: `offer-${index + 1}`, createdThrough: 'accepted_offer_ui', checks: requiredChecks })),
  }))
  const result = spawnSync(process.execPath, ['scripts/mvp-staging-journey-evidence-check.mjs', `--evidence=${evidencePath}`, `--deployment-evidence=${deploymentEvidencePath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).passed, true)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP staging journey evidence checks passed.')
