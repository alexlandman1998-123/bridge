# Phase 25 — Promote Transaction and Seller Completion

## Decision

**Status: PRODUCTION_PHASE_25_COMPLETE**

Transaction creation and seller-attorney completion are promoted and ledgered on production project `isdowlnollckzvltkasn`. A least-privilege correction was added after production preflight found direct table grants that differed from the staging contract.

## Result

| Check | Result |
| --- | --- |
| Requested migrations | 2/2 promoted |
| Corrective migrations | 1/1 promoted |
| Production ledger | 489 → 492 |
| Reviewed production evidence | 59/71 |
| Remaining governed migrations | 12 |
| Existing transactions | 285 preserved |
| Existing offers | 2 preserved |
| Seller onboarding rows | 29 preserved |
| Incomplete seller onboarding rows | 15 preserved |
| Production physical backups | 8 |
| Production PITR | Disabled |
| Phase 0 broad-push guard | Active |

## Transaction creation

Version `202607180046` was already live through reconciliation migration `20260719193500`, so its SQL was not replayed. The preflight found that `anon` and `authenticated` nevertheless held broad direct privileges on `transaction_participant_requirements`.

Corrective migration `202607209903` now enforces the certified boundary:

- anonymous has no table privileges;
- authenticated has `SELECT` only, filtered through the existing RLS policy;
- direct authenticated writes are revoked;
- the authenticated `bridge_create_mvp_transaction(jsonb)` RPC remains the write boundary; and
- unauthenticated transaction creation returns SQLSTATE `42501`.

After that correction passed, the historical `202607180046` version was ledgered through the repair-only path.

## Seller completion

Migration `20260719194500` is live with its trigger enabled. The trigger function is security-definer, has a fixed `public, pg_temp` search path, and cannot be executed directly by anonymous or authenticated clients.

Production rollback probes proved that:

- completing onboarding without a preferred-attorney configuration is rejected with SQLSTATE `23514`;
- the seller may complete using the nominate-another-firm path when the required firm name and email are present; and
- the probes left all 29 onboarding rows unchanged.

There are currently no production preferred-partner rows, so the connected-preferred-attorney acceptance path becomes operational only after a preferred transfer-attorney partner is configured. The nominate-other completion path is operational now.

## Separate security advisory

Supabase reported RLS disabled on eight tables in both staging and production:

- `bond_rls_cutover_exclusions`
- `matter_number_sequences`
- `transaction_commissions`
- `transaction_document_requirements`
- `transaction_lifecycle_workflows`
- `transaction_rollup_validation`
- `workspace_regions`
- `workspace_units`

Phase 25 did not enable RLS on these unrelated tables. Enabling it without reviewed policies could block legitimate application access. They require a separate table-by-table access-policy phase.

## Remaining boundary

Phase 25 did not promote attorney accounting, attorney calendar, or the conditional legal-master chain. It did not deploy the frontend, configure a preferred transfer-attorney partner, widen the production cohort, merge the release branch, or retire the Phase 0 migration freeze.
