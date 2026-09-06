# Non-Runnable Migration Clearance Packet

Version: `20260905101931`
Stream: `bond_finance_runtime`
Original file: `20260905101931_bond_application_portal_phase5_delivery_reminders.sql`
Original action: `corrective_migration_required`
Clearance decision: `apply_corrective_after_dependency_check`

## Object State

| Type | Object | Relation | Live State |
| --- | --- | --- | --- |
| `function` | `bridge_bond_application_portal_delivery_action_centre_view` |  | Missing |
| `function` | `bridge_claim_notification_reminder_events_phase4` |  | Live |
| `function` | `bridge_prepare_bond_application_portal_delivery_phase5` |  | Missing |
| `function` | `bridge_queue_bond_application_portal_reminders_phase5` |  | Missing |
| `function` | `bridge_redact_bond_application_portal_delivery_token_phase5` |  | Missing |
| `function` | `bridge_send_bond_application_portal_delivery_for_originator` |  | Missing |
| `index` | `bond_application_portal_delivery_events_notification_idx` |  | Missing |
| `index` | `bond_application_portal_delivery_events_package_idx` |  | Missing |
| `policy` | `bond_application_portal_delivery_events_assigned_originator_read` | `bond_application_portal_delivery_events` | Missing |
| `table` | `bond_application_portal_delivery_events` |  | Missing |
| `trigger` | `trg_redact_bond_application_portal_delivery_token_phase5` |  | Missing |

## Required Work

- Do not record the historical partially-live version as applied.
- Apply the new timestamped corrective migration only after staging preflight and evidence checks.
- Keep this packet as evidence that the live diff and corrective SQL were reviewed.

## Corrective Review Evidence

- Corrective migration file: `supabase/migrations/20260906163535_corrective_bond_delivery_reminders.sql`
- Corrective migration version: `20260906163535`
- Definition diff reviewed by: `Codex production catalog diff review`
- Corrective migration reviewed by: `Codex idempotent single-source corrective review`
- Approved by: `User-authorized blocked migration resolution`
- Approved at: `2026-09-06T16:37:47.416Z`


## Blockers

- None
