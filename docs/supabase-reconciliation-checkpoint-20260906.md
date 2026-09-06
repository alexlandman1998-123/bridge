# Supabase Reconciliation Checkpoint

Generated: 6 September 2026

## Current state

The live reconciliation and Phase 8 closeout were rerun after the completed
bond-finance production batch.

| Check | Result |
| --- | ---: |
| Raw production local-only rows | 100 |
| Effective unresolved local-only rows | 89 |
| Production evidence complete | 4/93 |
| Phase 5 evidence-ready rows | 26 |
| Phase 5 evidence-blocked rows | 67 |
| Unresolved split rows | 0 |
| Remote-only rows | 0 |
| Phase 8 freeze retirement | Blocked |

The difference between 100 raw rows and 89 effective rows is the 11 historical
partial migrations superseded by approved corrective versions.

## Blocking condition

No additional row currently passes the complete end-to-end dependency gate.
Twenty-five production repair candidates have none of their expected objects
on staging and one is partial, so they cannot receive truthful repair-only
evidence. The remaining evidence-complete rows have earlier production ledger
dependencies that are still absent.

The next safe batch must therefore run on staging: reclassify the 25 none-live
repair candidates to single-file SQL application, review the one partial row,
and execute the resolved corrective/manual rows in dependency order. Production
promotion can resume only after those rows have complete staging evidence.

The Phase 0 broad-push freeze remains active.
