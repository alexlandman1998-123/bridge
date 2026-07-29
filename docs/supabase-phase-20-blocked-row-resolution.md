# Supabase Phase 20: Blocked Row Resolution

Generated: `2026-07-29T19:35:30Z`

## Scope

Phase 20 resolves the three Phase 19 blocked rows into runnable staging routes. This phase performed read-only live audits and local evidence updates only. It did not apply SQL, repair Supabase migration history, relink Supabase, or mutate production.

## Live Audit Summary

The linked project was `isdowlnollckzvltkasn`.

| Version | Ledger recorded | Live finding | Decision |
| --- | --- | --- | --- |
| `202607270015` | No | `189` active bond/hybrid transactions are missing canonical `bond_grant` rows. | `apply_original_after_dependency_check` |
| `202607270011` | No | `16/17` attorney key-date columns are missing; `target_registration_date` already exists as `date`. | `apply_original_after_dependency_check` |
| `202607270012` | No | Lifecycle catalog is partial-live: `3/8` objects exist. | `apply_corrective_after_dependency_check` |

## Corrective Migration

The historical lifecycle migration `202607270012_canonical_matter_lifecycle_stages.sql` remains non-runnable. It is superseded by:

`supabase/migrations/202607290005_corrective_canonical_matter_lifecycle_stages.sql`

Live workflow rows still contain legacy stage values (`confirmed`, `transfer`, `otp`), so the corrective migration restates the reviewed canonical lifecycle target under a new version and normalizes workflow rows before validating the canonical constraint.

## Clearance Files

| Version | Clearance | Packet |
| --- | --- | --- |
| `202607270015` | `docs/non-runnable-clearance/202607270015-bond_finance_runtime.json` | `docs/manual-review/202607270015-bond_finance_runtime.md` |
| `202607270011` | `docs/non-runnable-clearance/202607270011-other.json` | `docs/manual-review/202607270011-other.md` |
| `202607270012` | `docs/non-runnable-clearance/202607270012-other.json` | `docs/corrective-migration-packets/202607270012-other.md` |

## Routing Outcome

After refreshing Phase 5, Phase 2, and Phase 3:

| Field | Value |
| --- | ---: |
| Manifest rows | 33 |
| Effective runner rows | 32 |
| Approved corrective substitutions | 1 |
| Runner-eligible rows | 32 |
| Blocked rows | 0 |
| Apply-original routes | 26 |
| Repair-only routes | 6 |

The effective runner queue has `32` rows because `202607270012` is replaced by the corrective `202607290005` route.

## Remaining Requirement

Phase 20 clears planning blockers only. Staging evidence is still required before any production promotion:

- apply each SQL row one at a time in staging;
- record staging evidence only after catalog, behavior, and rollback/no-residue checks pass;
- promote production only from reviewed staging evidence;
- keep the database freeze active until production closeout reports zero unresolved ledger drift.
