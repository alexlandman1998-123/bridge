# Bond-Originator Handoff Staging Plan

Generated: 2026-08-27T14:50:07Z  
Repo: `/Users/alexanderlandman/the-it-guy`

## Scope

This is the phase 6 staging plan for the canonical bond-originator handoff repair created in phase 5. It is read-only. It does not apply SQL, record the ledger, or mutate production.

The plan targets the canonical packet only:

- `20260827160000_canonical_bond_originator_handoff_repair.sql`

## Decision

| Field | Value |
| --- | ---: |
| Status | `STAGING_READY_PENDING_EVIDENCE` |
| Canonical migration version | `20260827160000` |
| Canonical file | `20260827160000_canonical_bond_originator_handoff_repair.sql` |
| Staging route | `apply_original_after_dependency_check` |
| Consolidated source rows | 2 |

## Staging Row

| Version | Depends On | Action | File | Why |
| --- | --- | --- | --- | --- |
| `20260827160000` | `stream preflight` | `apply_original_after_dependency_check` | `20260827160000_canonical_bond_originator_handoff_repair.sql` | One canonical packet now captures both source bond-originator handoff repairs, so staging should treat it as the single reviewed target. |

## Required Staging Checks

- Apply the canonical migration in staging only.
- Verify `transaction_finance_workflows` receives the expected bond-hybrid workflow rows.
- Verify `transaction_bond_applications` receives the expected originator intake rows.
- Verify `transactions` receives the canonical bond scope backfill where needed.
- Verify the migration is idempotent when re-run against already repaired rows.
- Record the staging ledger only after catalog, behavior, and rollback/no-residue checks pass.

## Follow-Up

1. Keep the phase 0 guard active.
2. Use the canonical packet as the only staging target for this bond-originator repair.
3. Do not route the two source files independently in later phases.

