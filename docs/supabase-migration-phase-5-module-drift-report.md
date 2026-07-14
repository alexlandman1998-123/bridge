# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-07-14T20:44:44.723Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 358 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 315 |
| Split local/remote versions | 0 |
| Pure local-only rows | 43 |
| Pure remote-only rows | 0 |
| Extracted objects checked | 335 |

## Module Summary

| Module | Pure Local-Only | Split Rows | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| transaction_network | 13 | 0 | 0 | 3 | 10 | 0 | Needs object-level review; do not repair as a batch yet. |
| developer_referral | 8 | 0 | 0 | 1 | 7 | 0 | Needs object-level review; do not repair as a batch yet. |
| notification_automation | 6 | 0 | 0 | 0 | 6 | 0 | Needs object-level review; do not repair as a batch yet. |
| lead_capture_crm | 4 | 0 | 0 | 3 | 1 | 0 | Needs object-level review; do not repair as a batch yet. |
| canonical_documents | 3 | 0 | 0 | 1 | 2 | 0 | Needs object-level review; do not repair as a batch yet. |
| commercial | 3 | 0 | 0 | 2 | 0 | 1 | Needs object-level review; do not repair as a batch yet. |
| other | 3 | 0 | 0 | 1 | 2 | 0 | Needs object-level review; do not repair as a batch yet. |
| bond_finance | 2 | 0 | 0 | 0 | 2 | 0 | Needs object-level review; do not repair as a batch yet. |
| workspace_platform | 1 | 0 | 0 | 0 | 1 | 0 | Needs object-level review; do not repair as a batch yet. |

## Split Ledger Rows

No split local/remote versions detected.

## Reviewed Repair Candidates

