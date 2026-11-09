#!/usr/bin/env node
import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'

const source = await readDomainApiSource()

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
