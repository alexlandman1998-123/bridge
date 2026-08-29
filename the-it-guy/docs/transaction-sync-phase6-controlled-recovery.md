# Transaction sync Phase 6: controlled recovery

Phase 6 adds a narrowly scoped recovery path for synchronization metadata that can be proven from already durable records. It builds on the Phase 5 audit and remains fail-closed for missing or contradictory business evidence.

## Automatically repairable

- A missing, pending, or failed projection-queue receipt when the projected command, canonical event, and activity projection already exist and agree.
- A missing, behind, or receipt-mismatched refresh signal when the latest projected receipt and its canonical event already exist and agree.

## Never reconstructed

Phase 6 does not create or modify:

- transaction events;
- activity titles, descriptions, visibility, or audiences;
- source-domain records;
- command receipts or their immutable output envelope;
- workflow lanes, steps, or rollups; or
- signed/legal evidence.

Missing events, missing activity, incomplete receipt outputs, non-projected receipts, evidence mismatches, absent spine records, and refresh versions ahead of the command ledger block recovery.

## Controls

The database function is `SECURITY INVOKER` and executable only by `service_role`. Client roles are explicitly revoked. Plan mode performs no writes. Apply mode uses a transaction-scoped advisory lock and writes an immutable `transaction_sync_recovery_runs` receipt containing before/after metadata and the repairs performed. The receipt table has RLS and is readable only by authorised internal users.

The runner always executes Phase 5 first. Apply is attempted only for `repairable` or `no_op` plans, and Phase 5 runs again afterward. Release readiness comes exclusively from that post-recovery audit.

## Commands

Plan one transaction:

```bash
npm run recover:transaction-sync-phase6 -- \
  --environment=staging \
  --transaction-id=<uuid> \
  --reason="Investigate and repair verified synchronization metadata."
```

Apply a controlled staging recovery:

```bash
npm run recover:transaction-sync-phase6 -- \
  --apply \
  --environment=staging \
  --transaction-id=<uuid> \
  --confirm-controlled-recovery \
  --confirm-project-ref=<project-ref> \
  --reason="Repair verified projection metadata after Phase 5 review."
```

Production additionally requires `--confirm-production`.

The migration and runner are implemented locally but are not applied to any remote project by this phase.