No pure local-only migration is ready for repair from static object evidence alone.

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 202607050008 | bond_finance | 202607050008_commission_levels_targets_rules.sql | none_live | 0/26 |
| 202607080001 | bond_finance | 202607080001_commission_targets_period_metric_phase1.sql | none_live | 0/6 |
| 202606210001 | canonical_documents | 202606210001_organisation_legal_template_registry_phase1.sql | partial_live | 2/24 |
| 202606210002 | canonical_documents | 202606210002_legal_template_storage_phase2.sql | none_live | 0/6 |
| 202606210003 | canonical_documents | 202606210003_admin_legal_template_bridge_phase7.sql | none_live | 0/11 |
| 202606160002 | commercial | 202606160002_commercial_landlord_onboarding_workspace.sql | partial_live | 36/37 |
| 202606210004 | commercial | 202606210004_commercial_role_formalisation_phase1.sql | partial_live | 3/5 |
| 202606290016 | developer_referral | 202606290016_developer_partner_relationships_phase1.sql | none_live | 0/26 |
| 202606290017 | developer_referral | 202606290017_developer_partner_invites_phase5.sql | none_live | 0/4 |
| 202606290018 | developer_referral | 202606290018_developer_partner_defaults_phase6.sql | partial_live | 1/6 |
| 202607050002 | developer_referral | 202607050002_referral_mvp_phase1_schema.sql | none_live | 0/8 |
| 202607050003 | developer_referral | 202607050003_referral_mvp_phase3_terms_response_rpc.sql | none_live | 0/1 |
| 202607050004 | developer_referral | 202607050004_referral_mvp_phase6_external_invite_response.sql | none_live | 0/2 |
| 202607050005 | developer_referral | 202607050005_referral_mvp_phase9_activity_signals.sql | none_live | 0/2 |
| 202607080004 | developer_referral | 202607080004_developer_partner_invite_bind_partner_org.sql | none_live | 0/1 |
| 202607140005 | lead_capture_crm | 202607140005_seller_portal_stable_links_and_invites.sql | partial_live | 6/10 |
| 202607140006 | lead_capture_crm | 202607140006_seller_portal_security_controls.sql | partial_live | 3/4 |
| 202607140007 | lead_capture_crm | 202607140007_seller_portal_operational_monitoring.sql | partial_live | 1/6 |
| 202607140008 | lead_capture_crm | 202607140008_seller_portal_password_recovery.sql | none_live | 0/5 |
| 202607050009 | notification_automation | 202607050009_notification_automation_foundation.sql | none_live | 0/18 |
| 202607050010 | notification_automation | 202607050010_notification_automation_phase2_acceptance_events.sql | none_live | 0/12 |
| 202607060001 | notification_automation | 202607060001_notification_automation_phase3_reminder_queue.sql | none_live | 0/7 |
| 202607060002 | notification_automation | 202607060002_notification_automation_phase4_reminder_dispatch.sql | none_live | 0/5 |
| 202607060003 | notification_automation | 202607060003_notification_automation_phase5_observability.sql | none_live | 0/1 |
| 202607060004 | notification_automation | 202607060004_notification_automation_phase6_premium_controls.sql | none_live | 0/2 |
| 202607140004 | other | 202607140004_client_portal_phase1_access_stability.sql | partial_live | 6/11 |
| 202607140016 | other | 202607140016_sa_legal_instrument_family_governance.sql | none_live | 0/9 |
| 202607140017 | other | 202607140017_sa_legal_deal_facts_phase2.sql | none_live | 0/4 |
| 202606260002 | transaction_network | 202606260002_transaction_partner_invite_resend_phase3.sql | partial_live | 1/2 |
| 202606260003 | transaction_network | 202606260003_transaction_partner_invite_audit_phase5.sql | none_live | 0/1 |
| 202606260004 | transaction_network | 202606260004_transaction_partner_invite_expiry_phase6.sql | none_live | 0/1 |
| 202606290015 | transaction_network | 202606290015_transaction_comments_shared_activity_metadata.sql | none_live | 0/5 |
| 202606300003 | transaction_network | 202606300003_transaction_participant_role_normalization_phase2.sql | partial_live | 6/7 |
| 202606300004 | transaction_network | 202606300004_canonical_transaction_partner_invites_phase3.sql | none_live | 0/2 |
| 202606300006 | transaction_network | 202606300006_client_invite_acceptance_sync_phase5.sql | none_live | 0/4 |
| 202606300007 | transaction_network | 202606300007_canonical_invite_operations_phase6.sql | none_live | 0/2 |
| 202606300008 | transaction_network | 202606300008_canonical_invite_control_phase7.sql | none_live | 0/3 |
| 202607010002 | transaction_network | 202607010002_partner_portal_assignment_persistence.sql | none_live | 0/33 |
| 202607050007 | transaction_network | 202607050007_partner_invitation_sender_management.sql | none_live | 0/1 |
| 202607080002 | transaction_network | 202607080002_partner_invitation_delete_rpc.sql | partial_live | 3/4 |
| 202607080006 | transaction_network | 202607080006_invite_acceptance_reconciliation_phase5.sql | none_live | 0/2 |
| 202606220002 | workspace_platform | 202606220002_admin_mobile_dashboard_events.sql | none_live | 0/9 |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202607050008 | pure_local_only | bond_finance | 202607050008_commission_levels_targets_rules.sql | none_live | 0/26 |
| 202607080001 | pure_local_only | bond_finance | 202607080001_commission_targets_period_metric_phase1.sql | none_live | 0/6 |
| 202606210001 | pure_local_only | canonical_documents | 202606210001_organisation_legal_template_registry_phase1.sql | partial_live | 2/24 |
| 202606210002 | pure_local_only | canonical_documents | 202606210002_legal_template_storage_phase2.sql | none_live | 0/6 |
| 202606210003 | pure_local_only | canonical_documents | 202606210003_admin_legal_template_bridge_phase7.sql | none_live | 0/11 |
| 202606160002 | pure_local_only | commercial | 202606160002_commercial_landlord_onboarding_workspace.sql | partial_live | 36/37 |
| 202606210004 | pure_local_only | commercial | 202606210004_commercial_role_formalisation_phase1.sql | partial_live | 3/5 |
| 202606290010 | pure_local_only | commercial | 202606290010_commercial_landlord_workspace_schema_cache.sql | no_static_objects | n/a |
| 202606290016 | pure_local_only | developer_referral | 202606290016_developer_partner_relationships_phase1.sql | none_live | 0/26 |
| 202606290017 | pure_local_only | developer_referral | 202606290017_developer_partner_invites_phase5.sql | none_live | 0/4 |
| 202606290018 | pure_local_only | developer_referral | 202606290018_developer_partner_defaults_phase6.sql | partial_live | 1/6 |
| 202607050002 | pure_local_only | developer_referral | 202607050002_referral_mvp_phase1_schema.sql | none_live | 0/8 |
| 202607050003 | pure_local_only | developer_referral | 202607050003_referral_mvp_phase3_terms_response_rpc.sql | none_live | 0/1 |
| 202607050004 | pure_local_only | developer_referral | 202607050004_referral_mvp_phase6_external_invite_response.sql | none_live | 0/2 |
| 202607050005 | pure_local_only | developer_referral | 202607050005_referral_mvp_phase9_activity_signals.sql | none_live | 0/2 |
| 202607080004 | pure_local_only | developer_referral | 202607080004_developer_partner_invite_bind_partner_org.sql | none_live | 0/1 |
| 202607140005 | pure_local_only | lead_capture_crm | 202607140005_seller_portal_stable_links_and_invites.sql | partial_live | 6/10 |
| 202607140006 | pure_local_only | lead_capture_crm | 202607140006_seller_portal_security_controls.sql | partial_live | 3/4 |
| 202607140007 | pure_local_only | lead_capture_crm | 202607140007_seller_portal_operational_monitoring.sql | partial_live | 1/6 |
| 202607140008 | pure_local_only | lead_capture_crm | 202607140008_seller_portal_password_recovery.sql | none_live | 0/5 |
| 202607050009 | pure_local_only | notification_automation | 202607050009_notification_automation_foundation.sql | none_live | 0/18 |
| 202607050010 | pure_local_only | notification_automation | 202607050010_notification_automation_phase2_acceptance_events.sql | none_live | 0/12 |
| 202607060001 | pure_local_only | notification_automation | 202607060001_notification_automation_phase3_reminder_queue.sql | none_live | 0/7 |
| 202607060002 | pure_local_only | notification_automation | 202607060002_notification_automation_phase4_reminder_dispatch.sql | none_live | 0/5 |
| 202607060003 | pure_local_only | notification_automation | 202607060003_notification_automation_phase5_observability.sql | none_live | 0/1 |
| 202607060004 | pure_local_only | notification_automation | 202607060004_notification_automation_phase6_premium_controls.sql | none_live | 0/2 |
| 202607140004 | pure_local_only | other | 202607140004_client_portal_phase1_access_stability.sql | partial_live | 6/11 |
| 202607140016 | pure_local_only | other | 202607140016_sa_legal_instrument_family_governance.sql | none_live | 0/9 |
| 202607140017 | pure_local_only | other | 202607140017_sa_legal_deal_facts_phase2.sql | none_live | 0/4 |
| 202606260002 | pure_local_only | transaction_network | 202606260002_transaction_partner_invite_resend_phase3.sql | partial_live | 1/2 |
| 202606260003 | pure_local_only | transaction_network | 202606260003_transaction_partner_invite_audit_phase5.sql | none_live | 0/1 |
| 202606260004 | pure_local_only | transaction_network | 202606260004_transaction_partner_invite_expiry_phase6.sql | none_live | 0/1 |
| 202606290015 | pure_local_only | transaction_network | 202606290015_transaction_comments_shared_activity_metadata.sql | none_live | 0/5 |
| 202606300003 | pure_local_only | transaction_network | 202606300003_transaction_participant_role_normalization_phase2.sql | partial_live | 6/7 |
| 202606300004 | pure_local_only | transaction_network | 202606300004_canonical_transaction_partner_invites_phase3.sql | none_live | 0/2 |
| 202606300006 | pure_local_only | transaction_network | 202606300006_client_invite_acceptance_sync_phase5.sql | none_live | 0/4 |
| 202606300007 | pure_local_only | transaction_network | 202606300007_canonical_invite_operations_phase6.sql | none_live | 0/2 |
| 202606300008 | pure_local_only | transaction_network | 202606300008_canonical_invite_control_phase7.sql | none_live | 0/3 |
| 202607010002 | pure_local_only | transaction_network | 202607010002_partner_portal_assignment_persistence.sql | none_live | 0/33 |
| 202607050007 | pure_local_only | transaction_network | 202607050007_partner_invitation_sender_management.sql | none_live | 0/1 |
| 202607080002 | pure_local_only | transaction_network | 202607080002_partner_invitation_delete_rpc.sql | partial_live | 3/4 |
| 202607080006 | pure_local_only | transaction_network | 202607080006_invite_acceptance_reconciliation_phase5.sql | none_live | 0/2 |
| 202606220002 | pure_local_only | workspace_platform | 202606220002_admin_mobile_dashboard_events.sql | none_live | 0/9 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 335 |
| Catalog rows returned | 335 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-57170.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Split ledger rows should be investigated before broad migration operations; pure local-only rows need module smoke evidence before any further `migration repair`.

