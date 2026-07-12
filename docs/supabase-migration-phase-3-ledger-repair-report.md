# Supabase Migration Phase 3 Ledger Repair Report

Generated: 2026-07-12T20:03:04.594Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 3 updates only the Supabase migration history for onboarding-critical migrations that Phase 1 and Phase 2 proved are already live. It does not run `db push`, `db reset`, schema migrations, or data-changing application SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | REPAIRED |
| Recommendation | Phase 3 ledger repair is complete for onboarding-critical migrations. Rerun Phase 1 and Phase 2 as the final evidence refresh. |
| Apply mode | yes |
| Versions targeted | 202606170002, 202606170003, 202606190001, 202607020002, 202607120002 |
| Evidence ready | yes |
| Duplicate local timestamps still present | 6 |

## Candidate Matrix

| Version | Migration | Local file | Before ledger | After ledger | Evidence |
| --- | --- | --- | --- | --- | --- |
| 202606170002 | principal claim invite RPC | present | not recorded | recorded applied | principal_claim_invite_rpc, invites_principal_claim_type_constraint |
| 202606170003 | principal claim completion RPC | present | not recorded | recorded applied | principal_claim_completion_rpc, principal_claim_sync_trigger_function, principal_claim_sync_trigger, workspace_preference_principal_claim_source_constraint |
| 202606190001 | email-claim onboarding repair | present | not recorded | recorded applied | workspace_repair_email_claim_function |
| 202607020002 | principal-claim invite RLS hardening | present | not recorded | recorded applied | invites_insert_workspace_admin_policy, invites_insert_member_fallback_policy |
| 202607120002 | branch-scope onboarding fix | present | not recorded | recorded applied | workspace_onboarding_branch_scope_fix |

## Evidence Gate

| Gate | Status | Details |
| --- | --- | --- |
| Local migration files | PASS | all present |
| Live object evidence | PASS | all candidate evidence keys ready |
| Behavior evidence | PASS | all behavior checks ready |

## Duplicate Local Timestamp Warning

These duplicate local timestamps are still outside the onboarding-critical repair batch and must be handled in a later phase:

| Version | Files |
| --- | --- |
| 202606160001 | 202606160001_backfill_signed_mandate_private_listings.sql, 202606160001_commercial_landlord_onboarding_workspace.sql |
| 202606220002 | 202606220002_admin_mobile_dashboard_events.sql, 202606220002_seller_portal_password_access_phase3.sql |
| 202606280001 | 202606280001_commercial_bulk_import_audit_phase2.sql, 202606280001_demo_enquiries.sql |
| 202606290005 | 202606290005_lead_email_capture_phase1.sql, 202606290005_transaction_reservation_commercial_terms.sql |
| 202607090002 | 202607090002_attorney_incoming_instruction_sync.sql, 202607090002_private_listing_mandate_status_alignment.sql |
| 202607120001 | 202607120001_agency_default_legal_template_starters.sql, 202607120001_canonical_document_verification_snapshot_scoped.sql |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | Initialising login role... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase2-onboarding-behavior-checks.sql --output-format json | ok | Initialising login role... |
| npx supabase migration repair --linked --status applied 202606170002 202606170003 202606190001 202607020002 202607120002 | ok | Initialising login role... Connecting to remote database... Repaired migration history: [202606170002 202606170003 202606190001 202607020002 202607120002] => applied |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |

## Next Step

Regenerate Phase 1 and Phase 2 reports. Phase 1 should show the five onboarding-critical migrations as recorded applied, and Phase 2 should remain `READY_FOR_PHASE_3`.

