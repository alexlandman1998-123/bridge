import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-3c-'))
const ledger = path.join(directory, 'ledger.json')
const evidence = path.join(directory, 'evidence.json')
const plan = path.join(directory, 'plan.json')
const projectRef = 'abcdefghijklmnopqrst'

try {
  writeFileSync(ledger, JSON.stringify({ projectRef, capturedAt: '2026-07-19T00:00:00.000Z', appliedVersions: ['202607180046'] }))
  writeFileSync(evidence, JSON.stringify({
    projectRef, migrationListCapturedAt: '2026-07-19T00:00:00.000Z', ledgerEvidencePath: ledger,
    releaseOwner: 'release@arch9.test', databaseOwner: 'database@arch9.test', rollbackOwner: 'rollback@arch9.test',
    backupDecision: 'backup_or_recovery_plan_confirmed', rollbackDecision: 'forward_fix_or_feature_disable_only',
    productionCredentialsUsed: false, approvedForStagingApply: true,
  }))
  writeFileSync(plan, JSON.stringify({
    projectRef, status: 'manual_forward_only_reconciliation_required', arch9MvpMigrationOrder: ['202607180046', '202607190001'],
    collisionPlan: [{ version: '202607180025' }],
  }))
  const result = spawnSync(process.execPath, [
    'scripts/mvp-staging-apply-preflight.mjs', `--ledger=${ledger}`, `--change-evidence=${evidence}`, `--canonical-plan=${plan}`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MVP_TARGET_ENV: 'staging', MVP_STAGING_PROJECT_REF: projectRef,
      SUPABASE_URL: `https://${projectRef}.supabase.co`, VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_ANON_KEY: 'staging-anon-key', VITE_SUPABASE_ANON_KEY: 'staging-anon-key',
    },
  })
  assert.equal(result.status, 1, '3C must block while forward-only reconciliation remains incomplete.')
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'no_go')
  assert.equal(report.blockers.includes('canonical_migration_reconciliation_incomplete'), true)
  assert.equal(report.blockers.includes('canonical_plan_has_unresolved_timestamp_collisions'), true)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP staging apply preflight checks passed.')
