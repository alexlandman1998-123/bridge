# Supabase Push Phase 3 Action Routing Report

Generated: 2026-08-01T20:40:08.643Z

## Scope

Phase 3 handles rows by action. It converts the phase 2 stream plans into explicit execution routes. This phase is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows | 36 |
| Runner-eligible rows | 36 |
| Blocked rows | 0 |
| SQL-allowed rows | 30 |
| Ledger-allowed rows | 36 |

## Actions

| Action | Rows |
| --- | --- |
| `apply_original_after_dependency_check` | 30 |
| `repair_only_after_smoke` | 6 |

## Routes

| Route | Rows |
| --- | --- |
| `apply_original` | 30 |
| `repair_only` | 6 |

## Work Queue

| Version | Stream | Action | Route | Blocked | SQL Allowed | Ledger Allowed | File |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607270013_final_mandate_completion_terminal_state.sql` |
| `202607270015` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607270015_bond_finance_document_metadata_cleanup.sql` |
| `202607280003` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280003_guided_bond_application_phase5_submissions.sql` |
| `202607280004` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280004_guided_bond_application_phase6_participants.sql` |
| `202607280005` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280005_guided_bond_application_phase7_sureties_revisions.sql` |
| `202607280006` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280006_guided_bond_application_phase8_external_exports.sql` |
| `202607280007` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280007_guided_bond_application_phase8a_originator_intake.sql` |
| `202607280008` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280008_guided_bond_application_phase8b_originator_document_requests.sql` |
| `202607280009` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql` |
| `202607280010` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280010_guided_bond_application_phase8d_originator_offers_grants.sql` |
| `202607280011` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql` |
| `202607280012` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280012_guided_bond_application_phase8f_agent_progress_view.sql` |
| `202607280013` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280013_guided_bond_application_phase8g_attorney_handoff.sql` |
| `202607280014` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql` |
| `202607280015` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280015_guided_bond_application_phase8i_governance_reporting.sql` |
| `202607260008` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607260008_document_packet_hot_lookup_indexes.sql` |
| `202607270002` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607270002_agency_lead_workspace_hot_path_indexes.sql` |
| `202607270009` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607270009_client_portal_bootstrap_hot_path_indexes.sql` |
| `202607270010` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607270010_seller_document_completion_notification.sql` |
| `202607270011` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607270011_attorney_transaction_key_dates.sql` |
| `202607290005` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607290005_corrective_canonical_matter_lifecycle_stages.sql` |
| `202607270014` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607270014_certify_native_structured_legal_pdf.sql` |
| `202607280002` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280002_email_notification_branding_readiness.sql` |
| `202607280016` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280016_originator_rollout_phase_r1_internal_readiness.sql` |
| `202607280017` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280017_originator_rollout_phase_r2_workspace_mvp.sql` |
| `202607280018` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280018_originator_rollout_phase_r3_document_requests.sql` |
| `202607280019` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280019_originator_rollout_phase_r4_progress_tracking.sql` |
| `202607280020` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280020_originator_rollout_phase_r5_offers_grants_capture.sql` |
| `202607280021` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280021_originator_rollout_phase_r6_one_originator_pilot.sql` |
| `202607280022` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280022_originator_rollout_phase_r7_operational_hardening.sql` |
| `202607280023` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql` |
| `202607280024` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql` |
| `202607310006` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607310006_legal_document_agent_notification_sequence.sql` |
| `202608010001` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202608010001_seller_onboarding_progress_fast_return.sql` |
| `202608010002` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202608010002_fix_legal_document_agent_context_lead_lookup.sql` |
| `202608010003` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202608010003_legal_document_job_stage_timings_phase7.sql` |

## Commands

| Version | Command |
| --- | --- |
| `202607270013` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607270013 --evidence docs/staging-evidence/202607270013-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607270015` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607270015 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607270015 --evidence docs/staging-evidence/202607270015-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280003` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280003 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280003 --evidence docs/staging-evidence/202607280003-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280004` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280004 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280004 --evidence docs/staging-evidence/202607280004-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280005` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280005 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280005 --evidence docs/staging-evidence/202607280005-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280006` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280006 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280006 --evidence docs/staging-evidence/202607280006-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280007` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280007 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280007 --evidence docs/staging-evidence/202607280007-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280008` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280008 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280008 --evidence docs/staging-evidence/202607280008-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280009` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280009 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280009 --evidence docs/staging-evidence/202607280009-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280010` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280010 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280010 --evidence docs/staging-evidence/202607280010-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280011` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280011 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280011 --evidence docs/staging-evidence/202607280011-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280012` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280012 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280012 --evidence docs/staging-evidence/202607280012-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280013` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280013 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280013 --evidence docs/staging-evidence/202607280013-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280014` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280014 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280014 --evidence docs/staging-evidence/202607280014-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280015` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280015 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280015 --evidence docs/staging-evidence/202607280015-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607260008` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607260008 --evidence docs/staging-evidence/202607260008-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607270002` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607270002 --evidence docs/staging-evidence/202607270002-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607270009` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607270009 --evidence docs/staging-evidence/202607270009-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607270010` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607270010 --evidence docs/staging-evidence/202607270010-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607270011` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607270011 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607270011 --evidence docs/staging-evidence/202607270011-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607290005` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607290005 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607290005 --evidence docs/staging-evidence/202607290005-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607270014` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607270014 --evidence docs/staging-evidence/202607270014-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280002` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280002 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280002 --evidence docs/staging-evidence/202607280002-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280016` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280016 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280016 --evidence docs/staging-evidence/202607280016-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280017` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280017 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280017 --evidence docs/staging-evidence/202607280017-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280018` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280018 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280018 --evidence docs/staging-evidence/202607280018-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280019` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280019 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280019 --evidence docs/staging-evidence/202607280019-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280020` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280020 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280020 --evidence docs/staging-evidence/202607280020-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280021` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280021 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280021 --evidence docs/staging-evidence/202607280021-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280022` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280022 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280022 --evidence docs/staging-evidence/202607280022-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280023` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280023 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280023 --evidence docs/staging-evidence/202607280023-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607280024` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607280024 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607280024 --evidence docs/staging-evidence/202607280024-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607310006` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607310006 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607310006 --evidence docs/staging-evidence/202607310006-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202608010001` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010001 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010001 --evidence docs/staging-evidence/202608010001-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202608010002` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010002 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010002 --evidence docs/staging-evidence/202608010002-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202608010003` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010003 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010003 --evidence docs/staging-evidence/202608010003-other.json --confirm APPLY_TO_STAGING_ONLY` |

## Next Step

Phase 4 should prepare or collect reviewed staging evidence for the runner-eligible rows. Blocked rows need corrective migrations or manual data review before they can enter the runner path.
