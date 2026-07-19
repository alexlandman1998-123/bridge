import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-6a-'))
const evidencePath = path.join(directory, 'decision.json')
const evidence = {
  decision: 'approved_for_controlled_production_pilot', approvedBy: 'release.owner@arch9.test', approvedAt: '2026-07-19T04:00:00.000Z', approvedByRole: 'release',
  releaseOwner: 'release.owner@arch9.test', pilotOwner: 'operations.owner@arch9.test', supportOwner: 'support.owner@arch9.test', rollbackOwner: 'engineering.owner@arch9.test',
  initialBatchSize: 10, pilotScope: 'controlled_production_pilot', stagingProjectRef: 'abcdefghijklmnopqrst', stagingAcceptanceDecision: 'accepted_for_pilot_consideration',
  rollbackProcedureReviewed: true, knownMvpLimitationsAccepted: true, productionCredentialsUsed: false,
}
try {
  writeFileSync(evidencePath, JSON.stringify(evidence))
  const valid = spawnSync(process.execPath, ['scripts/mvp-production-decision-evidence-check.mjs', `--evidence=${evidencePath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).initialBatchSize, 10)
  writeFileSync(evidencePath, JSON.stringify({ ...evidence, initialBatchSize: 11 }))
  const oversized = spawnSync(process.execPath, ['scripts/mvp-production-decision-evidence-check.mjs', `--evidence=${evidencePath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(oversized.status, 1, 'The controlled-pilot approval must reject an initial batch above 10.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP production decision-evidence checks passed.')
