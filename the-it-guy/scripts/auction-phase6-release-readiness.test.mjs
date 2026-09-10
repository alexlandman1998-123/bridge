import assert from 'node:assert/strict'
import { evaluateAuctionPhase6Readiness } from './auction-phase6-release-readiness.mjs'

const source = { files: Object.fromEntries([
  '../supabase/migrations/20260909211500_auction_phase1_foundation.sql', '../supabase/migrations/20260909213000_auction_phase2_draft_edit.sql', '../supabase/migrations/20260909214500_auction_phase4_realtime.sql', '../supabase/migrations/20260909220000_auction_phase5_closeout_handoff.sql', 'src/services/auctionRepository.js', 'src/components/marketing/LaunchesAuctions.jsx',
].map((file) => [file, true])) }
const checks = (keys) => keys.map((key) => ({ key, status: 'PASS' }))
const database = { contract: 'arch9-auction-phase6-database-acceptance-v1', capturedAt: '2026-09-09T10:00:00.000Z', checks: checks(['migrations_applied', 'organisation_isolation', 'unauthorised_write_denied', 'concurrent_bid_rejected', 'lifecycle_enforced', 'terminal_bid_rejected']) }
const browser = { contract: 'arch9-auction-phase6-browser-acceptance-v1', capturedAt: '2026-09-09T10:00:00.000Z', checks: checks(['auction_list_loads', 'create_edit_persists', 'bidder_approval_enforced', 'bid_minimum_enforced', 'outcome_and_handoff_recorded', 'audit_trail_visible']) }

const ready = evaluateAuctionPhase6Readiness({ source, database, browser, now: new Date('2026-09-09T12:00:00.000Z') })
assert.equal(ready.status, 'GO')
const blocked = evaluateAuctionPhase6Readiness({ source: { files: {} }, database: {}, browser: {}, now: new Date('2026-09-09T12:00:00.000Z') })
assert.equal(blocked.status, 'HOLD')
assert.ok(blocked.blockers.some((blocker) => blocker.includes('organisation_isolation')))
assert.ok(blocked.blockers.some((blocker) => blocker.includes('auction_list_loads')))

console.log('Auction phase 6 release-readiness contract passed.')
