import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = spawnSync(process.execPath, ['scripts/mvp-production-readiness-check.mjs'], { cwd: repoRoot, encoding: 'utf8' })
assert.equal(result.status, 1, 'Production must be blocked without real staging evidence.')
const report = JSON.parse(result.stdout)
assert.equal(report.decision, 'no_go')
assert.equal(report.blockers.includes('missing_staging-ledger'), true)
assert.equal(report.blockers.includes('missing_deployment-evidence'), true)
assert.equal(report.blockers.includes('missing_rollback-evidence'), true)
assert.equal(report.blockers.includes('missing_support-evidence'), true)
assert.equal(report.blockers.includes('missing_journey-evidence'), true)
assert.equal(report.blockers.includes('missing_review-evidence'), true)
assert.equal(report.blockers.includes('missing_decision-evidence'), true)
assert.equal(report.checks.every((check) => check.passed), true)

console.log('MVP production-readiness no-go test passed.')
