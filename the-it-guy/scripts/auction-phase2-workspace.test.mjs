import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20260909213000_auction_phase2_draft_edit.sql'), 'utf8')
const repository = readFileSync(resolve(process.cwd(), 'src/services/auctionRepository.js'), 'utf8')
const workspace = readFileSync(resolve(process.cwd(), 'src/components/marketing/LaunchesAuctions.jsx'), 'utf8')

assert.match(migration, /create or replace function public\.auction_update_setup/)
assert.match(migration, /Only draft or registration-stage auctions can be edited/)
assert.match(migration, /grant execute on function public\.auction_update_setup/)

for (const operation of ['listAuctions', 'listAuctionListings', 'createAuction', 'updateAuctionSetup', 'transitionAuction']) {
  assert.match(repository, new RegExp(`export async function ${operation}`), `${operation} must be exported`)
}
assert.match(repository, /auction_create/)
assert.match(repository, /auction_update_setup/)
assert.match(repository, /auction_transition/)
assert.match(workspace, /Create auction/)
assert.match(workspace, /Open registration/)
assert.doesNotMatch(workspace, /auctionTabs, auctions,/)

console.log('Auction phase 2 workspace contract passed.')
