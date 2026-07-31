# Supabase Ledger Drift Resolution

Generated: 2026-07-31T17:27:24.002Z

## Decision

| Field | Value |
| --- | --- |
| Status | `LEDGER_DRIFT_RESOLVED` |
| Resolved | Yes |
| Pure local-only rows | 0 |
| Pure remote-only rows | 0 |
| Divergent rows | 0 |
| Reviewed split rows | 17 |
| Unresolved split rows | 0 |
| Blockers | 0 |

The current read-only Phase 0/5 reconciliation is documented in `docs/migration-review/20260731-phase0-phase5-ledger-reconciliation.md`.

## Pure Local-Only

No rows.

The historical `202607270012` row is intentionally excluded from the unresolved queue because its reviewed corrective migration `202607290005_corrective_canonical_matter_lifecycle_stages.sql` has already passed staging and production verification. The original partial-live migration remains non-runnable; the corrective promotion is the recorded target-state resolution.

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
| `202606090010` | `other` | `confirmed_superseded_split` | Yes | None |
| `202606110004` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110005` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110006` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110007` | `commercial` | `confirmed_live_split` | Yes | None |

## Closeout Integration

The reviewed split versions in this report are safe for closeout accounting. The current production evidence and corrective-clearance packet account for the historical partial-live row without replaying or repairing the original migration.
