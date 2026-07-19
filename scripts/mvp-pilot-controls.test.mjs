import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-phase7-'))
const batchPath = path.join(directory, 'batch.json')
try {
  writeFileSync(batchPath, JSON.stringify({
    environment: 'production', sessionCheckPassed: true,
    transactions: Array.from({ length: 10 }, (_, index) => ({
      transactionId: `tx-${index + 1}`, idempotencyKey: `key-${index + 1}`,
      participantBootstrapComplete: true, documentBootstrapComplete: true, workflowBootstrapComplete: true,
      postDeploySmokePassed: true, gateStateConsistent: true,
    })),
  }))
  const batch = spawnSync(process.execPath, ['scripts/mvp-pilot-batch-audit.mjs', `--input=${batchPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(batch.status, 0, batch.stderr)
  assert.equal(JSON.parse(batch.stdout).batchSize, 10)

  const session = spawnSync(process.execPath, ['scripts/mvp-pilot-session-check.mjs'], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(session.status, 1, 'A pilot must be blocked without production readiness evidence.')
  assert.equal(JSON.parse(session.stdout).decision, 'no_go')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP pilot controls tests passed.')
