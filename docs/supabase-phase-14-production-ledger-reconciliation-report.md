# Supabase Phase 14 — Production Migration History Reconciliation

Generated: 2026-07-20

## Outcome

**Status: PRODUCTION_HISTORY_RECONCILED**

Production migration history for `isdowlnollckzvltkasn` has been reconciled without applying migration SQL or changing production schema or application data.

- 17 canonical 12-digit versions were recorded.
- 17 legacy 14-digit `…00` aliases were removed.
- The production ledger remained at 433 rows.
- Direct ledger verification found all 17 canonical rows and no legacy alias rows.
- Genuine remote-only drift fell from 17 versions to zero.

## Method and safety controls

The Phase 14 runner accepts only the fixed production project, the Phase 13 `linked_ephemeral` access mode, the tested-recovery confirmation, and an approved Phase 13 access record. It validates every expected local migration filename and the 433-row ledger baseline before mutation.

The only mutation command used was `supabase migration repair --linked`: first `applied` for the canonical versions, then `reverted` for the legacy aliases. No migration file was executed. The operation changed migration-history metadata only.

The runner is resumable and idempotent. A later verification run made no changes because all 17 entries were already in `canonical_only` state.

## Supabase CLI display behavior

After reconciliation, `supabase migration list` still renders 17 paired rows for these 12-digit timestamps: one local-only row and one remote-only row with the same version. Direct queries to `supabase_migrations.schema_migrations` prove the canonical entries are present. The Phase 8 classifier therefore treats only these exact reviewed same-version pairs as display splits.

| Measure | Before | After |
| --- | ---: | ---: |
| Legacy remote-only aliases | 17 | 0 |
| Reviewed canonical display splits | 0 | 17 |
| Genuine remote-only versions | 17 | 0 |
| Genuine local-only versions | 83 | 67 |
| Production ledger rows | 433 | 433 |

## Remaining release work

Phase 14 does not promote the Phase 5 migration manifest. Production evidence remains 0/64, so each migration must still pass the Phase 7 controlled production workflow and receive reviewed closeout evidence.

The working tree also currently contains two unrelated local files using version `202607200002`. Phase 14 did not edit either file. That duplicate must be resolved as part of release-branch stabilization before the final closeout can pass.

Machine-readable evidence is stored in `migration-evidence/2026-07-20-production-ledger-phase14/production-ledger-reconciliation.json`.
