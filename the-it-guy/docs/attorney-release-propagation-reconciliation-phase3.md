# Attorney release — Phase 3 guarded reconciliation

## Objective

Provide a staging-only repair mechanism that cannot perform broad fleet reconciliation. Dry-run is the default; Phase 3 implementation does not itself authorise applying repairs.

## Controls

- Exact staging project reference and production denial from Phase 0.
- Recovery confirmation required for `--apply`.
- Valid, complete Phase 2 manifest and fingerprint required.
- Global health must still match the classified gap count.
- Maximum ten distinct transactions per run.
- Reconciliation RPC is invoked once per explicit transaction; a null transaction ID is never used for repair.
- Genuine and non-canonical demo records require a fingerprint-bound allowlist with approver and timestamp.
- Manual-review or unknown record keys are rejected.
- The existing RPC writes only professional-shared projections; client-visible mutation is not allowed.
- Receipts contain redacted record keys and before/after counts, never raw UUIDs or client details.

## Dry-run canonical fixtures

Run:

`npm run reconcile:attorney-release-propagation-phase3 -- --scope=seeded-demo`

The current dry run resolves five seeded transactions containing 14 proposed repairs. It leaves the global gap count unchanged.

## Approved allowlist

Copy `docs/attorney-release-phase3-allowlist.example.json`, insert the current Phase 2 manifest fingerprint, an accountable approver, approval timestamp, and no more than ten reviewed redacted record keys. Then run:

`npm run reconcile:attorney-release-propagation-phase3 -- --allowlist=PATH --limit=10`

This remains a dry run. Applying later requires the same command with `--apply`, an exact current health match, and the staging recovery confirmation. Regenerate Phase 2 after every applied batch because the health count and classification fingerprint will change.

## Exit criteria

- Contract tests pass.
- Seeded-demo dry run produces an owner-only redacted receipt.
- Oversized, stale, unknown, manual-review, production, missing-approval, and missing-recovery requests fail before reconciliation.
- No Phase 3 verification command changes database state.
