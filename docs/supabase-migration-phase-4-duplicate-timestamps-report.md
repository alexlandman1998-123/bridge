# Supabase Migration Phase 4 Duplicate Timestamp Report

Generated: 2026-07-12T20:10:59.979Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 4 is local migration-file hygiene. It resolves duplicate local migration timestamps by renaming the duplicate files to unused timestamp slots. It does not run `db push`, `db reset`, `migration repair`, or any remote database command.

## Decision

| Field | Value |
| --- | --- |
| Status | DEDUPED |
| Local migration files | 336 |
| Duplicate local timestamps | 0 |
| Expected renames complete | 6/6 |

## Rename Map

| Old path | New path | Ready | Reason |
| --- | --- | --- | --- |
| supabase/migrations/202606160001_commercial_landlord_onboarding_workspace.sql | supabase/migrations/202606160002_commercial_landlord_onboarding_workspace.sql | yes | Resolved duplicate local version 202606160001. |
| supabase/migrations/202606220002_seller_portal_password_access_phase3.sql | supabase/migrations/202606220003_seller_portal_password_access_phase3.sql | yes | Resolved duplicate local version 202606220002. |
| supabase/migrations/202606280001_demo_enquiries.sql | supabase/migrations/202606280003_demo_enquiries.sql | yes | Kept the already matched 202606280001 migration stable and moved the duplicate to the next unused slot. |
| supabase/migrations/202606290005_transaction_reservation_commercial_terms.sql | supabase/migrations/202606290019_transaction_reservation_commercial_terms.sql | yes | Kept the already matched 202606290005 migration stable and moved the duplicate after the existing 202606290018 migration. |
| supabase/migrations/202607090002_private_listing_mandate_status_alignment.sql | supabase/migrations/202607090007_private_listing_mandate_status_alignment.sql | yes | Resolved duplicate local version 202607090002. |
| supabase/migrations/202607120001_canonical_document_verification_snapshot_scoped.sql | supabase/migrations/202607120003_canonical_document_verification_snapshot_scoped.sql | yes | Kept the already matched 202607120001 migration stable and moved the duplicate after 202607120002. |

## Duplicate Scan

No duplicate local migration timestamps remain.

## Next Step

Regenerate Phase 1 to refresh the migration matrix with unique local versions. Remote ledger drift still remains for non-onboarding modules and should be handled in later phases.

