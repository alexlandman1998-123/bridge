# Supabase Phase 8 Notification Automation Report

Generated: 2026-07-15
Branch: `codex/db-phase0-reconciliation`
Project: `isdowlnollckzvltkasn`

## Outcome

Phase 8 is deployed, live-verified, recorded in the Supabase migration ledger, committed, and pushed. It installs the notification automation registry, event audit stream, invite-acceptance notifications, reminder queue, atomic dispatcher claims, stale-processing recovery, health diagnostics, and premium cadence/quiet-hour/escalation controls.

The migration audit moved from 353 matched / 11 local-only rows to 360 matched / 5 local-only rows, with no split or remote-only versions.

## Applied migrations

- `202607050009` — notification automation foundation
- `202607050010` — attorney, bond-originator, and workspace invite acceptance events
- `202607060001` — reminder queue and run audit
- `202607060002` — reminder dispatch claiming and stale reset
- `202607060003` — organisation-scoped health and observability
- `202607060004` — premium cadence, quiet-hour, and escalation controls
- `202607140026` — notification projection and security reconciliation

All seven versions were recorded as applied after live verification.

## Runtime correction

The Phase 2 invite-acceptance helper historically supplied twelve values to an eleven-column `transaction_notifications` insert. PostgreSQL accepts the PL/pgSQL function definition without planning that statement, and the function's exception handler then converted the runtime failure to `null`. This made acceptance notification failures silent.

The Phase 8 reconciliation replaces the helper with the correct mapping:

- `transaction_id`
- `user_id`
- `role_type`
- `notification_type`
- title and message
- read state
- dedupe key
- event type and event data

A rollback-only behavior test confirmed the corrected insert creates one valid notification and returns the same row on a repeated dedupe key.

## Security reconciliation

- Anonymous access is revoked from all notification automation tables and functions.
- Authenticated users can read definitions and their RLS-scoped notification events.
- Authenticated users cannot insert or update automation events directly.
- Reminder runs and event mutation are service-role only.
- Queue, claim, and stale-reset RPCs are service-role only.
- Health RPCs are available to authenticated users and remain organisation-membership scoped.
- Trigger helpers, workspace-admin resolution, event recording, and invite-acceptance recording functions are not API-callable.
- Acceptance notifications continue to run from database triggers under the function owner rather than accepting arbitrary client RPC requests.

## Verification evidence

The complete 3,157-line sequence passed against the linked project inside one rollback-only transaction before deployment. Post-deployment verification confirmed:

- 3 automation tables, all with RLS
- 5 automation policies
- 17 active and enabled automation definitions
- 5 reminder definitions with cadence, quiet-hour, and escalation controls
- all 5 automation, reminder-run, and invite-acceptance triggers
- communication-delivery linkage columns
- reminder queue and dispatch state columns
- anonymous health access denied
- authenticated health access enabled
- authenticated queue/claim access denied
- service-role queue/claim access enabled
- zero production notification events and reminder runs at initial deployment

The live rollback-only behavior smoke proved:

- corrected acceptance notification insertion
- notification deduplication
- premium reminder queue dry-run execution
- no fixture rows remain after rollback

The 23 existing communication-delivery rows were preserved. Phase 8 added nullable linkage fields and did not reclassify or rewrite those historical deliveries.

## Automated checks

- Supabase migration safety check: passed with 365 unique migration files
- Notification automation foundation contract: passed
- Phase 2 acceptance automation checks: passed
- Phase 3 reminder queue checks: passed
- Phase 4 reminder dispatch checks: passed
- Phase 5 observability checks: passed
- Phase 6 premium control checks: passed
- Phase 8 reconciliation static guard: passed
- Full rollback-only migration and behavior verification: passed
- Live post-deployment catalog/security verification: passed
- Live rollback-only behavior smoke: passed

## Remaining migration backlog

The remaining five pure local-only versions are intentionally outside Phase 8:

- bond/finance: 2
- workspace platform: 1
- in-progress legal-document work: 2

There are no split ledger rows and no remote-only rows.
