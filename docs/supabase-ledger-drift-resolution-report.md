# Supabase Ledger Drift Resolution

Generated: 2026-07-25T17:19:39.016Z

## Decision

| Field | Value |
| --- | --- |
| Status | `LEDGER_DRIFT_BLOCKED` |
| Resolved | No |
| Pure local-only rows | 25 |
| Pure remote-only rows | 0 |
| Divergent rows | 0 |
| Reviewed split rows | 17 |
| Unresolved split rows | 0 |
| Blockers | 128 |

## Pure Local-Only

| Version | Stream | Resolution | Blockers | Command |
| --- | --- | --- | --- | --- |
| `202607220001` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220001 --plan` |
| `202607220002` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220002 --plan` |
| `202607220003` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220003 --plan` |
| `202607220004` | `legal_document_runtime` | `superseded_by_corrective_promotion_plan` | None | `npm run supabase:push:promote-one -- --version 202607250002 --plan` |
| `202607220005` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220005 --plan` |
| `202607220006` | `legal_document_runtime` | `superseded_by_corrective_promotion_plan` | None | `npm run supabase:push:promote-one -- --version 202607250003 --plan` |
| `202607220007` | `legal_document_runtime` | `superseded_by_corrective_promotion_plan` | None | `npm run supabase:push:promote-one -- --version 202607250004 --plan` |
| `202607220008` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220008 --plan` |
| `202607220009` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220009 --plan` |
| `202607220010` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220010 --plan` |
| `202607220011` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220011 --plan` |
| `202607220012` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220012 --plan` |
| `202607220013` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220013 --plan` |
| `202607220014` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607220014 --plan` |
| `202607230001` | `seller_transaction_continuity` | `superseded_by_corrective_promotion_plan` | None | `npm run supabase:push:promote-one -- --version 202607250005 --plan` |
| `202607230004` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607230004 --plan` |
| `202607230005` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607230005 --plan` |
| `202607230013` | `attorney_workflow_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607230013 --plan` |
| `202607240001` | `workspace_profile_management` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607240001 --plan` |
| `202607240002` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607240002 --plan` |
| `202607250001` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607250001 --plan` |
| `202607250002` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607250002 --plan` |
| `202607250003` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607250003 --plan` |
| `202607250004` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607250004 --plan` |
| `202607250005` | `seller_transaction_continuity` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_ledger_not_recorded`<br>`phase5_catalog_checks_pending`<br>`phase5_behavior_checks_pending`<br>`phase5_rollback_or_no_residue_pending`<br>`phase5_approver_pending`<br>`phase5_production_recovery_not_locked` | `npm run supabase:push:promote-one -- --version 202607250005 --plan` |

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

The reviewed split versions in this report are safe for closeout accounting only. Pure local-only rows still need one-version production promotion, and pure remote-only rows still need local history restoration or explicit remote-only acceptance.
