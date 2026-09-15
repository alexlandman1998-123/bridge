# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-09-14T17:21:59.348Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 1161 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 1139 |
| Split local/remote versions | 0 |
| Reviewed split baseline | 0 |
| Unreviewed split versions | 0 |
| Pure local-only rows | 22 |
| Pure remote-only rows | 4 |
| Application manifest rows | 22 |
| Extracted objects checked | 82 |

## Module Summary

| Module | Pure Local-Only | Split Rows | Unreviewed Split | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| other | 12 | 0 | 0 | 2 | 3 | 6 | 1 | Needs object-level review; do not repair as a batch yet. |
| notification_automation | 4 | 0 | 0 | 4 | 0 | 0 | 0 | Candidate for reviewed ledger repair after module smoke evidence. |
| lead_capture_crm | 3 | 0 | 0 | 0 | 0 | 3 | 0 | Needs object-level review; do not repair as a batch yet. |
| transaction_network | 3 | 0 | 0 | 0 | 0 | 3 | 0 | Needs object-level review; do not repair as a batch yet. |

## Split Ledger Rows

No split local/remote versions detected.

## Reviewed Repair Candidates

These pure local-only migrations have all statically extracted objects present in the live catalog. They are candidates for later reviewed ledger repair only after module smoke evidence:

| Version | Module | File | Objects Live |
| --- | --- | --- | --- |
| 20260914073546 | notification_automation | 20260914073546_email_sending_domains_phase1.sql | 8/8 |
| 20260914073806 | notification_automation | 20260914073806_email_sending_domain_guard_fix_phase1.sql | 1/1 |
| 20260914080412 | notification_automation | 20260914080412_email_sending_approval_phase5.sql | 4/4 |
| 20260914080640 | notification_automation | 20260914080640_email_sending_operator_console_phase6.sql | 2/2 |
| 20260913120000 | other | 20260913120000_rental_application_approval_readiness.sql | 1/1 |
| 20260914083450 | other | 20260914083450_website_preview_hostname_allowlist_fix.sql | 1/1 |

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 20260913165354 | lead_capture_crm | 20260913165354_property24_listing_performance_drilldown.sql | none_live | 0/1 |
| 20260913184108 | lead_capture_crm | 20260913184108_website_blog_media_listing_blocks_phase2.sql | none_live | 0/4 |
| 20260913191403 | lead_capture_crm | 20260913191403_website_blog_listing_block_position.sql | none_live | 0/1 |
| 20260913123000 | other | 20260913123000_rental_lease_version_seed_for_conversions.sql | none_live | 0/2 |
| 20260913164108 | other | 20260913164108_property24_statistics_analytics_foundation.sql | none_live | 0/11 |
| 20260913164657 | other | 20260913164657_property24_marketing_analytics_read_model.sql | none_live | 0/1 |
| 20260913182312 | other | 20260913182312_website_blog_structured_blocks_phase1.sql | partial_live | 1/2 |
| 20260913185826 | other | 20260913185826_website_blog_release2_media_operations.sql | partial_live | 1/7 |
| 20260913193410 | other | 20260913193410_website_blog_release3_publishing_polish.sql | partial_live | 1/6 |
| 20260913195118 | other | 20260913195118_website_blog_slug_redirect_trigger.sql | none_live | 0/2 |
| 20260913200000 | other | 20260913200000_knowledge_factory_fica_verification_handoff_phase4.sql | none_live | 0/6 |
| 20260913210000 | other | 20260913210000_fica_compliance_certificate_phase5.sql | none_live | 0/2 |
| 20260913163747 | transaction_network | 20260913163747_transaction_fee_control_phase1.sql | none_live | 0/9 |
| 20260913164842 | transaction_network | 20260913164842_transaction_fee_control_phase3_invoice_queue.sql | none_live | 0/8 |
| 20260913174500 | transaction_network | 20260913174500_transaction_fee_control_phase2_attorney_receipt.sql | none_live | 0/3 |

## Application Manifest

This is a conservative staging manifest, not authorization to apply SQL. `Depends On` expresses ordering within the inferred deployment stream; every stream still requires a live prerequisite check.

| Action | Count |
| --- | --- |
| apply_original_after_dependency_check | 15 |
| manual_data_review | 1 |
| repair_only_after_smoke | 6 |

