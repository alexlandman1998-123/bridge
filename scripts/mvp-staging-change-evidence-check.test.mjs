import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-3b-'))
const evidencePath = path.join(directory, 'evidence.json')
try {
  writeFileSync(evidencePath, JSON.stringify({
    projectRef: 'abcdefghijklmnopqrst', migrationListCapturedAt: '2026-07-19T00:00:00.000Z', ledgerEvidencePath: 'docs/staging-migration-ledger.json',
    releaseOwner: 'release@arch9.test', databaseOwner: 'database@arch9.test', rollbackOwner: 'rollback@arch9.test',
    backupDecision: 'backup_or_recovery_plan_confirmed', rollbackDecision: 'forward_fix_or_feature_disable_only',
    productionCredentialsUsed: false, approvedForStagingApply: true,
  }))
  const result = spawnSync(process.execPath, ['scripts/mvp-staging-change-evidence-check.mjs', `--evidence=${evidencePath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).passed, true)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP staging change-evidence checks passed.')
