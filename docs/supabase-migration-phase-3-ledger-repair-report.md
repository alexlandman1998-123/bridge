# Supabase Migration Phase 3 Ledger Repair Report

Generated: 2026-08-14T12:23:40.597Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 3 updates only the Supabase migration history for onboarding-critical migrations that Phase 1 and Phase 2 proved are already live. It does not run `db push`, `db reset`, schema migrations, or data-changing application SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | NOOP_ALREADY_REPAIRED |
| Recommendation | No repair was needed; all Phase 3 candidates are already recorded applied. |
| Apply mode | no |
| Versions targeted | none |
| Evidence ready | yes |
| Duplicate local timestamps still present | 0 |

## Candidate Matrix

| Version | Migration | Local file | Before ledger | After ledger | Evidence |
| --- | --- | --- | --- | --- | --- |
| 202606170002 | principal claim invite RPC | present | recorded applied | recorded applied | principal_claim_invite_rpc, invites_principal_claim_type_constraint |
| 202606170003 | principal claim completion RPC | present | recorded applied | recorded applied | principal_claim_completion_rpc, principal_claim_sync_trigger_function, principal_claim_sync_trigger, workspace_preference_principal_claim_source_constraint |
| 202606190001 | email-claim onboarding repair | present | recorded applied | recorded applied | workspace_repair_email_claim_function |
| 202607020002 | principal-claim invite RLS hardening | present | recorded applied | recorded applied | invites_insert_workspace_admin_policy, invites_insert_member_fallback_policy |
| 202607120002 | branch-scope onboarding fix | present | recorded applied | recorded applied | workspace_onboarding_branch_scope_fix |

## Evidence Gate

| Gate | Status | Details |
| --- | --- | --- |
| Local migration files | PASS | all present |
| Live object evidence | PASS | all candidate evidence keys ready |
| Behavior evidence | PASS | all behavior checks ready |

## Duplicate Local Timestamp Warning

No duplicate local timestamps detected.

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | Initialising login role... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase2-onboarding-behavior-checks.sql --output-format json | ok | Initialising login role... |
| migration repair not run | skipped | plan mode |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |

## Next Step

Regenerate Phase 1 and Phase 2 reports. Phase 1 should show the five onboarding-critical migrations as recorded applied, and Phase 2 should remain `READY_FOR_PHASE_3`.

