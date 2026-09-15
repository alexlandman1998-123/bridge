# Supabase Push Phase 3 Action Routing Report

Generated: 2026-09-14T16:56:58.729Z

## Scope

Phase 3 handles rows by action. It converts the phase 2 stream plans into explicit execution routes. This phase is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows | 25 |
| Runner-eligible rows | 25 |
| Blocked rows | 0 |
| SQL-allowed rows | 18 |
| Ledger-allowed rows | 25 |

## Actions

| Action | Rows |
| --- | --- |
| `apply_original_after_dependency_check` | 18 |
| `repair_only_after_smoke` | 7 |

## Routes

| Route | Rows |
| --- | --- |
| `apply_original` | 18 |
| `repair_only` | 7 |

## Work Queue

| Version | Stream | Action | Route | Blocked | SQL Allowed | Ledger Allowed | File |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20260913120000` | `rental_readiness` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260913120000_rental_application_approval_readiness.sql` |
| `20260913123000` | `rental_readiness` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913123000_rental_lease_version_seed_for_conversions.sql` |
| `20260913130000` | `rental_readiness` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260913130000_rental_notice_acknowledgement_transition.sql` |
| `20260913190000` | `document_configuration` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913190000_fica_declaration_canonical_pack_phase3.sql` |
| `20260914165606` | `document_configuration` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260914165606_fica_declaration_canonical_pack_activate_rules.sql` |
| `20260913182014` | `fica_compliance` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913182014_fica_access_controls_phase6.sql` |
| `20260913200000` | `fica_compliance` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913200000_knowledge_factory_fica_verification_handoff_phase4.sql` |
| `20260913210000` | `fica_compliance` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913210000_fica_compliance_certificate_phase5.sql` |
| `20260913163747` | `transaction_fee_controls` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913163747_transaction_fee_control_phase1.sql` |
| `20260913164842` | `transaction_fee_controls` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913164842_transaction_fee_control_phase3_invoice_queue.sql` |
| `20260913174500` | `transaction_fee_controls` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913174500_transaction_fee_control_phase2_attorney_receipt.sql` |
| `20260913164108` | `property24_analytics` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913164108_property24_statistics_analytics_foundation.sql` |
| `20260913164657` | `property24_analytics` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913164657_property24_marketing_analytics_read_model.sql` |
| `20260913165354` | `property24_analytics` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913165354_property24_listing_performance_drilldown.sql` |
| `20260913182312` | `website_blog` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913182312_website_blog_structured_blocks_phase1.sql` |
| `20260913184108` | `website_blog` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913184108_website_blog_media_listing_blocks_phase2.sql` |
| `20260913185826` | `website_blog` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913185826_website_blog_release2_media_operations.sql` |
| `20260913191403` | `website_blog` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913191403_website_blog_listing_block_position.sql` |
| `20260913193410` | `website_blog` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913193410_website_blog_release3_publishing_polish.sql` |
| `20260913195118` | `website_blog` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260913195118_website_blog_slug_redirect_trigger.sql` |
| `20260914073546` | `email_delivery` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260914073546_email_sending_domains_phase1.sql` |
| `20260914073806` | `email_delivery` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260914073806_email_sending_domain_guard_fix_phase1.sql` |
| `20260914080412` | `email_delivery` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260914080412_email_sending_approval_phase5.sql` |
| `20260914080640` | `email_delivery` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260914080640_email_sending_operator_console_phase6.sql` |
| `20260914083450` | `website_operations` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260914083450_website_preview_hostname_allowlist_fix.sql` |

## Commands

| Version | Command |
| --- | --- |
| `20260913120000` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913120000 --evidence docs/staging-evidence/20260913120000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913123000` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913123000 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913123000 --evidence docs/staging-evidence/20260913123000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913130000` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913130000 --evidence docs/staging-evidence/20260913130000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913190000` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913190000 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913190000 --evidence docs/staging-evidence/20260913190000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260914165606` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260914165606 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260914165606 --evidence docs/staging-evidence/20260914165606-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913182014` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913182014 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913182014 --evidence docs/staging-evidence/20260913182014-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913200000` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913200000 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913200000 --evidence docs/staging-evidence/20260913200000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913210000` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913210000 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913210000 --evidence docs/staging-evidence/20260913210000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913163747` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913163747 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913163747 --evidence docs/staging-evidence/20260913163747-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913164842` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913164842 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913164842 --evidence docs/staging-evidence/20260913164842-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913174500` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913174500 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913174500 --evidence docs/staging-evidence/20260913174500-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913164108` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913164108 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913164108 --evidence docs/staging-evidence/20260913164108-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913164657` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913164657 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913164657 --evidence docs/staging-evidence/20260913164657-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913165354` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913165354 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913165354 --evidence docs/staging-evidence/20260913165354-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913182312` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913182312 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913182312 --evidence docs/staging-evidence/20260913182312-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913184108` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913184108 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913184108 --evidence docs/staging-evidence/20260913184108-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913185826` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913185826 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913185826 --evidence docs/staging-evidence/20260913185826-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913191403` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913191403 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913191403 --evidence docs/staging-evidence/20260913191403-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913193410` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913193410 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913193410 --evidence docs/staging-evidence/20260913193410-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260913195118` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260913195118 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260913195118 --evidence docs/staging-evidence/20260913195118-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260914073546` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260914073546 --evidence docs/staging-evidence/20260914073546-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260914073806` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260914073806 --evidence docs/staging-evidence/20260914073806-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260914080412` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260914080412 --evidence docs/staging-evidence/20260914080412-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260914080640` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260914080640 --evidence docs/staging-evidence/20260914080640-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260914083450` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260914083450 --evidence docs/staging-evidence/20260914083450-other.json --confirm APPLY_TO_STAGING_ONLY` |

## Next Step

Phase 4 should prepare or collect reviewed staging evidence for the runner-eligible rows. Blocked rows need corrective migrations or manual data review before they can enter the runner path.
