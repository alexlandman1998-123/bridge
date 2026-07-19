import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-6b-'))
const deploymentPath = path.join(directory, 'deployment.json')
const rollbackPath = path.join(directory, 'rollback.json')
const projectRef = 'abcdefghijklmnopqrst'
const rollback = {
  environment: 'staging', projectRef, performedBy: 'engineering.owner@arch9.test', performedAt: '2026-07-19T05:00:00.000Z',
  runbookReference: 'docs/mvp-pilot-rollback-runbook.md', resultSummary: 'Feature-disable recovery restored normal workflow progression.',
  drillType: 'forward_fix_or_feature_disable', restoredOperationalState: true, dataDestructive: false, productionCredentialsUsed: false,
}
try {
  writeFileSync(deploymentPath, JSON.stringify({ projectRef }))
  writeFileSync(rollbackPath, JSON.stringify(rollback))
  const valid = spawnSync(process.execPath, ['scripts/mvp-staging-rollback-evidence-check.mjs', `--evidence=${rollbackPath}`, `--deployment-evidence=${deploymentPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).passed, true)
  writeFileSync(rollbackPath, JSON.stringify({ ...rollback, dataDestructive: true }))
  const destructive = spawnSync(process.execPath, ['scripts/mvp-staging-rollback-evidence-check.mjs', `--evidence=${rollbackPath}`, `--deployment-evidence=${deploymentPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(destructive.status, 1, 'A destructive rollback drill must not qualify a production pilot.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP staging rollback-evidence checks passed.')
