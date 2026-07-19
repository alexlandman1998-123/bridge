import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-8c-'))
const inputPath = path.join(directory, 'maintenance.json')
const transactions = Array.from({ length: 10 }, (_, index) => ({
  transactionId: `tx-${index}`, idempotencyKey: `key-${index}`,
  participantBootstrapComplete: true, documentBootstrapComplete: true, workflowBootstrapComplete: true,
}))
const input = {
  environment: 'production', currentCapacity: 100, transactions, completedBatchAudits: 1,
  pilotCloseouts: [{ sessionId: 'pilot-session-010', batchNumber: 10, auditPassed: true, closeoutDecision: 'allow_next_session_check', incidentCount: 0, stopConditionsTriggered: false }],
  scaleApproval: { approvedBy: 'operations.lead@arch9.test', approvedAt: '2026-07-19T12:00:00.000Z', approvedByRole: 'operations', decision: 'approved_to_maintain_mvp_capacity', fromCapacity: 100, toCapacity: null, productionCredentialsUsed: false },
  reportingMonth: '2026-07', recordedAt: '2026-07-19T12:00:00.000Z', monthlyTransactionReferences: transactions.map((transaction) => transaction.transactionId), monthlyTransactionCount: 10, productionCredentialsUsed: false,
  capacityMaintenance: { reviewedBy: 'operations.lead@arch9.test', reviewedAt: '2026-07-19T12:00:00.000Z', reviewerRole: 'operations', decision: 'maintain_mvp_capacity', monthlyTransactionLimit: 100, newProductScopeIntroduced: false, recurringOperationalBlockerCount: 0, productionCredentialsUsed: false },
}
try {
  writeFileSync(inputPath, JSON.stringify(input))
  const valid = spawnSync(process.execPath, ['scripts/mvp-capacity-maintenance-evidence-check.mjs', `--input=${inputPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).monthlyTransactionLimit, 100)
  const progression = spawnSync(process.execPath, ['scripts/mvp-scale-progression.mjs', `--input=${inputPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(progression.status, 0, progression.stderr)
  assert.equal(JSON.parse(progression.stdout).decision, 'maintain_mvp_capacity')
  writeFileSync(inputPath, JSON.stringify({ ...input, capacityMaintenance: { ...input.capacityMaintenance, newProductScopeIntroduced: true } }))
  const scopeExpansion = spawnSync(process.execPath, ['scripts/mvp-capacity-maintenance-evidence-check.mjs', `--input=${inputPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(scopeExpansion.status, 1, 'New product scope must not be accepted under the MVP capacity-maintenance review.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP capacity-maintenance evidence checks passed.')
