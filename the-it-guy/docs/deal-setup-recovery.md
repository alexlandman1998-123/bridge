# Automatic recovery of Deal Setup updates

Ownership: the primary transaction workspace and its shared Supabase database.
This change covers the document requirements and attorney routing derived from
saved Deal Setup terms. Other transaction commands retain their existing recovery
paths.

## How it works

The existing terms version and pending status are the durable work record. The
new migration resets recovery metadata in the same database transaction as a new
terms version. Recovery does not depend on the browser receiving the save response
or making a second request.

The authenticated scheduled endpoint `/api/cron/deal-setup-recovery` runs every
minute. Each invocation processes at most three deals, sequentially. Claims use
`FOR UPDATE SKIP LOCKED`; a deal has one active three-minute lease. A terminated
worker's lease expires and a later invocation reclaims its work. Failed attempts
retry after 1, 2, 4, 8, 16 and then 30 minutes, with the delay capped at 30 minutes.
There is no attempt limit that silently abandons a deal.

The worker reuses `syncDealSetupAttorneyHandoff` and `syncDealSetupDownstream`.
The document engine is bundled during the application build into
`dist-ssr/dealSetupReconciler.mjs`, outside the public website assets. Its browser
client is replaced with an empty module; the worker injects its server client.
Failed reads stop the attempt rather than becoming empty document collections.

Every derived write carries the claimed transaction, terms version and lease.
Database triggers lock and validate the parent transaction before accepting
writes to routing, canonical requirements/events and both requirement projections.
Expired leases, superseded versions and attempts to write another transaction
are rejected. Completion also requires the current lease and version. Partial
work can therefore be retried without marking a newer save complete. Existing
document routines preserve canonical uploads/reviews and stable projection IDs.

The browser's retry button brings the next attempt forward without breaking an
active lease. Browser retries only queue work; missing RPCs, authorization errors
and network failures never fall back to browser-owned downstream writes. This is
why the migration must precede the app release. Pending screens refresh every ten seconds, pause while editing/saving,
and stop polling when complete or unmounted. Background recovery continues
independently of this screen refresh.

## Focused verification

From this package:

```sh
npm run test:deal-setup-recovery
node --test --test-concurrency=1 src/services/documents/__tests__/documentRequestCanonicalRequiredDocumentSyncService.test.js src/services/documents/__tests__/documentRequestCanonicalTransactionSyncService.test.js
```

The recovery suite executes the migration in an isolated PGlite database. It
covers atomic queue capture, abandoned leases, retry delay, stale-version fences,
cross-transaction protection, role permissions, a browser-independent runner,
cron authorization, failed reads, native Node packaging and repeatable document
reconciliation preserving approved evidence. It also exercises save responses
and the screen's background refresh. These are local fixtures, not live proof.

Local verification on 9 November 2026 passed 39 recovery/migration/UI checks,
22 shared document checks, the canonical document engine and adapter checks,
and all nine fast-baseline scripts. The private bundle built and loaded through
the scheduled runner in native Node. Scoped lint had no errors and one unchanged
unused-variable warning in the document engine. A full production build and
live browser-closure acceptance remain for the approved release environment.

## Release and operations

No production migration, scheduler activation or deployment is performed by
implementing or running these tests. An approved release must follow
[`docs/database-release-runbook.md`](../../docs/database-release-runbook.md),
including the Supabase guard and the exact target/migration dry run.

1. Apply `20261109175327_deal_setup_background_recovery.sql` before the app.
   This adds recovery state and functions; it does not rewrite historical terms.
2. Build the app normally. Its build now also generates the private reconciler
   bundle. The new Vercel function explicitly includes that artifact. Verify the
   cloud build and package before promotion; a full local production build is
   unnecessary on this limited-memory machine.
3. The endpoint uses existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
   `CRON_SECRET` server settings. Verify their target identity. Set
   `DEAL_SETUP_RECOVERY_ENABLED=true` only for the approved active environment.
   Missing/false means paused. Never put the service key in a `VITE_` setting.
4. Verify unauthenticated requests fail and the enabled authorized endpoint can
   load its private bundle. Run the available database security advisors. Confirm
   the deployed cron appears and its scheduled invocation succeeds.
5. In an approved controlled transaction, save terms, close the browser and
   verify the same terms version reaches `complete` with matching attorney
   routing and document requirements. Confirm an already pending/failed deal can
   recover too. No unrelated migration, outbound delivery or listing action is
   part of this release.

Inspect delayed work using a server/admin database connection:

```sql
select id, deal_setup_terms_version, deal_setup_sync_status,
       deal_setup_sync_attempts, deal_setup_sync_next_at,
       deal_setup_sync_lease_until, deal_setup_sync_error
from public.transactions
where deal_setup_terms_version is not null
  and deal_setup_sync_status in ('pending','failed')
order by deal_setup_sync_next_at nulls first;
```

Cron responses expose aggregate counts and safe error codes, not customer facts
or raw errors. Repeated failures remain visible through the saved status/error,
retry metadata and scheduled endpoint failures. Monitor scheduled invocation
history as well as this backlog; an empty invocation alone does not certify a
healthy scheduler. Permanent data problems still require an operator correction.

To pause, set `DEAL_SETUP_RECOVERY_ENABLED=false` and deploy that configuration.
Pending work remains durable. Leave the additive migration in place; do not
remove queue markers or replay a commercial save to recover a failed update.
After release, refresh existing tabs so they use the new server-owned retry path.
