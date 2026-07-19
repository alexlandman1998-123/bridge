# Supabase Migration Phase 4 Duplicate Timestamp Report

Generated: 2026-07-18T21:46:06.210Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 4 is local migration-file hygiene. It resolves duplicate local migration timestamps by renaming the duplicate files to unused timestamp slots. It does not run `db push`, `db reset`, `migration repair`, or any remote database command.

## Decision

| Field | Value |
| --- | --- |
| Status | DEDUPED |
| Local migration files | 487 |
| Duplicate local timestamps | 0 |
| Expected renames complete | 12/12 |

## Rename Map

| Old path | New path | Ready | Reason |
| --- | --- | --- | --- |
| supabase/migrations/202606160001_commercial_landlord_onboarding_workspace.sql | supabase/migrations/202606160002_commercial_landlord_onboarding_workspace.sql | yes | Resolved duplicate local version 202606160001. |
| supabase/migrations/202606220002_seller_portal_password_access_phase3.sql | supabase/migrations/202606220003_seller_portal_password_access_phase3.sql | yes | Resolved duplicate local version 202606220002. |
| supabase/migrations/202606280001_demo_enquiries.sql | supabase/migrations/202606280003_demo_enquiries.sql | yes | Kept the already matched 202606280001 migration stable and moved the duplicate to the next unused slot. |
| supabase/migrations/202606290005_transaction_reservation_commercial_terms.sql | supabase/migrations/202606290019_transaction_reservation_commercial_terms.sql | yes | Kept the already matched 202606290005 migration stable and moved the duplicate after the existing 202606290018 migration. |
| supabase/migrations/202607090002_private_listing_mandate_status_alignment.sql | supabase/migrations/202607090007_private_listing_mandate_status_alignment.sql | yes | Resolved duplicate local version 202607090002. |
| supabase/migrations/202607120001_canonical_document_verification_snapshot_scoped.sql | supabase/migrations/202607120003_canonical_document_verification_snapshot_scoped.sql | yes | Kept the already matched 202607120001 migration stable and moved the duplicate after 202607120002. |
| supabase/migrations/202607180025_attorney_calendar_phase4_rsvp_lifecycle.sql | supabase/migrations/202607180047_attorney_calendar_phase4_rsvp_lifecycle.sql | yes | Kept the remotely recorded attorney accounting migration at 202607180025 and moved calendar Phase 4 after the current minute-level migration range. |
| supabase/migrations/202607180025_document_generator_recovery_rehearsal_g4.sql | supabase/migrations/202607180048_document_generator_recovery_rehearsal_g4.sql | yes | Kept the remotely recorded attorney accounting migration at 202607180025 and started the moved document-generator sequence after calendar Phase 4. |
| supabase/migrations/202607180026_document_generator_least_privilege_h2.sql | supabase/migrations/202607180049_document_generator_least_privilege_h2.sql | yes | Kept attorney accounting Phase 1.2 at 202607180026 and preserved document-generator order after G4. |
| supabase/migrations/202607180027_document_generator_public_signer_surface_h4.sql | supabase/migrations/202607180050_document_generator_public_signer_surface_h4.sql | yes | Kept attorney accounting Phase 3.1 at 202607180027 and preserved document-generator order after H2. |
| supabase/migrations/202607180028_document_generator_concurrency_i1.sql | supabase/migrations/202607180051_document_generator_concurrency_i1.sql | yes | Kept attorney accounting Phase 3.2 at 202607180028 and preserved document-generator order after H4. |
| supabase/migrations/202607180032_document_generator_backpressure_i3.sql | supabase/migrations/202607180052_document_generator_backpressure_i3.sql | yes | Kept the remotely recorded attorney calendar Phase 5 migration at 202607180032 and preserved document-generator order after I1. |

## Duplicate Scan

No duplicate local migration timestamps remain.

## Next Step

Regenerate Phase 1 to refresh the migration matrix with unique local versions. Remote ledger drift still remains for non-onboarding modules and should be handled in later phases.

