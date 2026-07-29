# Supabase Push Phase 1 Staging Prep Report

Generated: 2026-07-29T19:36:03.366Z

## Scope

Phase 1 prepares the staging evidence package for the migration push path. It does not apply SQL, repair any ledger, relink the Supabase project, or modify production.

## Outputs

- `docs/supabase-push-phase-1-staging-evidence-templates.json`
- `docs/supabase-push-phase-1-staging-prep-report.md`

## Manifest Summary

| Field | Value |
| --- | --- |
| Manifest rows | 33 |
| Runner-eligible rows | 30 |
| Blocked rows requiring corrective/manual work | 3 |

## Streams

| Stream | Rows |
| --- | --- |
| `bond_finance_runtime` | 14 |
| `legal_document_runtime` | 1 |
| `other` | 18 |

## Actions

| Action | Rows |
| --- | --- |
| `apply_original_after_dependency_check` | 24 |
| `corrective_migration_required` | 1 |
| `manual_data_review` | 2 |
| `repair_only_after_smoke` | 6 |

## Runner Eligibility

| Eligibility | Rows |
| --- | --- |
| `blocked_create_corrective_migration` | 1 |
| `blocked_manual_data_review` | 2 |
| `staging_apply_then_record` | 24 |
| `staging_record_only_after_smoke` | 6 |

## Work Queue

| Version | Stream | Action | Object Status | Eligibility | File |
| --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607270013_final_mandate_completion_terminal_state.sql` |
| `202607270015` | `bond_finance_runtime` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `202607270015_bond_finance_document_metadata_cleanup.sql` |
| `202607280003` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280003_guided_bond_application_phase5_submissions.sql` |
| `202607280004` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280004_guided_bond_application_phase6_participants.sql` |
| `202607280005` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280005_guided_bond_application_phase7_sureties_revisions.sql` |
| `202607280006` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280006_guided_bond_application_phase8_external_exports.sql` |
| `202607280007` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280007_guided_bond_application_phase8a_originator_intake.sql` |
| `202607280008` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280008_guided_bond_application_phase8b_originator_document_requests.sql` |
| `202607280009` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql` |
| `202607280010` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280010_guided_bond_application_phase8d_originator_offers_grants.sql` |
| `202607280011` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql` |
| `202607280012` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280012_guided_bond_application_phase8f_agent_progress_view.sql` |
| `202607280013` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280013_guided_bond_application_phase8g_attorney_handoff.sql` |
| `202607280014` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql` |
| `202607280015` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280015_guided_bond_application_phase8i_governance_reporting.sql` |
| `202607260008` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607260008_document_packet_hot_lookup_indexes.sql` |
| `202607270002` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607270002_agency_lead_workspace_hot_path_indexes.sql` |
| `202607270009` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607270009_client_portal_bootstrap_hot_path_indexes.sql` |
| `202607270010` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607270010_seller_document_completion_notification.sql` |
| `202607270011` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `202607270011_attorney_transaction_key_dates.sql` |
| `202607270012` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `202607270012_canonical_matter_lifecycle_stages.sql` |
| `202607270014` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607270014_certify_native_structured_legal_pdf.sql` |
| `202607280002` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280002_email_notification_branding_readiness.sql` |
| `202607280016` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280016_originator_rollout_phase_r1_internal_readiness.sql` |
| `202607280017` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280017_originator_rollout_phase_r2_workspace_mvp.sql` |
| `202607280018` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280018_originator_rollout_phase_r3_document_requests.sql` |
| `202607280019` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280019_originator_rollout_phase_r4_progress_tracking.sql` |
| `202607280020` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280020_originator_rollout_phase_r5_offers_grants_capture.sql` |
| `202607280021` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280021_originator_rollout_phase_r6_one_originator_pilot.sql` |
| `202607280022` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280022_originator_rollout_phase_r7_operational_hardening.sql` |
| `202607280023` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql` |
| `202607280024` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql` |
| `202607290005` | `other` | `apply_original_after_dependency_check` | `partial_live` | `staging_apply_then_record` | `202607290005_corrective_canonical_matter_lifecycle_stages.sql` |

## Required Environment Before Applying

```bash
export SUPABASE_STAGING_PROJECT_REF='<staging-project-ref>'
export SUPABASE_STAGING_DB_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
export SUPABASE_STAGING_RECOVERY_CONFIRMED='I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
```

Use `scripts/supabase-phase6-staging-execution.mjs` for staging. Do not use broad `supabase db push`.
