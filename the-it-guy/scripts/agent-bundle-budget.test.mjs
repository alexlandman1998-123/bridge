import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./agent-bundle-budget.mjs', import.meta.url))
async function fixture(t, extra = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'arch9-bundle-budget-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(path.join(cwd, 'dist/assets'), { recursive: true })
  for (const [name, source] of Object.entries({ 'index-test.js': 'export const app = true;', 'index-test.css': 'body { color: black; }', 'Clients-test.js': 'export const clients = true;', ...extra })) {
    await writeFile(path.join(cwd, 'dist/assets', name), source)
  }
  return spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' })
}

test('a split API build passes without the retired central API asset', async t => {
  const result = await fixture(t)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).legacyApi, { retired: true, assetCount: 0 })
})
test('even a small reintroduced legacy API asset fails the release gate', async t => {
  const result = await fixture(t, { 'api-regression.js': 'export const regression = true;' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Retired legacy API assets must remain absent/)
})
test('the original entry JavaScript size limit remains enforced', async t => {
  const result = await fixture(t, { 'index-test.js': randomBytes(140 * 1024) })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Entry JavaScript.*budget is 130\.0 KiB/)
})
test('the original global CSS size limit remains enforced', async t => {
  const result = await fixture(t, { 'index-test.css': randomBytes(160 * 1024) })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Global CSS.*budget is 155\.0 KiB/)
})
