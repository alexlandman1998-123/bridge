# Supabase Phase 8 Closeout Report

Generated: 2026-09-14T16:51:42.152Z
Production project: `isdowlnollckzvltkasn`

## Decision

**Status: CLOSEOUT_BLOCKED**

The Phase 0 broad-push freeze remains active unless this report says `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`. Even a ready report authorizes a reviewed guard-removal change; it does not remove the guard automatically.

## Gate Summary

| Check | Result |
| --- | --- |
| Local migration files | 1159 |
| Phase 5 manifest rows | 24 |
| Duplicate versions | 0 |
| Missing manifest files | 0 |
| Complete production evidence rows | 0 |
| Incomplete production evidence rows | 24 |
| Production recovery evidence locked | Yes |
| Production recovery evidence blockers | 0 |
| Unknown evidence rows | 6 |
| Duplicate evidence versions | 0 |
| Ledger drift resolution loaded | Yes |
| Ledger drift resolution status | LEDGER_DRIFT_BLOCKED |
| Ledger drift resolution blockers | 28 |
| Live verification performed | Yes |
| Pure local-only versions | 24 |
| Pure remote-only versions | 4 |
| Divergent versions | 0 |
| Unreviewed split versions | 0 |
| Production PITR | Disabled |
| Physical backups | 8 |
| Ready for reviewed freeze retirement | No |

## Incomplete Evidence Versions

- `20260913120000`
- `20260913123000`
- `20260913130000`
- `20260913163747`
- `20260913164108`
- `20260913164657`
- `20260913164842`
- `20260913165354`
- `20260913174500`
- `20260913182014`
- `20260913182312`
- `20260913184108`
- `20260913185826`
- `20260913190000`
- `20260913191403`
- `20260913193410`
- `20260913195118`
- `20260913200000`
- `20260913210000`
- `20260914073546`
- `20260914073806`
- `20260914080412`
- `20260914080640`
- `20260914083450`

## Recovery Evidence Blockers

- None

## Evidence By Stream

| Stream | Rows | Complete Evidence | Incomplete Evidence | Actions |
| --- | --- | --- | --- | --- |
| `other` | 24 | 0 | 24 | `apply_original_after_dependency_check`<br>`repair_only_after_smoke` |

## Closeout Work Queue

| Version | Stream | Evidence | Action | Object Status | File |
| --- | --- | --- | --- | --- | --- |
| `20260913120000` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260913120000_rental_application_approval_readiness.sql` |
| `20260913123000` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913123000_rental_lease_version_seed_for_conversions.sql` |
| `20260913130000` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260913130000_rental_notice_acknowledgement_transition.sql` |
| `20260913163747` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913163747_transaction_fee_control_phase1.sql` |
| `20260913164108` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913164108_property24_statistics_analytics_foundation.sql` |
| `20260913164657` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913164657_property24_marketing_analytics_read_model.sql` |
| `20260913164842` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913164842_transaction_fee_control_phase3_invoice_queue.sql` |
| `20260913165354` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913165354_property24_listing_performance_drilldown.sql` |
| `20260913174500` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913174500_transaction_fee_control_phase2_attorney_receipt.sql` |
| `20260913182014` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913182014_fica_access_controls_phase6.sql` |
| `20260913182312` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913182312_website_blog_structured_blocks_phase1.sql` |
| `20260913184108` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913184108_website_blog_media_listing_blocks_phase2.sql` |
| `20260913185826` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913185826_website_blog_release2_media_operations.sql` |
| `20260913190000` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913190000_fica_declaration_canonical_pack_phase3.sql` |
| `20260913191403` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913191403_website_blog_listing_block_position.sql` |
| `20260913193410` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913193410_website_blog_release3_publishing_polish.sql` |
| `20260913195118` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913195118_website_blog_slug_redirect_trigger.sql` |
| `20260913200000` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913200000_knowledge_factory_fica_verification_handoff_phase4.sql` |
| `20260913210000` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260913210000_fica_compliance_certificate_phase5.sql` |
| `20260914073546` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260914073546_email_sending_domains_phase1.sql` |
| `20260914073806` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260914073806_email_sending_domain_guard_fix_phase1.sql` |
| `20260914080412` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260914080412_email_sending_approval_phase5.sql` |
| `20260914080640` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260914080640_email_sending_operator_console_phase6.sql` |
| `20260914083450` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260914083450_website_preview_hostname_allowlist_fix.sql` |

## Closeout Rule

Do not remove `scripts/supabase-phase0-guard.mjs`, its CI enforcement, or the broad-push freeze until all local and live checks pass, all 24 manifest versions have reviewed closeout evidence, and production recovery is available and tested.
