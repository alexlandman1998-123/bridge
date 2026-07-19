import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-classify-'))
const ledgerPath = path.join(directory, 'ledger.json')
try {
  writeFileSync(ledgerPath, JSON.stringify({ projectRef: 'staging-ref', capturedAt: '2026-07-19T00:00:00.000Z', appliedVersions: ['202607180025', '202607180046', '202700010001'] }))
  const result = spawnSync(process.execPath, ['scripts/mvp-migration-ledger-classify.mjs', `--ledger=${ledgerPath}`, '--json'], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 1, 'Known timestamp collisions must require reconciliation.')
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'reconciliation_required')
  assert.equal(report.classifications.timestampCollisions.some((item) => item.version === '202607180025' && item.remoteState === 'already_applied_remotely'), true)
  assert.equal(report.classifications.remoteOnly.includes('202700010001'), true)
  assert.equal(report.classifications.localOnly.includes('202607190001'), true)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP migration ledger classification tests passed.')
