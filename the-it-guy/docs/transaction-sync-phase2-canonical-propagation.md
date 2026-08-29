# Transaction sync Phase 2 — canonical propagation

Phase 2 introduces the single propagation envelope defined by the Phase 0 contract. It does not replace specialist source tables: an attorney, agent, buyer, seller, or originator still writes to the record they own, then commits one transaction-scoped command referencing that durable source record.

Each accepted command atomically produces:

1. a canonical `transaction_events` envelope;
2. a verified canonical lane-state reference;
3. a verified `transaction_rollups` reference;
4. an audience-scoped activity projection;
5. a monotonically increasing transaction refresh version; and
6. an immutable command receipt/audit record.

The database action catalog contains all 29 actions frozen in Phase 0. Unknown actions, unauthorised roles, malformed idempotency keys, missing Phase 1 spine records, and unsafe client-visible copy fail closed.

## Runtime behavior

- `commitTransactionSyncCommand` is the shared application entry point.
- Duplicate `(transaction_id, idempotency_key)` commands return the original receipt without duplicating events or activity.
- Client-visible activity requires explicit buyer/seller recipients and dedicated client-safe wording.
- Internal action types cannot be made public by fallback rendering.
- Attorney stage changes are the first live mutation path wired to the canonical command.
- All workspaces using `useTransactionLiveRefresh` now subscribe to `transaction_refresh_signals`, rather than individual domain tables.
- Reconnect compares the remote transaction version; polling remains at 30 seconds.

The Realtime publication uses the application-owned `public.transaction_refresh_signals` table. Nothing is created or modified inside Supabase's locked `realtime` schema.

## Deployment order

1. Complete and verify Phase 1 for the target transactions.
2. Apply the Phase 2 migration in a non-production branch or staging project.
3. Run `npm run test:transaction-sync-phase2` and the existing attorney/progress suites.
4. Exercise an attorney-stage canary twice with the same idempotency key; require one receipt, one activity projection, and one version increment.
5. Promote the migration before deploying the application bundle. Until migration promotion, the attorney adapter preserves the existing workflow behavior and treats only the missing Phase 2 RPC as unavailable.

No production migration or data write is part of this implementation change.
