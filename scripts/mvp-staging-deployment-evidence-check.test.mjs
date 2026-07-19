import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-3d-'))
const evidencePath = path.join(directory, 'deployment-evidence.json')
try {
  writeFileSync(evidencePath, JSON.stringify({
    environment: 'staging', projectRef: 'abcdefghijklmnopqrst', deployedAt: '2026-07-19T00:00:00.000Z', verifiedBy: 'release@arch9.test', productionCredentialsUsed: false,
    preflight: { decision: 'ready_for_human_approved_staging_apply', projectRef: 'abcdefghijklmnopqrst', migrationOrder: ['202607180046', '202607190001'] },
    postApplyLedger: { projectRef: 'abcdefghijklmnopqrst', appliedVersions: ['202607180046', '202607190001'] },
    rpcCheck: { rpc: 'bridge_create_mvp_transaction', passed: true, result: 'deployed', httpStatus: 401 },
  }))
  const result = spawnSync(process.execPath, ['scripts/mvp-staging-deployment-evidence-check.mjs', `--evidence=${evidencePath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).passed, true)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP staging deployment-evidence checks passed.')
