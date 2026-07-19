import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function run(branch) {
  return spawnSync(process.execPath, ['scripts/mvp-migration-freeze-check.mjs', '--json', `--branch=${branch}`], { cwd: repoRoot, encoding: 'utf8' })
}

const allowed = run('codex/arch9-mvp-release')
assert.equal(allowed.status, 0, allowed.stderr)
assert.equal(JSON.parse(allowed.stdout).decision, 'permitted')

const frozen = run('main')
assert.equal(frozen.status, 1)
const report = JSON.parse(frozen.stdout)
assert.equal(report.decision, 'frozen')
assert.equal(report.blockers.includes('migration_changes_outside_mvp_release_branch'), true)

console.log('MVP migration freeze checks passed.')