| Version | Stream | Depends On | Module | File | Evidence | Action | Required Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20260913120000 | rental_readiness | rental baseline preflight | other | 20260913120000_rental_application_approval_readiness.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260913123000 | rental_readiness | 20260913120000 | other | 20260913123000_rental_lease_version_seed_for_conversions.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913200000 | fica_compliance | 20260913182014 | other | 20260913200000_knowledge_factory_fica_verification_handoff_phase4.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913210000 | fica_compliance | 20260913200000 | other | 20260913210000_fica_compliance_certificate_phase5.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913163747 | transaction_fee_controls | transaction-fee baseline preflight | transaction_network | 20260913163747_transaction_fee_control_phase1.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913164842 | transaction_fee_controls | 20260913163747 | transaction_network | 20260913164842_transaction_fee_control_phase3_invoice_queue.sql | none_live (0/8) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913174500 | transaction_fee_controls | 20260913164842 | transaction_network | 20260913174500_transaction_fee_control_phase2_attorney_receipt.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913164108 | property24_analytics | Property24 baseline preflight | other | 20260913164108_property24_statistics_analytics_foundation.sql | none_live (0/11) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913164657 | property24_analytics | 20260913164108 | other | 20260913164657_property24_marketing_analytics_read_model.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913165354 | property24_analytics | 20260913164657 | lead_capture_crm | 20260913165354_property24_listing_performance_drilldown.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913182312 | website_blog | website-blog baseline preflight | other | 20260913182312_website_blog_structured_blocks_phase1.sql | partial_live (1/2) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913184108 | website_blog | 20260913182312 | lead_capture_crm | 20260913184108_website_blog_media_listing_blocks_phase2.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913185826 | website_blog | 20260913184108 | other | 20260913185826_website_blog_release2_media_operations.sql | partial_live (1/7) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913191403 | website_blog | 20260913185826 | lead_capture_crm | 20260913191403_website_blog_listing_block_position.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913193410 | website_blog | 20260913191403 | other | 20260913193410_website_blog_release3_publishing_polish.sql | partial_live (1/6) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913195118 | website_blog | 20260913193410 | other | 20260913195118_website_blog_slug_redirect_trigger.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites and any overlapping-object provenance in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260914073546 | email_delivery | email-delivery baseline preflight | notification_automation | 20260914073546_email_sending_domains_phase1.sql | all_live (8/8) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260914073806 | email_delivery | 20260914073546 | notification_automation | 20260914073806_email_sending_domain_guard_fix_phase1.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260914080412 | email_delivery | 20260914073806 | notification_automation | 20260914080412_email_sending_approval_phase5.sql | all_live (4/4) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260914080640 | email_delivery | 20260914080412 | notification_automation | 20260914080640_email_sending_operator_console_phase6.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260914083450 | website_operations | website-hostname baseline preflight | other | 20260914083450_website_preview_hostname_allowlist_fix.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260914172028 | other | module baseline preflight | other | 20260914172028_fica_compliance_certificate_activate_rule.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 20260913165354 | pure_local_only | lead_capture_crm | 20260913165354_property24_listing_performance_drilldown.sql | none_live | 0/1 |
| 20260913184108 | pure_local_only | lead_capture_crm | 20260913184108_website_blog_media_listing_blocks_phase2.sql | none_live | 0/4 |
| 20260913191403 | pure_local_only | lead_capture_crm | 20260913191403_website_blog_listing_block_position.sql | none_live | 0/1 |
| 20260914073546 | pure_local_only | notification_automation | 20260914073546_email_sending_domains_phase1.sql | all_live | 8/8 |
| 20260914073806 | pure_local_only | notification_automation | 20260914073806_email_sending_domain_guard_fix_phase1.sql | all_live | 1/1 |
| 20260914080412 | pure_local_only | notification_automation | 20260914080412_email_sending_approval_phase5.sql | all_live | 4/4 |
| 20260914080640 | pure_local_only | notification_automation | 20260914080640_email_sending_operator_console_phase6.sql | all_live | 2/2 |
| 20260913120000 | pure_local_only | other | 20260913120000_rental_application_approval_readiness.sql | all_live | 1/1 |
| 20260913123000 | pure_local_only | other | 20260913123000_rental_lease_version_seed_for_conversions.sql | none_live | 0/2 |
| 20260913164108 | pure_local_only | other | 20260913164108_property24_statistics_analytics_foundation.sql | none_live | 0/11 |
| 20260913164657 | pure_local_only | other | 20260913164657_property24_marketing_analytics_read_model.sql | none_live | 0/1 |
| 20260913182312 | pure_local_only | other | 20260913182312_website_blog_structured_blocks_phase1.sql | partial_live | 1/2 |
| 20260913185826 | pure_local_only | other | 20260913185826_website_blog_release2_media_operations.sql | partial_live | 1/7 |
| 20260913193410 | pure_local_only | other | 20260913193410_website_blog_release3_publishing_polish.sql | partial_live | 1/6 |
| 20260913195118 | pure_local_only | other | 20260913195118_website_blog_slug_redirect_trigger.sql | none_live | 0/2 |
| 20260913200000 | pure_local_only | other | 20260913200000_knowledge_factory_fica_verification_handoff_phase4.sql | none_live | 0/6 |
| 20260913210000 | pure_local_only | other | 20260913210000_fica_compliance_certificate_phase5.sql | none_live | 0/2 |
| 20260914083450 | pure_local_only | other | 20260914083450_website_preview_hostname_allowlist_fix.sql | all_live | 1/1 |
| 20260914172028 | pure_local_only | other | 20260914172028_fica_compliance_certificate_activate_rule.sql | no_static_objects | n/a |
| 20260913163747 | pure_local_only | transaction_network | 20260913163747_transaction_fee_control_phase1.sql | none_live | 0/9 |
| 20260913164842 | pure_local_only | transaction_network | 20260913164842_transaction_fee_control_phase3_invoice_queue.sql | none_live | 0/8 |
| 20260913174500 | pure_local_only | transaction_network | 20260913174500_transaction_fee_control_phase2_attorney_receipt.sql | none_live | 0/3 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 82 |
| Catalog rows returned | 82 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-9580.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Any unreviewed split ledger row must be investigated first; reviewed baseline rows remain excluded from repair batches. Pure local-only rows need module smoke evidence before any `migration repair`.

