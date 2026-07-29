# Supabase Push Phase 2 Stream Plans Report

Generated: 2026-07-29T19:36:34.408Z

## Scope

Phase 2 runs every staging stream plan from the current manifest. It is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Manifest rows | 33 |
| Planned rows | 32 |
| Approved corrective substitutions | 1 |
| Streams | 3 |

## Streams

| Stream | Rows | Actions |
| --- | --- | --- |
| `legal_document_runtime` | 1 | `repair_only_after_smoke`: 1 |
| `bond_finance_runtime` | 14 | `apply_original_after_dependency_check`: 14 |
| `other` | 17 | `repair_only_after_smoke`: 5<br>`apply_original_after_dependency_check`: 12 |

## Work Queue

| Version | Stream | Depends On | Action | Object Status | File |
| --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `stream preflight` | `repair_only_after_smoke` | `all_live` | `202607270013_final_mandate_completion_terminal_state.sql` |
| `202607270015` | `bond_finance_runtime` | `stream preflight` | `apply_original_after_dependency_check` | `no_static_objects` | `202607270015_bond_finance_document_metadata_cleanup.sql` |
| `202607280003` | `bond_finance_runtime` | `202607270015` | `apply_original_after_dependency_check` | `none_live` | `202607280003_guided_bond_application_phase5_submissions.sql` |
| `202607280004` | `bond_finance_runtime` | `202607280003` | `apply_original_after_dependency_check` | `none_live` | `202607280004_guided_bond_application_phase6_participants.sql` |
| `202607280005` | `bond_finance_runtime` | `202607280004` | `apply_original_after_dependency_check` | `none_live` | `202607280005_guided_bond_application_phase7_sureties_revisions.sql` |
| `202607280006` | `bond_finance_runtime` | `202607280005` | `apply_original_after_dependency_check` | `none_live` | `202607280006_guided_bond_application_phase8_external_exports.sql` |
| `202607280007` | `bond_finance_runtime` | `202607280006` | `apply_original_after_dependency_check` | `none_live` | `202607280007_guided_bond_application_phase8a_originator_intake.sql` |
| `202607280008` | `bond_finance_runtime` | `202607280007` | `apply_original_after_dependency_check` | `none_live` | `202607280008_guided_bond_application_phase8b_originator_document_requests.sql` |
| `202607280009` | `bond_finance_runtime` | `202607280008` | `apply_original_after_dependency_check` | `none_live` | `202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql` |
| `202607280010` | `bond_finance_runtime` | `202607280009` | `apply_original_after_dependency_check` | `none_live` | `202607280010_guided_bond_application_phase8d_originator_offers_grants.sql` |
| `202607280011` | `bond_finance_runtime` | `202607280010` | `apply_original_after_dependency_check` | `none_live` | `202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql` |
| `202607280012` | `bond_finance_runtime` | `202607280011` | `apply_original_after_dependency_check` | `none_live` | `202607280012_guided_bond_application_phase8f_agent_progress_view.sql` |
| `202607280013` | `bond_finance_runtime` | `202607280012` | `apply_original_after_dependency_check` | `none_live` | `202607280013_guided_bond_application_phase8g_attorney_handoff.sql` |
| `202607280014` | `bond_finance_runtime` | `202607280013` | `apply_original_after_dependency_check` | `none_live` | `202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql` |
| `202607280015` | `bond_finance_runtime` | `202607280014` | `apply_original_after_dependency_check` | `none_live` | `202607280015_guided_bond_application_phase8i_governance_reporting.sql` |
| `202607260008` | `other` | `stream preflight` | `repair_only_after_smoke` | `all_live` | `202607260008_document_packet_hot_lookup_indexes.sql` |
| `202607270002` | `other` | `202607260008` | `repair_only_after_smoke` | `all_live` | `202607270002_agency_lead_workspace_hot_path_indexes.sql` |
| `202607270009` | `other` | `202607270002` | `repair_only_after_smoke` | `all_live` | `202607270009_client_portal_bootstrap_hot_path_indexes.sql` |
| `202607270010` | `other` | `202607270009` | `repair_only_after_smoke` | `all_live` | `202607270010_seller_document_completion_notification.sql` |
| `202607270011` | `other` | `202607270010` | `apply_original_after_dependency_check` | `no_static_objects` | `202607270011_attorney_transaction_key_dates.sql` |
| `202607290005` | `other` | `202607270011` | `apply_original_after_dependency_check` | `partial_live` | `202607290005_corrective_canonical_matter_lifecycle_stages.sql` |
| `202607270014` | `other` | `202607270012` | `repair_only_after_smoke` | `all_live` | `202607270014_certify_native_structured_legal_pdf.sql` |
| `202607280002` | `other` | `202607270014` | `apply_original_after_dependency_check` | `none_live` | `202607280002_email_notification_branding_readiness.sql` |
| `202607280016` | `other` | `202607280002` | `apply_original_after_dependency_check` | `none_live` | `202607280016_originator_rollout_phase_r1_internal_readiness.sql` |
| `202607280017` | `other` | `202607280016` | `apply_original_after_dependency_check` | `none_live` | `202607280017_originator_rollout_phase_r2_workspace_mvp.sql` |
| `202607280018` | `other` | `202607280017` | `apply_original_after_dependency_check` | `none_live` | `202607280018_originator_rollout_phase_r3_document_requests.sql` |
| `202607280019` | `other` | `202607280018` | `apply_original_after_dependency_check` | `none_live` | `202607280019_originator_rollout_phase_r4_progress_tracking.sql` |
| `202607280020` | `other` | `202607280019` | `apply_original_after_dependency_check` | `none_live` | `202607280020_originator_rollout_phase_r5_offers_grants_capture.sql` |
| `202607280021` | `other` | `202607280020` | `apply_original_after_dependency_check` | `none_live` | `202607280021_originator_rollout_phase_r6_one_originator_pilot.sql` |
| `202607280022` | `other` | `202607280021` | `apply_original_after_dependency_check` | `none_live` | `202607280022_originator_rollout_phase_r7_operational_hardening.sql` |
| `202607280023` | `other` | `202607280022` | `apply_original_after_dependency_check` | `none_live` | `202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql` |
| `202607280024` | `other` | `202607280023` | `apply_original_after_dependency_check` | `none_live` | `202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql` |

## Next Step

Use the action on each row to decide the phase 3 work:

- `apply_original_after_dependency_check`: apply that single file to staging after preflight.
- `repair_only_after_smoke`: do not apply SQL; run smoke checks, then record staging ledger.
- `corrective_migration_required`: create an idempotent corrective migration before staging execution.
- `manual_data_review`: verify intended data rows and idempotency before choosing apply or repair.
