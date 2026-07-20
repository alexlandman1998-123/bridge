#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./supabase-phase14-production-ledger-reconciliation.mjs', import.meta.url), 'utf8')

assert.match(source, /RECONCILE_PRODUCTION_HISTORY/)
assert.match(source, /aliasCount: aliases\.length/)
assert.match(source, /aliases\.length/)
assert.match(source, /migration.*repair.*--linked/)
assert.match(source, /repair\('applied', canonicalToRecord\)/)
assert.match(source, /repair\('reverted', legacyToRemove\)/)
assert.match(source, /migrationSqlExecuted: false/)
assert.match(source, /productionSchemaOrDataMutated: false/)
assert.doesNotMatch(source, /db', 'query'.*--file|db push|db reset/i)

const aliasRows = source.match(/\['20\d{10}', '20\d{12}', '[a-z0-9_]+'\]/g) || []
assert.equal(aliasRows.length, 17)

console.log('Phase 14 production ledger reconciliation guard tests passed.')
