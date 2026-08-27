import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/20260827081713_normalize_transaction_participant_assignment_sources.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /bridge_normalize_transaction_participant_assignment_source/)
assert.match(migration, /before insert or update of assignment_source/)
assert.match(migration, /'partner_invitation'[\s\S]+then 'transaction_direct'/)
assert.match(migration, /'transaction_roleplayer_propagation'[\s\S]+then 'system_inherited'/)
assert.match(migration, /transaction_participants_assignment_source_check/)
assert.match(migration, /assignment_source in \(\s*'transaction_direct',\s*'development_default',\s*'system_inherited',\s*'reference_only'\s*\)/)
assert.match(migration, /revoke all on function public\.bridge_normalize_transaction_participant_assignment_source\(\)/)

console.log('transaction participant assignment source normalization contract passed')
