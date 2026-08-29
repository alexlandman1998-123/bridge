# Transaction sync Phase 8: fleet release gate

Phase 8 expands the Phase 7 canary check to every eligible active transaction. It is a complete-fleet release gate, not an automatic production switch.

## Gate requirements

A fleet release passes only when:

- transaction enumeration reaches the end of the dataset without a cap or truncated page window;
- at least one passing Phase 7 canary exists for the same environment and project within the configured age window;
- at least one eligible active transaction exists;
- every active transaction passes the Phase 7 five-role certification; and
- no certification query or execution fails.

Archived and cancelled transactions are excluded. Demo transactions are excluded unless explicitly requested. Pagination is pinned to a fleet snapshot, ordered deterministically by creation time and transaction id, deduplicated by transaction id, and reconciled against an exact database count. A short final page alone is not enough to pass.

## Evidence

The release evidence contains only the fleet snapshot/count, canary receipt IDs, transaction-to-certification hashes, aggregate counts, issue codes, environment, and project ref. A deterministic fleet SHA-256 hash binds the complete result.

`transaction_sync_fleet_release_runs` is immutable through the application path, RLS-protected, readable only by internal administrators, and insertable only by the service role. Failed release attempts may also be recorded so operational evidence is not lost.

## Commands

Read-only plan:

```bash
npm run release:transaction-sync-phase8 -- --environment=staging
```

Record the fleet result:

```bash
npm run release:transaction-sync-phase8 -- \
  --record-release \
  --environment=staging \
  --confirm-fleet-release \
  --confirm-project-ref=<project-ref> \
  --reason="Record the complete five-role transaction synchronization fleet gate."
```

Production recording additionally requires `--confirm-production`. Phase 8 does not apply migrations, perform recovery, or change a production rollout flag.
