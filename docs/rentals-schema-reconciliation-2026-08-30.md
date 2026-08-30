# Rentals schema reconciliation — 2026-08-30

Project: `isdowlnollckzvltkasn`

## Live vs local

| Area | Local | Live | Result |
| --- | --- | --- | --- |
| Rentals migration ledger | 20 local `rental_*` migrations in `supabase/migrations` | 34 applied `rental_*` ledger entries | Reconciled by migration purpose, not timestamp: remote apply versions are generated at deployment. Earlier Rentals foundations are retained under `the-it-guy/sql/`. |
| Tables | Expected Rentals domain tables | 58 tables | Present; all 58 have RLS enabled. |
| RLS | Policies declared with the module | 70 policies | Every Rentals table has at least one policy. No anonymous table DML/select grant. |
| Functions | 42 source-defined Rentals RPC/helper functions in the current local migrations | 71 live functions | All current source RPCs are live after the queue repair. Remaining functions are earlier foundations and trigger helpers. |
| Triggers | Trigger-backed domain guards/history/update hooks | 39 live triggers | Present across the applicable tables. |
| Function grants | Authenticated RPCs; internal helpers private | No Rentals function executable by `anon` | Reconciled. |

## Repairs applied

1. `rental_schema_reconciliation_repair`
   - Restored `rental_get_maintenance_queue(integer)`, which existed in the local Phase 45 migration but was omitted from the live deployment.
   - Restricted internal Rentals trigger/RLS helpers from `PUBLIC`/`anon`; retained the authenticated grant required by `rental_branch_access` and the queue RPC.

2. `rental_trigger_search_path_hardening`
   - Pinned `rental_set_updated_at()` to an empty search path and removed public execution, resolving its mutable-search-path security advisor finding.

Both repairs are additive migrations and are applied live. The remote ledger now ends at `20260830104242_rental_trigger_search_path_hardening`.

## Migration history notes

- `rental_collection_reminders.sql` was the known failed original. Its successful replacement is `rental_collection_reminders_repair`.
- The local payment-allocation and financial-corrections source files are represented live by their corrective follow-up migrations (`*_fix`, `*_splits`, `*_core`, `*_balances`, period controls, and adjustment reversal), rather than matching timestamps.

## Advisor result

- Security: the remaining 51 Rentals notices are `authenticated_security_definer_function_executable`. These are intentional RPCs and each is authenticated/scoped in its function body; do not revoke them wholesale because that would break Rentals workflows. Review each RPC when its caller surface changes.
- Performance: 142 `unindexed_foreign_keys` and 49 `unused_index` informational notices are workload-dependent. No blanket indexes or drops were applied: the module is newly deployed, so index-usage statistics are not yet meaningful. Reassess after real production traffic with the slow-query report.
