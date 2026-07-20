#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./supabase-phase13-production-access.mjs', import.meta.url), 'utf8')
const productionRunner = readFileSync(new URL('./supabase-phase7-production-execution.mjs', import.meta.url), 'utf8')

assert.match(source, /CONFIGURE_PRODUCTION_ACCESS/)
assert.match(source, /linked_ephemeral/)
assert.match(source, /supabase_cli_short_lived_login_role/)
assert.match(source, /Static SUPABASE_PRODUCTION_DB_URL credentials are not permitted/)
assert.match(source, /db', 'query', '--linked'/)
assert.match(source, /productionMutated: false/)
assert.doesNotMatch(source, /--file|migration.*repair|update public|insert into|delete from/i)
assert.match(productionRunner, /connectionArgs: \['--linked'\]/)
assert.doesNotMatch(productionRunner, /target\.dbUrl|SUPABASE_PRODUCTION_DB_URL/)

console.log('Phase 13 production access guard tests passed.')
