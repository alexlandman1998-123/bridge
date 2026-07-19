import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-plan-'))
const ledger = path.join(directory, 'ledger.json')
const decisions = path.join(directory, 'decisions.json')
const output = path.join(directory, 'plan.json')
const collisionVersions = ['202607180025', '202607180026', '202607180027', '202607180028', '202607180032']
try {
  writeFileSync(ledger, JSON.stringify({ projectRef: 'staging-ref', capturedAt: '2026-07-19T00:00:00.000Z', appliedVersions: [...collisionVersions, '202607180046'] }))
  writeFileSync(decisions, JSON.stringify({
    approvedBy: 'release.owner@arch9.test', approvedAt: '2026-07-19T01:00:00.000Z',
    collisions: collisionVersions.map((version) => ({ version, disposition: 'forward_only_reconciliation', owner: 'database.owner@arch9.test', rationale: 'Remote timestamp must be preserved.' })),
  }))
  const result = spawnSync(process.execPath, ['scripts/mvp-canonical-migration-plan.mjs', `--ledger=${ledger}`, `--decisions=${decisions}`, `--output=${output}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const plan = JSON.parse(readFileSync(output, 'utf8'))
  assert.equal(plan.status, 'manual_forward_only_reconciliation_required')
  assert.equal(plan.collisionPlan.length, collisionVersions.length)
  assert.equal(plan.collisionPlan.every((entry) => entry.disposition === 'forward_only_reconciliation'), true)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP canonical migration plan tests passed.')
