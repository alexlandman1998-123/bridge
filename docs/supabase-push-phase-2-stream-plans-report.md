# Supabase Push Phase 2 Stream Plans Report

Generated: 2026-09-14T16:56:44.004Z

## Scope

Phase 2 runs every staging stream plan from the current manifest. It is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Manifest rows | 25 |
| Planned rows | 25 |
| Approved corrective substitutions | 0 |
| Streams | 8 |

## Streams

| Stream | Rows | Actions |
| --- | --- | --- |
| `rental_readiness` | 3 | `repair_only_after_smoke`: 2<br>`apply_original_after_dependency_check`: 1 |
| `document_configuration` | 2 | `apply_original_after_dependency_check`: 1<br>`manual_data_review`: 1 |
| `fica_compliance` | 3 | `apply_original_after_dependency_check`: 3 |
| `transaction_fee_controls` | 3 | `apply_original_after_dependency_check`: 3 |
| `property24_analytics` | 3 | `apply_original_after_dependency_check`: 3 |
| `website_blog` | 6 | `apply_original_after_dependency_check`: 6 |
| `email_delivery` | 4 | `repair_only_after_smoke`: 4 |
| `website_operations` | 1 | `repair_only_after_smoke`: 1 |

## Work Queue

| Version | Stream | Depends On | Action | Object Status | File |
| --- | --- | --- | --- | --- | --- |
| `20260913120000` | `rental_readiness` | `rental baseline preflight` | `repair_only_after_smoke` | `all_live` | `20260913120000_rental_application_approval_readiness.sql` |
| `20260913123000` | `rental_readiness` | `20260913120000` | `apply_original_after_dependency_check` | `none_live` | `20260913123000_rental_lease_version_seed_for_conversions.sql` |
| `20260913130000` | `rental_readiness` | `20260913123000` | `repair_only_after_smoke` | `all_live` | `20260913130000_rental_notice_acknowledgement_transition.sql` |
| `20260913190000` | `document_configuration` | `document-pack baseline preflight` | `apply_original_after_dependency_check` | `no_static_objects` | `20260913190000_fica_declaration_canonical_pack_phase3.sql` |
| `20260914165606` | `document_configuration` | `20260913190000` | `manual_data_review` | `no_static_objects` | `20260914165606_fica_declaration_canonical_pack_activate_rules.sql` |
| `20260913182014` | `fica_compliance` | `FICA case baseline preflight` | `apply_original_after_dependency_check` | `partial_live` | `20260913182014_fica_access_controls_phase6.sql` |
| `20260913200000` | `fica_compliance` | `20260913182014` | `apply_original_after_dependency_check` | `none_live` | `20260913200000_knowledge_factory_fica_verification_handoff_phase4.sql` |
| `20260913210000` | `fica_compliance` | `20260913200000` | `apply_original_after_dependency_check` | `none_live` | `20260913210000_fica_compliance_certificate_phase5.sql` |
| `20260913163747` | `transaction_fee_controls` | `transaction-fee baseline preflight` | `apply_original_after_dependency_check` | `none_live` | `20260913163747_transaction_fee_control_phase1.sql` |
| `20260913164842` | `transaction_fee_controls` | `20260913163747` | `apply_original_after_dependency_check` | `none_live` | `20260913164842_transaction_fee_control_phase3_invoice_queue.sql` |
| `20260913174500` | `transaction_fee_controls` | `20260913164842` | `apply_original_after_dependency_check` | `none_live` | `20260913174500_transaction_fee_control_phase2_attorney_receipt.sql` |
| `20260913164108` | `property24_analytics` | `Property24 baseline preflight` | `apply_original_after_dependency_check` | `none_live` | `20260913164108_property24_statistics_analytics_foundation.sql` |
| `20260913164657` | `property24_analytics` | `20260913164108` | `apply_original_after_dependency_check` | `none_live` | `20260913164657_property24_marketing_analytics_read_model.sql` |
| `20260913165354` | `property24_analytics` | `20260913164657` | `apply_original_after_dependency_check` | `none_live` | `20260913165354_property24_listing_performance_drilldown.sql` |
| `20260913182312` | `website_blog` | `website-blog baseline preflight` | `apply_original_after_dependency_check` | `partial_live` | `20260913182312_website_blog_structured_blocks_phase1.sql` |
| `20260913184108` | `website_blog` | `20260913182312` | `apply_original_after_dependency_check` | `none_live` | `20260913184108_website_blog_media_listing_blocks_phase2.sql` |
| `20260913185826` | `website_blog` | `20260913184108` | `apply_original_after_dependency_check` | `partial_live` | `20260913185826_website_blog_release2_media_operations.sql` |
| `20260913191403` | `website_blog` | `20260913185826` | `apply_original_after_dependency_check` | `none_live` | `20260913191403_website_blog_listing_block_position.sql` |
| `20260913193410` | `website_blog` | `20260913191403` | `apply_original_after_dependency_check` | `partial_live` | `20260913193410_website_blog_release3_publishing_polish.sql` |
| `20260913195118` | `website_blog` | `20260913193410` | `apply_original_after_dependency_check` | `none_live` | `20260913195118_website_blog_slug_redirect_trigger.sql` |
| `20260914073546` | `email_delivery` | `email-delivery baseline preflight` | `repair_only_after_smoke` | `all_live` | `20260914073546_email_sending_domains_phase1.sql` |
| `20260914073806` | `email_delivery` | `20260914073546` | `repair_only_after_smoke` | `all_live` | `20260914073806_email_sending_domain_guard_fix_phase1.sql` |
| `20260914080412` | `email_delivery` | `20260914073806` | `repair_only_after_smoke` | `all_live` | `20260914080412_email_sending_approval_phase5.sql` |
| `20260914080640` | `email_delivery` | `20260914080412` | `repair_only_after_smoke` | `all_live` | `20260914080640_email_sending_operator_console_phase6.sql` |
| `20260914083450` | `website_operations` | `website-hostname baseline preflight` | `repair_only_after_smoke` | `all_live` | `20260914083450_website_preview_hostname_allowlist_fix.sql` |

## Next Step

Use the action on each row to decide the phase 3 work:

- `apply_original_after_dependency_check`: apply that single file to staging after preflight.
- `repair_only_after_smoke`: do not apply SQL; run smoke checks, then record staging ledger.
- `corrective_migration_required`: create an idempotent corrective migration before staging execution.
- `manual_data_review`: verify intended data rows and idempotency before choosing apply or repair.
