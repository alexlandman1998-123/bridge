#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('./verify-schema-baseline-equivalence.mjs', import.meta.url), 'utf8')
assert.match(source, /supabase', \['db', 'query', '--linked'/)
assert.match(source, /postgres\.rlavzicedrilmpaamviu/)
assert.match(source, /'policies'/)
assert.match(source, /'triggers'/)
assert.match(source, /'indexes'/)
assert.match(source, /if \(strict && !report\.equivalent\)/)
console.log('Schema baseline equivalence gate tests passed.')
