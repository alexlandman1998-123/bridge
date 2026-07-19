import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-7a-'))
const decisionPath = path.join(directory, 'decision.json')
const supportPath = path.join(directory, 'support.json')
const sessionPath = path.join(directory, 'session.json')
const decision = { pilotOwner: 'operations.owner@arch9.test', supportOwner: 'support.owner@arch9.test', rollbackOwner: 'engineering.owner@arch9.test', initialBatchSize: 10 }
const session = {
  environment: 'production', sessionId: 'pilot-session-001', batchNumber: 1, plannedAt: '2026-07-19T07:00:00.000Z', preparedBy: decision.pilotOwner,
  ...decision, stopAuthority: decision.pilotOwner, sessionScope: 'single_batch_of_up_to_10', plannedTransactionReferences: ['lead-001', 'lead-002'], productionCredentialsUsed: false,
}
try {
  writeFileSync(decisionPath, JSON.stringify(decision))
  writeFileSync(supportPath, JSON.stringify({ stopAuthority: decision.pilotOwner }))
  writeFileSync(sessionPath, JSON.stringify(session))
  const valid = spawnSync(process.execPath, ['scripts/mvp-pilot-session-evidence-check.mjs', `--evidence=${sessionPath}`, `--decision-evidence=${decisionPath}`, `--support-evidence=${supportPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).plannedTransactionCount, 2)
  writeFileSync(sessionPath, JSON.stringify({ ...session, plannedTransactionReferences: Array.from({ length: 11 }, (_, index) => `lead-${index}`) }))
  const oversized = spawnSync(process.execPath, ['scripts/mvp-pilot-session-evidence-check.mjs', `--evidence=${sessionPath}`, `--decision-evidence=${decisionPath}`, `--support-evidence=${supportPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(oversized.status, 1, 'A pilot session may not exceed the approved batch size.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP pilot session-evidence checks passed.')
