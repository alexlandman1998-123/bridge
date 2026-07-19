import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = spawnSync(process.execPath, ['scripts/mvp-staging-migration-plan.mjs', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
})

assert.equal(result.status, 1, 'The un-reconciled migration directory must block staging.')
const report = JSON.parse(result.stdout)
assert.equal(report.decision, 'no_go')
assert.equal(report.blockers.includes('duplicate_local_migration_versions'), true)
assert.equal(report.blockers.includes('staging_ledger_evidence_required'), true)
assert.deepEqual(report.expectedMvpVersions, ['202607180046', '202607190001'])
assert.equal(report.duplicateVersions.length > 0, true)

console.log('MVP staging migration-plan safety test passed.')
