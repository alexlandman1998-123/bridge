# Historical transaction classification

`scripts/classify-historical-transaction-records.mjs` classifies historical transaction records that still have legacy attorney or bond-originator roleplayers but are missing the canonical handover records.

The command is permanently read-only. It rejects write flags, requires an explicit production-read confirmation, and refuses to run against any Supabase project except the canonical production project.

```sh
npm run classify:historical-transactions -- \
  --confirm-production-read-only \
  --output output/historical-transaction-classification-production.json
```

Add `--include-inactive` to include inactive historical transactions. Generated reports are intentionally ignored by Git because they contain production record IDs.

The classifier assigns one of three states:

- `seed`: explicit demo metadata or strong fixture/non-production evidence; proposed action is quarantine followed by reviewed deletion.
- `real`: no seed evidence and at least two independent strong live-data signals; proposed action is canonical handover backfill when needed.
- `ambiguous`: insufficient or conflicting evidence; proposed action is manual review with no automatic change.

Classification never quarantines, deletes, updates, or backfills a record. Those operations require a separate reviewed and guarded process.

## Quarantine

The quarantine runner consumes an exact classifier report. It refuses reports containing real or ambiguous rows and requires an explicit confirmation matching the report count.

```sh
npm run quarantine:seed-transactions -- \
  --report output/historical-transaction-classification-all-production.json
```

The command above is a dry run. Applying a quarantine requires all safeguards:

```sh
npm run quarantine:seed-transactions -- \
  --report output/historical-transaction-classification-all-production.json \
  --apply \
  --confirm-count 118 \
  --reason "Quarantine classified historical seed transactions" \
  --operator "approved-change-reference" \
  --output output/historical-transaction-quarantine-production.json
```

The database independently rechecks seed evidence, locks the exact transaction set, and applies the batch atomically. Quarantine marks transactions inactive, archives them, marks them as demo data, revokes buyer and seller portal access, and removes legacy roleplayers from live assignment queues. It never deletes records.

Every changed transaction, portal link, portal context, and roleplayer value is snapshotted in the service-only quarantine ledger. `bridge_restore_quarantined_seed_transactions()` restores a complete batch if the quarantine must be reversed.

## Genuine transaction backfill

The genuine backfill runner accepts only classifier rows marked `real` with medium/high confidence and the action `backfill_canonical_handover`. Seed and ambiguous records are rejected.

```sh
npm run backfill:genuine-transactions -- \
  --report output/historical-transaction-classification-production.json
```

Applying a non-empty report additionally requires `--apply`, an exact `--confirm-count`, a reason, and an operator/change reference. An empty real-classification report is a safe no-op.

The database independently checks that every transaction is active, non-demo, not quarantined, free of fixture signals, and supported by at least two live-data signals. Attorney roleplayers must resolve to exactly one active non-demo attorney firm. Bond-originator roleplayers must retain a canonical organisation or user scope.

The operation atomically creates missing firm-first attorney assignments for Matters and missing bond-originator intake applications/workflows. It records the exact IDs created in a service-only audit ledger and never changes already-canonical handovers.
