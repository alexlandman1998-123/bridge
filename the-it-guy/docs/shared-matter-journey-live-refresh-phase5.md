# Phase 5 — resilient shared journey refresh

Implemented locally; no hosted migrations or production deployment performed.

## Delivery

- Attorney/agent transaction workspaces and the developer unit workspace subscribe to authenticated transaction/refresh/notification signals. A visible-tab 15-second version poll recovers missed signals.
- A full refresh at least every 60 seconds (subject to network/request duration) also covers data that does not publish a revision. Missing signal-table access falls back to the normal authorised loader.
- Buyer and seller portals use their existing token/session-authorised full loader every 15 seconds while visible. They do not create a WebSocket using the unrelated signed-in Supabase client. This is near-live polling, not guaranteed instantaneous push.
- Focus, visibility restoration and online recovery reconcile immediately. Hidden/offline tabs do not start new reads. Outstanding requests may finish, and disposed queues cannot acknowledge or schedule additional work.
- One refresh runs at a time per mounted hook. Signals arriving during it are coalesced into a subsequent read. Revisions are acknowledged only after success; failed revisions remain eligible for retry.

## Consistency and access

- Professional route refreshes and portal loads reject outdated request/context results. Shared legal revisions cannot move backwards within the same matter.
- Portal auth failures clear portal data. An unavailable journey remains unavailable rather than reviving a previously authorised snapshot.
- Portal edits to personal details and dirty bond applications survive ordinary background updates. Developer background refresh skips the lightweight shell and does not reset the stage form.
- Password-protected `seller-` portals now request the shared journey through `bridge_read_seller_shared_matter_journey`. The database validates the existing password session, resolves the linked matter itself and returns the same allowlisted task projection. No browser-supplied matter ID, private notes or evidence are accepted/exposed by this reader.
- The SQL projection is factored into a private function with no browser-role access; both public readers retain explicit access checks.

## Migration order

1. `20260908144636_shared_matter_journey_atomic_commands.sql`
2. `20260908150256_shared_matter_journey_reader.sql`
3. `20260908152512_shared_matter_journey_seller_session_reader.sql`

Deploy the database changes before the corresponding application bundle. No data backfill or bulk task-status changes are included.

## Verification

- Queue tests: retry/acknowledgement, coalescing during an in-flight read, disposal, explicit failed results and stale revision guards.
- Mounted React hook tests (JSDOM): no signed-in queries/subscriptions for portals, visible polling, offline/online/focus recovery, signal failure retry, signal-table fallback, channel closure and cleanup.
- Isolated PostgreSQL/PGlite tests: six finance/entity scenarios, five recipient projections, seller session denial/acceptance, private-function denial, and identical changed task/revision after a commit. Seller auth dependencies are permission fixtures, not a claim of hosted session testing.
- Shared journey rendering and atomic command regression tests, plus production build.

## Remaining release acceptance

Apply migrations to staging and verify an actual attorney completion/reopen alongside signed-in agent/developer and buyer/seller portals, including a password-protected seller session. Test disconnect/reconnect and revoke a portal session. Confirm same task identity/outcome and revision, with unchanged privacy boundaries. No live-device or production-sync claim is made until that acceptance run passes.
