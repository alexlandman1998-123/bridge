# Supabase Ledger Drift Resolution

Generated: 2026-08-11T15:59:05.701Z

## Decision

| Field | Value |
| --- | --- |
| Status | `LEDGER_DRIFT_BLOCKED` |
| Resolved | No |
| Pure local-only rows | 2 |
| Pure remote-only rows | 0 |
| Divergent rows | 0 |
| Reviewed split rows | 17 |
| Unresolved split rows | 0 |
| Blockers | 2 |

## Pure Local-Only

| Version | Stream | Resolution | Blockers | Command |
| --- | --- | --- | --- | --- |
| `202607310007` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202607310008` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |

## Pure Remote-Only

No rows.

## Split Rows

| Version | Module | Decision | Reviewed | Blockers |
| --- | --- | --- | --- | --- |
| `202606010001` | `transaction_network` | `confirmed_live_split` | Yes | None |
| `202606030007` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |
| `202606030008` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |
| `202606030009` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |
| `202606030010` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |
| `202606030011` | `notification_automation` | `confirmed_live_split` | Yes | None |
| `202606040001` | `workspace_platform` | `confirmed_live_split` | Yes | None |
| `202606040002` | `workspace_platform` | `confirmed_live_split` | Yes | None |
| `202606040004` | `workspace_platform` | `confirmed_live_split` | Yes | None |
| `202606040005` | `workspace_platform` | `confirmed_live_split` | Yes | None |
| `202606050001` | `bond_finance` | `confirmed_live_manual_sql` | Yes | None |
| `202606080002` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606090010` | `other` | `confirmed_live_split` | Yes | None |
| `202606110004` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110005` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110006` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110007` | `commercial` | `confirmed_live_split` | Yes | None |

## Closeout Integration

The reviewed split versions in this report are safe for closeout accounting only. Pure local-only rows still need one-version production promotion, and pure remote-only rows still need local history restoration or explicit remote-only acceptance.
