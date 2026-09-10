import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20260909211500_auction_phase1_foundation.sql'), 'utf8')
const repository = readFileSync(resolve(process.cwd(), 'src/services/auctionRepository.js'), 'utf8')
const workspace = readFileSync(resolve(process.cwd(), 'src/components/marketing/LaunchesAuctions.jsx'), 'utf8')

assert.match(migration, /create or replace function public\.auction_register_bidder/)
assert.match(migration, /create or replace function public\.auction_set_bidder_status/)
assert.match(migration, /v_auction\.status <> 'registration_open'/)
assert.match(migration, /status <> 'approved'/)
assert.match(migration, /coalesce\(max\(bidder_number\), 0\) \+ 1/)

for (const operation of ['listAuctionBidders', 'registerAuctionBidder', 'setAuctionBidderStatus']) {
  assert.match(repository, new RegExp(`export async function ${operation}`), `${operation} must be exported`)
}
assert.match(workspace, /Register bidder/)
assert.match(workspace, /Approve/)
assert.match(workspace, /Reject/)
assert.match(workspace, /Withdraw/)
assert.match(workspace, /Staff registration only/)

console.log('Auction phase 3 bidder registration contract passed.')
