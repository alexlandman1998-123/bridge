import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-8b-'))
const inputPath = path.join(directory, 'monthly.json')
const input = {
  environment: 'production', reportingMonth: '2026-07', recordedAt: '2026-07-19T11:00:00.000Z', currentCapacity: 10,
  monthlyTransactionReferences: ['tx-001', 'tx-002'], monthlyTransactionCount: 2,
  transactions: [{ transactionId: 'tx-001' }, { transactionId: 'tx-002' }], productionCredentialsUsed: false,
}
try {
  writeFileSync(inputPath, JSON.stringify(input))
  const valid = spawnSync(process.execPath, ['scripts/mvp-monthly-capacity-evidence-check.mjs', `--input=${inputPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).remainingCapacity, 8)
  writeFileSync(inputPath, JSON.stringify({ ...input, monthlyTransactionReferences: Array.from({ length: 11 }, (_, index) => `tx-${index}`), monthlyTransactionCount: 11 }))
  const exceeded = spawnSync(process.execPath, ['scripts/mvp-monthly-capacity-evidence-check.mjs', `--input=${inputPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(exceeded.status, 1, 'Monthly evidence must reject capacity above the approved level.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP monthly capacity-evidence checks passed.')
