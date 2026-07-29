# Supabase Phase 8 Closeout Report

Generated: 2026-07-29T19:53:17.153Z
Production project: `isdowlnollckzvltkasn`

## Decision

**Status: CLOSEOUT_BLOCKED**

The Phase 0 broad-push freeze remains active unless this report says `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`. Even a ready report authorizes a reviewed guard-removal change; it does not remove the guard automatically.

## Gate Summary

| Check | Result |
| --- | --- |
| Local migration files | 605 |
| Phase 5 manifest rows | 32 |
| Duplicate versions | 0 |
| Missing manifest files | 0 |
| Complete production evidence rows | 0 |
| Incomplete production evidence rows | 32 |
| Production recovery evidence locked | Yes |
| Production recovery evidence blockers | 0 |
| Unknown evidence rows | 0 |
| Duplicate evidence versions | 0 |
| Ledger drift resolution loaded | Yes |
| Ledger drift resolution status | LEDGER_DRIFT_BLOCKED |
| Ledger drift resolution blockers | 64 |
| Live verification performed | Yes |
| Pure local-only versions | 32 |
| Pure remote-only versions | 0 |
| Divergent versions | 0 |
| Unreviewed split versions | 0 |
| Production PITR | Disabled |
| Physical backups | 8 |
| Ready for reviewed freeze retirement | No |

## Incomplete Evidence Versions

- `202607270013`
- `202607270015`
- `202607280003`
- `202607280004`
- `202607280005`
- `202607280006`
- `202607280007`
- `202607280008`
- `202607280009`
- `202607280010`
- `202607280011`
- `202607280012`
- `202607280013`
- `202607280014`
- `202607280015`
- `202607260008`
- `202607270002`
- `202607270009`
- `202607270010`
- `202607270011`
- `202607290005`
- `202607270014`
- `202607280002`
- `202607280016`
- `202607280017`
- `202607280018`
- `202607280019`
- `202607280020`
- `202607280021`
- `202607280022`
- `202607280023`
- `202607280024`

## Recovery Evidence Blockers

- None

## Evidence By Stream

| Stream | Rows | Complete Evidence | Incomplete Evidence | Actions |
| --- | --- | --- | --- | --- |
| `legal_document_runtime` | 1 | 0 | 1 | `repair_only_after_smoke` |
| `bond_finance_runtime` | 14 | 0 | 14 | `apply_original_after_dependency_check` |
| `other` | 17 | 0 | 17 | `apply_original_after_dependency_check`<br>`repair_only_after_smoke` |

## Closeout Work Queue

| Version | Stream | Evidence | Action | Object Status | File |
| --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `incomplete` | `repair_only_after_smoke` | `n/a` | `202607270013_final_mandate_completion_terminal_state.sql` |
| `202607270015` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607270015_bond_finance_document_metadata_cleanup.sql` |
| `202607280003` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280003_guided_bond_application_phase5_submissions.sql` |
| `202607280004` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280004_guided_bond_application_phase6_participants.sql` |
| `202607280005` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280005_guided_bond_application_phase7_sureties_revisions.sql` |
| `202607280006` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280006_guided_bond_application_phase8_external_exports.sql` |
| `202607280007` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280007_guided_bond_application_phase8a_originator_intake.sql` |
| `202607280008` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280008_guided_bond_application_phase8b_originator_document_requests.sql` |
| `202607280009` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql` |
| `202607280010` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280010_guided_bond_application_phase8d_originator_offers_grants.sql` |
| `202607280011` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql` |
| `202607280012` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280012_guided_bond_application_phase8f_agent_progress_view.sql` |
| `202607280013` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280013_guided_bond_application_phase8g_attorney_handoff.sql` |
| `202607280014` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql` |
| `202607280015` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280015_guided_bond_application_phase8i_governance_reporting.sql` |
| `202607260008` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `202607260008_document_packet_hot_lookup_indexes.sql` |
| `202607270002` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `202607270002_agency_lead_workspace_hot_path_indexes.sql` |
| `202607270009` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `202607270009_client_portal_bootstrap_hot_path_indexes.sql` |
| `202607270010` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `202607270010_seller_document_completion_notification.sql` |
| `202607270011` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607270011_attorney_transaction_key_dates.sql` |
| `202607290005` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607290005_corrective_canonical_matter_lifecycle_stages.sql` |
| `202607270014` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `202607270014_certify_native_structured_legal_pdf.sql` |
| `202607280002` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280002_email_notification_branding_readiness.sql` |
| `202607280016` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280016_originator_rollout_phase_r1_internal_readiness.sql` |
| `202607280017` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280017_originator_rollout_phase_r2_workspace_mvp.sql` |
| `202607280018` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280018_originator_rollout_phase_r3_document_requests.sql` |
| `202607280019` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280019_originator_rollout_phase_r4_progress_tracking.sql` |
| `202607280020` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280020_originator_rollout_phase_r5_offers_grants_capture.sql` |
| `202607280021` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280021_originator_rollout_phase_r6_one_originator_pilot.sql` |
| `202607280022` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280022_originator_rollout_phase_r7_operational_hardening.sql` |
| `202607280023` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql` |
| `202607280024` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql` |

## Closeout Rule

Do not remove `scripts/supabase-phase0-guard.mjs`, its CI enforcement, or the broad-push freeze until all local and live checks pass, all 32 manifest versions have reviewed closeout evidence, and production recovery is available and tested.
