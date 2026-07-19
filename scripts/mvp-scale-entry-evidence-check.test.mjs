import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-8a-'))
const inputPath = path.join(directory, 'scale.json')
const transactions = Array.from({ length: 10 }, (_, index) => ({
  transactionId: `tx-${index}`, idempotencyKey: `key-${index}`,
  participantBootstrapComplete: true, documentBootstrapComplete: true, workflowBootstrapComplete: true,
}))
const input = {
  environment: 'production', currentCapacity: 10, transactions, completedBatchAudits: 1,
  pilotCloseouts: [{ sessionId: 'pilot-session-001', batchNumber: 1, auditPassed: true, closeoutDecision: 'allow_next_session_check', incidentCount: 0, stopConditionsTriggered: false }],
  scaleApproval: { approvedBy: 'operations.lead@arch9.test', approvedAt: '2026-07-19T10:00:00.000Z', approvedByRole: 'operations', decision: 'approved_to_next_mvp_capacity', fromCapacity: 10, toCapacity: 25, productionCredentialsUsed: false },
}
try {
  writeFileSync(inputPath, JSON.stringify(input))
  const valid = spawnSync(process.execPath, ['scripts/mvp-scale-entry-evidence-check.mjs', `--input=${inputPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).nextCapacity, 25)
  const progression = spawnSync(process.execPath, ['scripts/mvp-scale-progression.mjs', `--input=${inputPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(progression.status, 0, progression.stderr)
  assert.equal(JSON.parse(progression.stdout).decision, 'advance_rollout')
  writeFileSync(inputPath, JSON.stringify({ ...input, pilotCloseouts: [{ ...input.pilotCloseouts[0], incidentCount: 1 }] }))
  const incident = spawnSync(process.execPath, ['scripts/mvp-scale-entry-evidence-check.mjs', `--input=${inputPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(incident.status, 1, 'A pilot incident must block capacity scaling.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP scale-entry evidence checks passed.')
