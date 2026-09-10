import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20260909220000_auction_phase5_closeout_handoff.sql'), 'utf8')
const foundation = readFileSync(resolve(process.cwd(), '../supabase/migrations/20260909211500_auction_phase1_foundation.sql'), 'utf8')
const repository = readFileSync(resolve(process.cwd(), 'src/services/auctionRepository.js'), 'utf8')
const workspace = readFileSync(resolve(process.cwd(), 'src/components/marketing/LaunchesAuctions.jsx'), 'utf8')

assert.match(foundation, /create or replace function public\.auction_close/)
assert.match(foundation, /A complete sold outcome is required|A winning approved bidder/)
assert.match(migration, /create table public\.auction_transaction_handoffs/)
assert.match(migration, /create or replace function public\.auction_prepare_transaction_handoff/)
assert.match(migration, /Only a sold auction can be handed to transaction setup/)
for (const operation of ['getAuctionOutcome', 'recordAuctionOutcome', 'prepareAuctionTransactionHandoff', 'getAuctionTransactionHandoff']) {
  assert.match(repository, new RegExp(`export async function ${operation}`), `${operation} must be exported`)
}
assert.match(workspace, /AUCTION CLOSEOUT/)
assert.match(workspace, /Record outcome/)
assert.match(workspace, /Prepare transaction handoff/)

console.log('Auction phase 5 closeout and handoff contract passed.')
