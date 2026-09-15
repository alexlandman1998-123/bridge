# Supabase Ledger Drift Resolution

Generated: 2026-09-14T16:26:46.136Z

## Decision

| Field | Value |
| --- | --- |
| Status | `LEDGER_DRIFT_BLOCKED` |
| Resolved | No |
| Pure local-only rows | 24 |
| Pure remote-only rows | 4 |
| Divergent rows | 0 |
| Reviewed split rows | 0 |
| Unresolved split rows | 0 |
| Blockers | 28 |

## Pure Local-Only

| Version | Stream | Resolution | Blockers | Command |
| --- | --- | --- | --- | --- |
| `20260913120000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913123000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913130000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913163747` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913164108` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913164657` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913164842` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913165354` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913174500` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913182014` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913182312` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913184108` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913185826` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913190000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913191403` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913193410` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913195118` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913200000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260913210000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260914073546` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260914073806` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260914080412` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260914080640` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260914083450` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |

## Pure Remote-Only

| Version | Resolution | Blockers | Command |
| --- | --- | --- | --- |
| `20260914073732` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260914073732_*.sql` |
| `20260914073827` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260914073827_*.sql` |
| `20260914080521` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260914080521_*.sql` |
| `20260914080747` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260914080747_*.sql` |

## Split Rows

No rows.

## Closeout Integration

The reviewed split versions in this report are safe for closeout accounting only. Pure local-only rows still need one-version production promotion, and pure remote-only rows still need local history restoration or explicit remote-only acceptance.
