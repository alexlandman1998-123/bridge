# Shared journey phase 3 — authoritative task commands

## Implemented

The attorney task service now calls `bridge_update_attorney_workflow_step_v4` once.
Within one Postgres transaction it:

1. Checks the actor, lane capability, task identity and active plan using the existing attorney permission/mutation foundation.
2. Serialises on the matter, checks the task timestamp and resolves a caller-generated command UUID.
3. Invokes the existing v3 implementation for the task outcome, lane state, canonical lifecycle and restricted history/event.
4. Publishes the existing shared-progress projection inside the same transaction, using static catalog wording rather than client-supplied descriptions.
5. Restores canonical lifecycle summary authority after the legacy publisher.
6. Advances the existing refresh token and captures the planned task snapshot and counts.
7. Writes a minimal task-change event and an idempotency receipt before returning.

A failure at any point rolls everything back. The same actor/command/payload returns the original receipt without writing again. Reusing a command for another payload fails. Authority is rechecked even for replay.

The matter lock is shared across its lanes; the legacy publisher's advisory lock is acquired first to preserve its lock order. Revisions are monotonic refresh tokens, not a promise of contiguous increments: existing triggers can also advance them.

## Progress and privacy

The active plan defines the denominator, including planned tasks without seeded rows. Completed and completed-externally count as completed; N/A leaves the denominator. Zero applicable tasks returns null, not fabricated completion.

The committed snapshot contains task identities, statuses, timestamps, plan and counts. It is an internal source for the phase 2 adapter, not a client-authorised API response. Private notes and work packets remain in the existing access-controlled history and private command receipt, never in the new minimal change feed.

The legacy projection still has only five statuses. External completion and N/A are preserved exactly in the canonical snapshot/feed but are deliberately not coerced into that projection. Migrating portal readers in phase 4 remains necessary; this phase alone does not make all existing portal views task-for-task identical.

Routine shared facts and explicit client communication remain separate. This does not automatically publish private notes. Existing queued-notification dispatch is best-effort after commit; dispatch or follow-up reads cannot turn a committed save into a failed save.

## Browser handling

- Pass the displayed task's timestamp where available; callers without it use the service's pre-command read.
- Retry an uncertain transport failure once with the identical command UUID and payload; never automatically retry a database conflict.
- A 40001 stale edit requires refresh and review.
- Follow-up read failure returns a committed result with `refreshRequired`; the UI retains existing Work data and shows a saved/refresh warning if reloading fails.
- Receipt replay can return an older snapshot than the latest matter state. Future shared readers must apply revision ordering, not blindly replace newer data.

## Migration / rollout

Migration: `20260908144636_shared_matter_journey_atomic_commands.sql`.

The internal `journey_private` schema has RLS enabled and no browser access. Only the v4 public entry point is granted to authenticated users; earlier task RPCs become internal-only. No hosted database was changed.

Release the migration and frontend together and require existing browser sessions to reload. Old browser code cannot keep using v3 after this migration. The new frontend deliberately fails closed if v4 is missing; it never falls back to separate writes.

The seeded wording catalog mirrors the existing 73 attorney task definitions. The regression test detects drift; future catalog changes need a matching migration.

## Verification

Run:

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/shared-matter-journey-atomic.test.mjs
node scripts/shared-matter-journey-plan.test.mjs
node scripts/shared-matter-journey-contract.test.mjs
node scripts/attorney-mvp-phase3-acceptance.test.mjs
node scripts/attorney-workflow-refresh-phase4.test.mjs
npm run build
```

Passed locally: actual PostgreSQL execution in isolated PGlite using the existing mutation and publisher SQL; completion, reopening, all seven outcomes, missing planned rows, N/A denominator, publication/receipt rollback, stale edits, replay, permission revocation, private-schema ACL, catalog parity and transport retry. Build passed with existing bundle/Browserslist warnings.

Not verified: the complete hosted migration chain, production triggers/RLS combinations, real simultaneous database sessions, live buyer/seller sessions or email delivery. Docker was unavailable; no staging/production mutations were used as a substitute. These remain release acceptance checks, not claims of live synchronisation.
