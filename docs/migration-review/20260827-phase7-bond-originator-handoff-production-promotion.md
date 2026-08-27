# Bond-Originator Handoff Production Promotion

Generated: 2026-08-27T17:29:09Z  
Repo: `/Users/alexanderlandman/the-it-guy`

## Scope

This is the phase 7 production-promotion artifact for the canonical bond-originator handoff repair created in phases 5 and 6. It is read-only. It does not apply SQL, record the production ledger, or mutate production.

The promotion target is the canonical packet only:

- `20260827160000_canonical_bond_originator_handoff_repair.sql`

## Decision

| Field | Value |
| --- | ---: |
| Status | `PRODUCTION_PROMOTION_BLOCKED_PENDING_EVIDENCE` |
| Canonical migration version | `20260827160000` |
| Canonical file | `20260827160000_canonical_bond_originator_handoff_repair.sql` |
| Production route | `production_apply_sql` |
| Production project ref | `isdowlnollckzvltkasn` |
| Staging evidence file | `docs/staging-evidence/20260827160000-bond_finance_runtime.json` |
| Production evidence file | `docs/production-evidence/20260827160000-bond_finance_runtime.json` |
| Ready for production | `No` |

## Blockers

- `phase6_staging_ledger_not_recorded`
- `phase6_catalog_checks_pending`
- `phase6_behavior_checks_pending`
- `phase6_rollback_or_no_residue_pending`
- `phase6_reviewer_pending`
- `phase6_approver_pending`
- `phase6_captured_at_pending`

## Production Promotion Shape

| Field | Value |
| --- | --- |
| Mode | `plan` |
| Mutation attempted | `No` |
| Mutation succeeded | `Not attempted` |
| Production recovery locked | `Yes` |

## Commands When Ready

No commands are enabled yet. Complete the phase 6 staging evidence packet first, then promote the canonical version one step at a time:

```bash
node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260827160000 --staging-evidence docs/staging-evidence/20260827160000-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260827160000 --staging-evidence docs/staging-evidence/20260827160000-bond_finance_runtime.json --production-evidence docs/production-evidence/20260827160000-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION
```

## Follow-Up

1. Complete the phase 6 staging evidence packet with a real ledger record, passing catalog checks, passing behavior checks, passing rollback/no-residue checks, and reviewer approval.
2. Keep the phase 0 guard active.
3. Promote only the canonical packet at `20260827160000` once phase 6 is complete.
