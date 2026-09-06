import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./validate-api-split-release-scope.mjs', import.meta.url), 'utf8')
assert.match(source, /Read-only: it never applies migrations, deploys code, or creates tags/i)
assert.match(source, /candidateCommit/)
assert.match(source, /allowedChangedPaths/)
assert.match(source, /Migration hash differs/)

const result = spawnSync(process.execPath, ['scripts/validate-api-split-release-scope.mjs', '--help'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
assert.match(result.stdout, /Usage:/)

console.log('API-split release-scope validation tests passed.')
