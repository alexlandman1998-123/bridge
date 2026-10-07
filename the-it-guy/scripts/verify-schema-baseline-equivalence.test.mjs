#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const source = await readFile(new URL('./verify-schema-baseline-equivalence.mjs', import.meta.url), 'utf8')
assert.match(source, /supabase', \['db', 'query', '--linked'/)
assert.match(source, /postgres\.\$\{config\.projectRef\}/)
assert.match(source, /'policies'/)
assert.match(source, /'triggers'/)
assert.match(source, /'indexes'/)
assert.match(source, /if \(strict && !report\.equivalent\)/)
for (const script of ['verify-schema-baseline-equivalence.mjs', 'rehearse-schema-baseline.mjs']) {
  const result = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, '--strict'], { encoding: 'utf8', env: { ...process.env, PATH: '' } })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Schema baseline rehearsal is retired/)
}
console.log('Schema baseline equivalence gate tests passed.')
