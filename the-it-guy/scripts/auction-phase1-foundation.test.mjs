import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20260909211500_auction_phase1_foundation.sql'), 'utf8')

for (const table of ['auctions', 'auction_bidders', 'auction_bids', 'auction_outcomes', 'auction_audit_events']) {
  assert.match(migration, new RegExp(`create table public\\.${table}`), `${table} table must exist`)
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must use RLS`)
}

for (const rpc of ['auction_create', 'auction_transition', 'auction_register_bidder', 'auction_set_bidder_status', 'auction_record_bid', 'auction_close']) {
  assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`), `${rpc} RPC must exist`)
  assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`), `${rpc} must be callable by authenticated users`)
}

assert.match(migration, /auction_bids_immutable/)
assert.match(migration, /for update/)
assert.match(migration, /Auction bids are immutable/)
assert.match(migration, /p_amount < v_minimum/)
assert.match(migration, /bridge_has_organisation_membership/)
assert.match(migration, /bridge_organisation_role_authority_level/)

console.log('Auction phase 1 foundation contract passed.')
