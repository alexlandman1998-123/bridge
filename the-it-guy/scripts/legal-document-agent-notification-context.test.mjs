import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/202608010002_fix_legal_document_agent_context_lead_lookup.sql', 'utf8')

assert.match(migration, /create or replace function public\.bridge_legal_document_agent_context_phase1/)
assert.match(migration, /from public\.leads lead_row[\s\S]*where lead_row\.lead_id = v_lead_id/)
assert.doesNotMatch(migration, /from public\.leads\s+where lead_id = v_lead_id/)
assert.match(migration, /order by transaction_row\.updated_at desc nulls last, transaction_row\.created_at desc nulls last/)
assert.match(migration, /order by listing_row\.updated_at desc nulls last, listing_row\.created_at desc nulls last/)

console.log('Legal document agent notification context lead lookup regression passed.')
