#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')

assert.match(
  source,
  /\.select\('id, role, firm_id, firm_role, full_name, first_name, last_name'\)/,
  'the active profile context should request only canonical profile columns',
)
assert.doesNotMatch(
  source,
  /\.select\('id, role, firm_id, firm_role, full_name, first_name, last_name, name'\)/,
  'the active profile context must not request the retired profiles.name column',
)

console.log('profile query contract ok')
