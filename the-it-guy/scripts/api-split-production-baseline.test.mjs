import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./api-split-production-baseline.mjs', import.meta.url), 'utf8')

assert.match(source, /not apply migrations, deploy code, write to production, or create Git tags/i)
assert.match(source, /migration', 'list', '--linked'/)
assert.match(source, /db', 'advisors', '--linked'/)
assert.match(source, /test:release-integrity-contract/)
assert.match(source, /git', \['status', '--porcelain=v1', '--untracked-files=all'\]/)

const result = spawnSync(process.execPath, ['scripts/api-split-production-baseline.mjs', '--report'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(result.stdout)
assert.equal(report.version, 'api_split_production_baseline_v1')
assert.equal(report.mode, 'report')
assert.ok(Array.isArray(report.checks) && report.checks.length >= 5)

console.log('API-split production baseline gate tests passed.')
