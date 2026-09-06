import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./prepare-api-split-release-worktree.mjs', import.meta.url), 'utf8')
assert.match(source, /never alters the caller's current worktree or deploys anything/i)
assert.match(source, /worktree', 'add', '--detach'/)
assert.match(source, /--execute/)
assert.match(source, /destination already exists/)

const result = spawnSync(process.execPath, ['scripts/prepare-api-split-release-worktree.mjs', '--help'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
assert.match(result.stdout, /Usage:/)

console.log('API-split release worktree tests passed.')
