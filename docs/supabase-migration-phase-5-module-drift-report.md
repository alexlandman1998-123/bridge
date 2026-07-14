# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-07-14T18:14:11.599Z
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
| Matched rows | 273 |
| Split local/remote versions | 0 |
| Pure local-only rows | 85 |
| Pure remote-only rows | 0 |
| Extracted objects checked | 451 |

## Module Summary

| Module | Pure Local-Only | Split Rows | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| transaction_network | 17 | 0 | 4 | 3 | 10 | 0 | Needs object-level review; do not repair as a batch yet. |
| developer_referral | 11 | 0 | 2 | 1 | 7 | 1 | Needs object-level review; do not repair as a batch yet. |
| lead_capture_crm | 11 | 0 | 7 | 3 | 1 | 0 | Needs object-level review; do not repair as a batch yet. |
| workspace_platform | 11 | 0 | 5 | 0 | 2 | 4 | Needs object-level review; do not repair as a batch yet. |
| commercial | 10 | 0 | 5 | 2 | 0 | 3 | Needs object-level review; do not repair as a batch yet. |
| other | 9 | 0 | 6 | 1 | 2 | 0 | Needs object-level review; do not repair as a batch yet. |
| notification_automation | 7 | 0 | 1 | 0 | 6 | 0 | Needs object-level review; do not repair as a batch yet. |
| canonical_documents | 5 | 0 | 0 | 1 | 4 | 0 | Needs object-level review; do not repair as a batch yet. |
| bond_finance | 3 | 0 | 0 | 1 | 2 | 0 | Needs object-level review; do not repair as a batch yet. |
| attorney | 1 | 0 | 0 | 0 | 1 | 0 | Needs object-level review; do not repair as a batch yet. |

## Split Ledger Rows

No split local/remote versions detected.

## Reviewed Repair Candidates

These pure local-only migrations have all statically extracted objects present in the live catalog. They are candidates for later reviewed ledger repair only after module smoke evidence:

