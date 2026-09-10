import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20260909214500_auction_phase4_realtime.sql'), 'utf8')
const repository = readFileSync(resolve(process.cwd(), 'src/services/auctionRepository.js'), 'utf8')
const workspace = readFileSync(resolve(process.cwd(), 'src/components/marketing/LaunchesAuctions.jsx'), 'utf8')

assert.match(migration, /add table public\.auction_bids/)
assert.match(migration, /add table public\.auctions/)
for (const operation of ['listAuctionBids', 'recordAuctionBid', 'subscribeToAuctionChanges']) {
  assert.match(repository, new RegExp(`(export async function|export function) ${operation}`), `${operation} must be exported`)
}
assert.match(repository, /auction_record_bid/)
assert.match(repository, /postgres_changes/)
assert.match(workspace, /AUCTIONEER CONSOLE/)
assert.match(workspace, /Record bid/)
assert.match(workspace, /Pause bidding/)
assert.match(workspace, /Close bidding/)
assert.match(workspace, /Resume bidding/)

console.log('Auction phase 4 live-console contract passed.')
