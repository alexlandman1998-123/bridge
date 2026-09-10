# Auction MVP — Phase 6 release readiness

Phase 6 is a controlled-release gate. It does not deploy code, apply migrations, seed auction data, or approve a production pilot automatically.

## Required staging acceptance

Apply the Phase 1, 2, 4 and 5 auction migrations to staging, then capture `database-acceptance.json` with contract `arch9-auction-phase6-database-acceptance-v1`. Every check below must have `status: "PASS"`:

- `migrations_applied`: all four auction migrations appear in the migration ledger.
- `organisation_isolation`: a user from organisation B cannot read organisation A auctions, bidders, bids, outcomes, handoffs or audit events.
- `unauthorised_write_denied`: a non-auction-manager cannot call any auction write RPC.
- `concurrent_bid_rejected`: two simultaneous bids at the same increment result in one accepted bid and one validation rejection.
- `lifecycle_enforced`: invalid transitions and registration outside `registration_open` are rejected.
- `terminal_bid_rejected`: no bid is accepted after close, outcome, withdrawal or handoff.

Capture `browser-acceptance.json` with contract `arch9-auction-phase6-browser-acceptance-v1`. Required passing checks:

- `auction_list_loads`
- `create_edit_persists`
- `bidder_approval_enforced`
- `bid_minimum_enforced`
- `outcome_and_handoff_recorded`
- `audit_trail_visible`

Use two organisation accounts and a separate ordinary agent account for the access probes. Do not use production bidder details for this exercise.

## Run the gate

From `the-it-guy/` after placing the two evidence files in `test-results/auction-phase6/`:

```sh
node scripts/auction-phase1-foundation.test.mjs
node scripts/auction-phase2-workspace.test.mjs
node scripts/auction-phase3-bidder-registration.test.mjs
node scripts/auction-phase4-live-console.test.mjs
node scripts/auction-phase5-closeout-handoff.test.mjs
node scripts/auction-phase6-release-readiness.test.mjs
node scripts/auction-phase6-release-readiness.mjs
```

The final command writes `test-results/auction-phase6/release-readiness.json` and exits non-zero with `HOLD` when evidence is missing, stale, or failing. A `GO` is evidence readiness only; it is not deployment approval.

## Controlled pilot

Before enabling one pilot organisation, name an auction manager, auctioneer, rollback owner and support owner. Start with one internal, staff-recorded auction. Monitor audit events, rejected bid attempts, realtime delivery and handoff creation. Pause/withdraw the auction or remove pilot access if integrity or access-control issues appear.
