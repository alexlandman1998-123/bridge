# Supabase Push Phase 1 Staging Prep Report

Generated: 2026-09-14T16:27:28.670Z

## Scope

Phase 1 prepares the staging evidence package for the migration push path. It does not apply SQL, repair any ledger, relink the Supabase project, or modify production.

## Outputs

- `docs/supabase-push-phase-1-staging-evidence-templates.json`
- `docs/supabase-push-phase-1-staging-prep-report.md`

## Manifest Summary

| Field | Value |
| --- | --- |
| Manifest rows | 24 |
| Runner-eligible rows | 19 |
| Blocked rows requiring corrective/manual work | 5 |

## Streams

| Stream | Rows |
| --- | --- |
| `other` | 24 |

## Actions

| Action | Rows |
| --- | --- |
| `apply_original_after_dependency_check` | 12 |
| `corrective_migration_required` | 4 |
| `manual_data_review` | 1 |
| `repair_only_after_smoke` | 7 |

## Runner Eligibility

| Eligibility | Rows |
| --- | --- |
| `blocked_create_corrective_migration` | 4 |
| `blocked_manual_data_review` | 1 |
| `staging_apply_then_record` | 12 |
| `staging_record_only_after_smoke` | 7 |

## Work Queue

| Version | Stream | Action | Object Status | Eligibility | File |
| --- | --- | --- | --- | --- | --- |
| `20260913120000` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260913120000_rental_application_approval_readiness.sql` |
| `20260913123000` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913123000_rental_lease_version_seed_for_conversions.sql` |
| `20260913130000` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260913130000_rental_notice_acknowledgement_transition.sql` |
| `20260913163747` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913163747_transaction_fee_control_phase1.sql` |
| `20260913164108` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913164108_property24_statistics_analytics_foundation.sql` |
| `20260913164657` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913164657_property24_marketing_analytics_read_model.sql` |
| `20260913164842` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913164842_transaction_fee_control_phase3_invoice_queue.sql` |
| `20260913165354` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913165354_property24_listing_performance_drilldown.sql` |
| `20260913174500` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913174500_transaction_fee_control_phase2_attorney_receipt.sql` |
| `20260913182014` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260913182014_fica_access_controls_phase6.sql` |
| `20260913182312` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260913182312_website_blog_structured_blocks_phase1.sql` |
| `20260913184108` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913184108_website_blog_media_listing_blocks_phase2.sql` |
| `20260913185826` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260913185826_website_blog_release2_media_operations.sql` |
| `20260913190000` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260913190000_fica_declaration_canonical_pack_phase3.sql` |
| `20260913191403` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913191403_website_blog_listing_block_position.sql` |
| `20260913193410` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260913193410_website_blog_release3_publishing_polish.sql` |
| `20260913195118` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913195118_website_blog_slug_redirect_trigger.sql` |
| `20260913200000` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913200000_knowledge_factory_fica_verification_handoff_phase4.sql` |
| `20260913210000` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260913210000_fica_compliance_certificate_phase5.sql` |
| `20260914073546` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260914073546_email_sending_domains_phase1.sql` |
| `20260914073806` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260914073806_email_sending_domain_guard_fix_phase1.sql` |
| `20260914080412` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260914080412_email_sending_approval_phase5.sql` |
| `20260914080640` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260914080640_email_sending_operator_console_phase6.sql` |
| `20260914083450` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260914083450_website_preview_hostname_allowlist_fix.sql` |

## Required Environment Before Applying

```bash
export SUPABASE_STAGING_PROJECT_REF='<staging-project-ref>'
export SUPABASE_STAGING_DB_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
export SUPABASE_STAGING_RECOVERY_CONFIRMED='I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
```

Use `scripts/supabase-phase6-staging-execution.mjs` for staging. Do not use broad `supabase db push`.
