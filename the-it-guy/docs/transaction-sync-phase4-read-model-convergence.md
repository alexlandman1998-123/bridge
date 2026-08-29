# Transaction sync Phase 4: read-model convergence

Phase 4 gives the buyer, seller, agent, bond originator, and attorney workspaces one common transaction projection contract. It is intentionally a read-path change: Phase 2 remains the canonical event/activity/watermark producer and Phase 3 remains the atomic module write adapter.

## Shared contract

`transactionSyncReadModelService` returns the same shape for every workspace:

- transaction identity and schema version;
- the `transaction_refresh_signals.version` watermark and change time;
- canonical main/detailed stage and lane snapshots supplied by the workflow reader;
- RLS-filtered `transaction_activity_projections` activity;
- shared progress and deployment warnings.

The application applies a second, fail-closed audience filter after Supabase RLS. Buyer and seller activity must be `client_visible` and explicitly addressed to that role. Agent and bond-originator readers cannot surface attorney-internal notes. Attorney readers may surface internal activity only when it is addressed to the attorney audience and the database policy also permits the row.

## Workspace wiring

- Buyer and seller: `clientPortalWorkspaceService`, including the activity feed.
- Agent: `fetchTransactionById` in `src/lib/api.js`.
- Bond originator: `getBondOriginatorCanonicalTransactionWorkspace`.
- Attorney: `getAttorneyWorkflowOperationsForTransaction`.
- Shared workflow: `getTransactionWorkflowReadModel`.

The version watermark lets every workspace compare the data it rendered with the realtime refresh signal. The existing live-refresh hook continues to invalidate on a higher version and on reconnect.

## Rollout note

No remote migration is applied by Phase 4. It consumes the Phase 2 projection tables, so deploy the Phase 2 and Phase 3 migrations before enabling these readers in a remote environment.