| Version | Module | File | Objects Live |
| --- | --- | --- | --- |
| 202606170004 | commercial | 202606170004_commercial_invite_membership_marker.sql | 3/3 |
| 202606290006 | commercial | 202606290006_commercial_landlord_unassigned_visibility.sql | 1/1 |
| 202606290019 | commercial | 202606290019_transaction_reservation_commercial_terms.sql | 4/4 |
| 202606300001 | commercial | 202606300001_commercial_import_canvassing_sales_prospects.sql | 1/1 |
| 202607090007 | commercial | 202607090007_private_listing_mandate_status_alignment.sql | 1/1 |
| 202606240002 | developer_referral | 202606240002_arch9_launch_referral_clicks.sql | 3/3 |
| 202607050006 | developer_referral | 202607050006_preferred_partner_cancellation_attorney.sql | 1/1 |
| 202606170001 | lead_capture_crm | 202606170001_private_listing_document_member_access.sql | 1/1 |
| 202606200002 | lead_capture_crm | 202606200002_lead_structured_location_phase2.sql | 2/2 |
| 202607010003 | lead_capture_crm | 202607010003_lead_enquiry_property_fields.sql | 2/2 |
| 202607010004 | lead_capture_crm | 202607010004_single_lead_capture_alias.sql | 1/1 |
| 202607090006 | lead_capture_crm | 202607090006_private_listing_external_isolation.sql | 4/4 |
| 202607130001 | lead_capture_crm | 202607130001_private_listing_insert_policy_active_member.sql | 1/1 |
| 202607130005 | lead_capture_crm | 202607130005_private_listing_inline_select_policy.sql | 2/2 |
| 202607130003 | notification_automation | 202607130003_membership_helper_email_claim_alignment.sql | 2/2 |
| 202606200001 | other | 202606200001_google_places_location_foundation.sql | 11/11 |
| 202606200003 | other | 202606200003_area_directory_backfill_phase5.sql | 1/1 |
| 202606200004 | other | 202606200004_area_aliases_phase6.sql | 12/12 |
| 202607090001 | other | 202607090001_agency_tasks_foundation.sql | 11/11 |
| 202607130002 | other | 202607130002_membership_helper_status_alignment.sql | 2/2 |
| 202607130004 | other | 202607130004_membership_helper_accepted_status.sql | 2/2 |
| 202606260001 | transaction_network | 202606260001_transaction_partner_invite_acceptance_phase2.sql | 2/2 |
| 202606300002 | transaction_network | 202606300002_transaction_partner_legal_invites_phase1.sql | 4/4 |
| 202607080003 | transaction_network | 202607080003_partner_invitation_member_manage_rpc.sql | 4/4 |
| 202607080005 | transaction_network | 202607080005_transaction_partner_invite_partner_org_binding.sql | 1/1 |
| 202606150001 | workspace_platform | 202606150001_arch9_hq_founder_system_role.sql | 2/2 |
| 202606190002 | workspace_platform | 202606190002_admin_invited_users_summary.sql | 1/1 |
| 202606230001 | workspace_platform | 202606230001_arch9_launch_event_leads.sql | 5/5 |
| 202606240001 | workspace_platform | 202606240001_arch9_launch_follow_up_fields.sql | 1/1 |
| 202606280003 | workspace_platform | 202606280003_demo_enquiries.sql | 10/10 |

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 202607080008 | attorney | 202607080008_attorney_firm_branding_storage_rls.sql | none_live | 0/4 |
| 202607050001 | bond_finance | 202607050001_bond_grant_workflow_milestones.sql | partial_live | 4/6 |
| 202607050008 | bond_finance | 202607050008_commission_levels_targets_rules.sql | none_live | 0/26 |
| 202607080001 | bond_finance | 202607080001_commission_targets_period_metric_phase1.sql | none_live | 0/6 |
| 202606210001 | canonical_documents | 202606210001_organisation_legal_template_registry_phase1.sql | partial_live | 2/24 |
| 202606210002 | canonical_documents | 202606210002_legal_template_storage_phase2.sql | none_live | 0/6 |
| 202606210003 | canonical_documents | 202606210003_admin_legal_template_bridge_phase7.sql | none_live | 0/11 |
| 202606300005 | canonical_documents | 202606300005_canonical_client_onboarding_invites_phase4.sql | none_live | 0/2 |
| 202607140003 | canonical_documents | 202607140003_legal_document_signer_roles.sql | none_live | 0/2 |
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
| 202606190003 | workspace_platform | 202606190003_organisation_branding_storage.sql | none_live | 0/4 |
| 202606220002 | workspace_platform | 202606220002_admin_mobile_dashboard_events.sql | none_live | 0/9 |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202607080008 | pure_local_only | attorney | 202607080008_attorney_firm_branding_storage_rls.sql | none_live | 0/4 |
| 202607050001 | pure_local_only | bond_finance | 202607050001_bond_grant_workflow_milestones.sql | partial_live | 4/6 |
| 202607050008 | pure_local_only | bond_finance | 202607050008_commission_levels_targets_rules.sql | none_live | 0/26 |
| 202607080001 | pure_local_only | bond_finance | 202607080001_commission_targets_period_metric_phase1.sql | none_live | 0/6 |
| 202606210001 | pure_local_only | canonical_documents | 202606210001_organisation_legal_template_registry_phase1.sql | partial_live | 2/24 |
| 202606210002 | pure_local_only | canonical_documents | 202606210002_legal_template_storage_phase2.sql | none_live | 0/6 |
| 202606210003 | pure_local_only | canonical_documents | 202606210003_admin_legal_template_bridge_phase7.sql | none_live | 0/11 |
| 202606300005 | pure_local_only | canonical_documents | 202606300005_canonical_client_onboarding_invites_phase4.sql | none_live | 0/2 |
| 202607140003 | pure_local_only | canonical_documents | 202607140003_legal_document_signer_roles.sql | none_live | 0/2 |
| 202606160001 | pure_local_only | commercial | 202606160001_backfill_signed_mandate_private_listings.sql | no_static_objects | n/a |
| 202606160002 | pure_local_only | commercial | 202606160002_commercial_landlord_onboarding_workspace.sql | partial_live | 36/37 |
| 202606170004 | pure_local_only | commercial | 202606170004_commercial_invite_membership_marker.sql | all_live | 3/3 |
| 202606210004 | pure_local_only | commercial | 202606210004_commercial_role_formalisation_phase1.sql | partial_live | 3/5 |
| 202606290006 | pure_local_only | commercial | 202606290006_commercial_landlord_unassigned_visibility.sql | all_live | 1/1 |
| 202606290010 | pure_local_only | commercial | 202606290010_commercial_landlord_workspace_schema_cache.sql | no_static_objects | n/a |
| 202606290019 | pure_local_only | commercial | 202606290019_transaction_reservation_commercial_terms.sql | all_live | 4/4 |
| 202606300001 | pure_local_only | commercial | 202606300001_commercial_import_canvassing_sales_prospects.sql | all_live | 1/1 |
| 202607010001 | pure_local_only | commercial | 202607010001_replace_mandate_agency_name_placeholder.sql | no_static_objects | n/a |
| 202607090007 | pure_local_only | commercial | 202607090007_private_listing_mandate_status_alignment.sql | all_live | 1/1 |
| 202606240002 | pure_local_only | developer_referral | 202606240002_arch9_launch_referral_clicks.sql | all_live | 3/3 |
| 202606290014 | pure_local_only | developer_referral | 202606290014_development_seller_details_phase1.sql | no_static_objects | n/a |
| 202606290016 | pure_local_only | developer_referral | 202606290016_developer_partner_relationships_phase1.sql | none_live | 0/26 |
| 202606290017 | pure_local_only | developer_referral | 202606290017_developer_partner_invites_phase5.sql | none_live | 0/4 |
| 202606290018 | pure_local_only | developer_referral | 202606290018_developer_partner_defaults_phase6.sql | partial_live | 1/6 |
| 202607050002 | pure_local_only | developer_referral | 202607050002_referral_mvp_phase1_schema.sql | none_live | 0/8 |
| 202607050003 | pure_local_only | developer_referral | 202607050003_referral_mvp_phase3_terms_response_rpc.sql | none_live | 0/1 |
| 202607050004 | pure_local_only | developer_referral | 202607050004_referral_mvp_phase6_external_invite_response.sql | none_live | 0/2 |
| 202607050005 | pure_local_only | developer_referral | 202607050005_referral_mvp_phase9_activity_signals.sql | none_live | 0/2 |
| 202607050006 | pure_local_only | developer_referral | 202607050006_preferred_partner_cancellation_attorney.sql | all_live | 1/1 |
| 202607080004 | pure_local_only | developer_referral | 202607080004_developer_partner_invite_bind_partner_org.sql | none_live | 0/1 |
| 202606170001 | pure_local_only | lead_capture_crm | 202606170001_private_listing_document_member_access.sql | all_live | 1/1 |
| 202606200002 | pure_local_only | lead_capture_crm | 202606200002_lead_structured_location_phase2.sql | all_live | 2/2 |
| 202607010003 | pure_local_only | lead_capture_crm | 202607010003_lead_enquiry_property_fields.sql | all_live | 2/2 |
| 202607010004 | pure_local_only | lead_capture_crm | 202607010004_single_lead_capture_alias.sql | all_live | 1/1 |
| 202607090006 | pure_local_only | lead_capture_crm | 202607090006_private_listing_external_isolation.sql | all_live | 4/4 |
| 202607130001 | pure_local_only | lead_capture_crm | 202607130001_private_listing_insert_policy_active_member.sql | all_live | 1/1 |
| 202607130005 | pure_local_only | lead_capture_crm | 202607130005_private_listing_inline_select_policy.sql | all_live | 2/2 |
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
| 202607130003 | pure_local_only | notification_automation | 202607130003_membership_helper_email_claim_alignment.sql | all_live | 2/2 |
| 202606200001 | pure_local_only | other | 202606200001_google_places_location_foundation.sql | all_live | 11/11 |
| 202606200003 | pure_local_only | other | 202606200003_area_directory_backfill_phase5.sql | all_live | 1/1 |
| 202606200004 | pure_local_only | other | 202606200004_area_aliases_phase6.sql | all_live | 12/12 |
| 202607090001 | pure_local_only | other | 202607090001_agency_tasks_foundation.sql | all_live | 11/11 |
| 202607130002 | pure_local_only | other | 202607130002_membership_helper_status_alignment.sql | all_live | 2/2 |
| 202607130004 | pure_local_only | other | 202607130004_membership_helper_accepted_status.sql | all_live | 2/2 |
| 202607140004 | pure_local_only | other | 202607140004_client_portal_phase1_access_stability.sql | partial_live | 6/11 |
| 202607140016 | pure_local_only | other | 202607140016_sa_legal_instrument_family_governance.sql | none_live | 0/9 |
| 202607140017 | pure_local_only | other | 202607140017_sa_legal_deal_facts_phase2.sql | none_live | 0/4 |
| 202606260001 | pure_local_only | transaction_network | 202606260001_transaction_partner_invite_acceptance_phase2.sql | all_live | 2/2 |
| 202606260002 | pure_local_only | transaction_network | 202606260002_transaction_partner_invite_resend_phase3.sql | partial_live | 1/2 |
| 202606260003 | pure_local_only | transaction_network | 202606260003_transaction_partner_invite_audit_phase5.sql | none_live | 0/1 |
| 202606260004 | pure_local_only | transaction_network | 202606260004_transaction_partner_invite_expiry_phase6.sql | none_live | 0/1 |
| 202606290015 | pure_local_only | transaction_network | 202606290015_transaction_comments_shared_activity_metadata.sql | none_live | 0/5 |
| 202606300002 | pure_local_only | transaction_network | 202606300002_transaction_partner_legal_invites_phase1.sql | all_live | 4/4 |
| 202606300003 | pure_local_only | transaction_network | 202606300003_transaction_participant_role_normalization_phase2.sql | partial_live | 6/7 |
| 202606300004 | pure_local_only | transaction_network | 202606300004_canonical_transaction_partner_invites_phase3.sql | none_live | 0/2 |
| 202606300006 | pure_local_only | transaction_network | 202606300006_client_invite_acceptance_sync_phase5.sql | none_live | 0/4 |
| 202606300007 | pure_local_only | transaction_network | 202606300007_canonical_invite_operations_phase6.sql | none_live | 0/2 |
| 202606300008 | pure_local_only | transaction_network | 202606300008_canonical_invite_control_phase7.sql | none_live | 0/3 |
| 202607010002 | pure_local_only | transaction_network | 202607010002_partner_portal_assignment_persistence.sql | none_live | 0/33 |
| 202607050007 | pure_local_only | transaction_network | 202607050007_partner_invitation_sender_management.sql | none_live | 0/1 |
| 202607080002 | pure_local_only | transaction_network | 202607080002_partner_invitation_delete_rpc.sql | partial_live | 3/4 |
| 202607080003 | pure_local_only | transaction_network | 202607080003_partner_invitation_member_manage_rpc.sql | all_live | 4/4 |
| 202607080005 | pure_local_only | transaction_network | 202607080005_transaction_partner_invite_partner_org_binding.sql | all_live | 1/1 |
| 202607080006 | pure_local_only | transaction_network | 202607080006_invite_acceptance_reconciliation_phase5.sql | none_live | 0/2 |
| 202606150001 | pure_local_only | workspace_platform | 202606150001_arch9_hq_founder_system_role.sql | all_live | 2/2 |
| 202606190002 | pure_local_only | workspace_platform | 202606190002_admin_invited_users_summary.sql | all_live | 1/1 |
| 202606190003 | pure_local_only | workspace_platform | 202606190003_organisation_branding_storage.sql | none_live | 0/4 |
| 202606190004 | pure_local_only | workspace_platform | 202606190004_remove_branch_entitlement_gateway.sql | no_static_objects | n/a |
| 202606220002 | pure_local_only | workspace_platform | 202606220002_admin_mobile_dashboard_events.sql | none_live | 0/9 |
| 202606230001 | pure_local_only | workspace_platform | 202606230001_arch9_launch_event_leads.sql | all_live | 5/5 |
| 202606240001 | pure_local_only | workspace_platform | 202606240001_arch9_launch_follow_up_fields.sql | all_live | 1/1 |
| 202606280003 | pure_local_only | workspace_platform | 202606280003_demo_enquiries.sql | all_live | 10/10 |
| 202607020001 | pure_local_only | workspace_platform | 202607020001_remove_free_trial_entitlement_limits.sql | no_static_objects | n/a |
| 202607070001 | pure_local_only | workspace_platform | 202607070001_drop_demo_all_rls_grants.sql | no_static_objects | n/a |
| 202607080007 | pure_local_only | workspace_platform | 202607080007_profile_settings_metadata.sql | no_static_objects | n/a |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 451 |
| Catalog rows returned | 451 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-16031.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Split ledger rows should be investigated before broad migration operations; pure local-only rows need module smoke evidence before any further `migration repair`.

