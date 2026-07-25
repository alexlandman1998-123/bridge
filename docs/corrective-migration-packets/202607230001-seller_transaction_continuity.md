# Non-Runnable Migration Clearance Packet

Version: `202607230001`
Stream: `seller_transaction_continuity`
Original file: `202607230001_reconcile_seller_document_transaction_continuity.sql`
Original action: `corrective_migration_required`
Clearance decision: `apply_corrective_after_dependency_check`

## Object State

| Type | Object | Relation | Live State |
| --- | --- | --- | --- |
| `constraint` | `private_listing_documents_promotion_status_check` |  | Missing |
| `function` | `bridge_apply_seller_document_transaction_continuity_p0_6` |  | Missing |
| `function` | `bridge_normalize_seller_document_key_p0_4` |  | Missing |
| `function` | `bridge_promote_listing_documents_from_transaction_p0_6` |  | Missing |
| `function` | `bridge_promote_private_listing_document_row` |  | Live |
| `function` | `bridge_recalculate_transaction_readiness_from_required_documents` |  | Missing |
| `function` | `bridge_satisfy_new_transaction_required_document_p0_6` |  | Missing |
| `function` | `bridge_satisfy_new_transaction_seller_request_p0_6` |  | Missing |
| `function` | `bridge_sync_seller_document_transaction_continuity_p0_6` |  | Missing |
| `function` | `bridge_upload_private_listing_seller_document` |  | Live |
| `index` | `documents_seller_continuity_source_idx` |  | Missing |
| `index` | `private_listing_documents_promotion_health_idx` |  | Missing |
| `trigger` | `trg_promote_listing_documents_from_transaction_p0_6` |  | Missing |
| `trigger` | `trg_satisfy_new_transaction_required_document_p0_6` |  | Missing |
| `trigger` | `trg_satisfy_new_transaction_seller_request_p0_6` |  | Missing |
| `trigger` | `trg_sync_seller_document_transaction_continuity_p0_6` |  | Missing |
| `view` | `seller_document_transaction_continuity_v2` |  | Missing |

## Required Work

- Do not record the historical partially-live version as applied.
- Apply the new timestamped corrective migration only after staging preflight and evidence checks.
- Keep this packet as evidence that the live diff and corrective SQL were reviewed.

## Corrective Review Evidence

- Corrective migration file: `supabase/migrations/202607250005_corrective_seller_document_transaction_continuity.sql`
- Corrective migration version: `202607250005`
- Definition diff reviewed by: `Codex non-runnable clearance`
- Corrective migration reviewed by: `Codex non-runnable clearance`
- Approved by: `Alexander Landman Codex instruction`
- Approved at: `2026-07-25T17:15:00.000Z`


## Blockers

- None
