# Supabase Phase 19: Local-Only Migration Backlog Resolution

Generated: `2026-07-29T19:24:57Z`

## Scope

Phase 19 resolves the 32 pure local-only Supabase migration rows into explicit execution routes. This phase is non-mutating: it does not apply SQL, repair migration history, relink Supabase, or change production.

## Inputs

- Phase 5 module drift audit: `docs/supabase-migration-phase-5-module-drift-report.md`
- Phase 5 application manifest: `docs/supabase-phase-5-application-manifest.json`
- Phase 3 action routing: `docs/supabase-push-phase-3-action-routing-report.md`

## Backlog Status

| Status | Rows | Meaning |
| --- | ---: | --- |
| Runner eligible | 29 | Safe to enter the controlled staging runner once dependencies and evidence are ready. |
| Blocked pending manual review | 2 | Data or column-only migrations need explicit human/schema review before routing. |
| Blocked pending corrective migration | 1 | Partial-live migration must be superseded by a new forward corrective migration. |
| Total pure local-only backlog | 32 | All rows now have a route or a named blocker packet. |

## Runner-Eligible Routes

| Route | Rows | Next action |
| --- | ---: | --- |
| `apply_original` | 23 | Apply one migration at a time in staging, then record staging ledger evidence. |
| `repair_only` | 6 | Run module smoke tests, then record ledger evidence without applying SQL. |

The runner-eligible rows are already listed with exact commands in `docs/supabase-push-phase-3-action-routing-report.md`.

## Blocked Packets Created

| Version | File | Packet | Decision |
| --- | --- | --- | --- |
| `202607270015` | `202607270015_bond_finance_document_metadata_cleanup.sql` | `docs/manual-review/202607270015-bond_finance_runtime.md` | `pending_manual_data_review` |
| `202607270011` | `202607270011_attorney_transaction_key_dates.sql` | `docs/manual-review/202607270011-other.md` | `pending_manual_data_review` |
| `202607270012` | `202607270012_canonical_matter_lifecycle_stages.sql` | `docs/corrective-migration-packets/202607270012-other.md` | `pending_corrective_migration` |

Pending clearance JSON was also added for these rows under `docs/non-runnable-clearance/`. Each file includes blockers and blank approval fields so the automation cannot accidentally treat the row as approved.

## Dependency Impact

- `202607280003` depends on `202607270015`; the bond finance guided application stream cannot start until the document metadata cleanup is reviewed or superseded.
- `202607270012` depends on `202607270011`; canonical lifecycle corrective work should wait until the attorney key-date column review is complete.
- `202607270014` depends on `202607270012`; the native structured legal PDF repair-only row should not be recorded until the lifecycle corrective path is settled.

## Phase 19 Outcome

Status: `BACKLOG_ROUTED_WITH_3_REVIEW_BLOCKERS`

The 32 local-only rows are no longer an undifferentiated backlog. They are split into:

- 23 SQL apply candidates for the staging runner
- 6 repair-only ledger candidates after smoke evidence
- 2 manual-review packets
- 1 corrective-migration packet

The production freeze should remain active until the runner-eligible rows have staging and production evidence, and until the three blocked rows are either cleared, superseded, or deliberately deferred by a release owner.
