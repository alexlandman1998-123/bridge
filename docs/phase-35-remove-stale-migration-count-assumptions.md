# Phase 35 — Remove Stale Migration-Count Assumptions

## Outcome

**Status: MIGRATION_COUNTS_DERIVED_FROM_GOVERNED_INVENTORY**

The staging and production gates no longer assume that the migration manifest permanently contains 68 or 71 rows. The manifest is the authoritative inventory; the staging-readiness certificate, closeout evidence, release scope, and production closeout must agree with its current row and version set.

At implementation time the governed manifest contains 78 unique migrations. That number is reported as an observed result, not embedded as the gate's permanent expectation.

## Controls

- Phase 6 and Phase 7 workflows call the shared Phase 35 verifier.
- Phase 6, Phase 7, Phase 8, Phase 11, and Phase 32 tests derive their expected totals from the manifest.
- Phase 11 rejects an empty manifest, missing versions, and duplicate versions instead of comparing against an obsolete constant.
- The verifier requires every manifest row to resolve to a local migration file.
- The verifier requires the readiness, release-scope, closeout-evidence, and production-closeout records to reconcile with the same governed set.

No database, migration ledger, deployment, or production configuration is changed by this phase.
