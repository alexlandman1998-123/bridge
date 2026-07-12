# Supabase Migration Phase 2 Onboarding-Critical Report

Generated: 2026-07-12T20:04:31.283Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 2 validates onboarding-critical live objects and runtime visibility. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL. The SQL behavior checks call the onboarding RPCs only in unauthenticated mode, where they must return before writing data.

## Decision

| Field | Value |
| --- | --- |
| Status | READY_FOR_PHASE_3 |
| Recommendation | No Phase 2 onboarding object patch is needed. Continue to Phase 3 ledger repair planning. |
| Patch applied | no |
| Remote catalog fetched | yes |
| REST RPC probes run | yes |
| REST project ref | isdowlnollckzvltkasn |

## Summary

| Gate | Ready | Total | Failures |
| --- | --- | --- | --- |
| Local migration contracts | 3 | 3 | 0 |
| Live object catalog | 17 | 17 | 0 |
| Onboarding behavior contracts | 9 | 9 | 0 |
| PostgREST RPC visibility | 3 | 3 | 0 |

## Local Contract Checks

| Check | Ready | Expected | Observed | Details |
| --- | --- | --- | --- | --- |
| local_branch_scope_fix_migration | yes | branch_scope null guard migration exists locally | all local markers present | supabase/migrations/202607120002_fix_workspace_onboarding_branch_scope.sql |
| local_principal_claim_invite_migration | yes | principal claim invite RPC migration exists locally | all local markers present | supabase/migrations/202606170002_principal_claim_invites.sql |
| local_principal_claim_completion_migration | yes | principal claim completion RPC migration exists locally | all local markers present | supabase/migrations/202606170003_principal_claim_completion.sql |

## Live Object Catalog

| Check | Type | Ready | Expected | Details |
| --- | --- | --- | --- | --- |
| invites_principal_claim_type_constraint | constraint | yes | invites_invite_type_check | invites.invites_invite_type_check |
| workspace_preference_principal_claim_source_constraint | constraint | yes | user_workspace_preferences_source_check | user_workspace_preferences.user_workspace_preferences_source_check |
| principal_claim_completion_rpc | function | yes | bridge_complete_principal_claim_onboarding(payload jsonb) | public.bridge_complete_principal_claim_onboarding(jsonb) |
| principal_claim_invite_rpc | function | yes | bridge_create_principal_claim_invite(payload jsonb) | public.bridge_create_principal_claim_invite(jsonb) |
| principal_claim_sync_trigger_function | function | yes | bridge_sync_principal_claim_membership() | public.bridge_sync_principal_claim_membership() |
| workspace_onboarding_legacy_rpc | function | yes | bridge_complete_workspace_onboarding_legacy_20260524(payload jsonb) | public.bridge_complete_workspace_onboarding_legacy_20260524(jsonb) |
| workspace_onboarding_rpc | function | yes | bridge_complete_workspace_onboarding(payload jsonb) | public.bridge_complete_workspace_onboarding(jsonb) |
| workspace_onboarding_branch_scope_fix | function_body | yes | bridge_complete_workspace_onboarding handles null branch_scope | public.bridge_complete_workspace_onboarding(jsonb) |
| workspace_repair_email_claim_function | function_body | yes | bridge_repair_workspace_onboarding includes email-claim repair body | public.bridge_repair_workspace_onboarding(uuid) |
| invites_insert_member_fallback_policy | policy | yes | invites_insert_active_workspace_member_fallback | invites.invites_insert_active_workspace_member_fallback |
| invites_insert_workspace_admin_policy | policy | yes | invites_insert_workspace_admin | invites.invites_insert_workspace_admin |
| organisation_users_principal_claim_select_policy | policy | yes | organisation_users_agency_select | organisation_users.organisation_users_agency_select |
| organisations_principal_claim_select_policy | policy | yes | organisations_agency_select | organisations.organisations_agency_select |
| invites_table | table | yes | invites exists | public.invites |
| onboarding_states_table | table | yes | onboarding_states exists | public.onboarding_states |
| workspace_onboarding_completions_table | table | yes | workspace_onboarding_completions exists | public.workspace_onboarding_completions |
| principal_claim_sync_trigger | trigger | yes | trg_bridge_sync_principal_claim_membership | invites.trg_bridge_sync_principal_claim_membership |

## Onboarding Behavior Contracts

| Check | Type | Ready | Expected | Observed |
| --- | --- | --- | --- | --- |
| organisation_users_branch_scope_default | column_contract | yes | organisation_users.branch_scope defaults to own | 'own'::text |
| organisation_users_branch_scope_not_null | column_contract | yes | organisation_users.branch_scope is NOT NULL | NO |
| principal_claim_completion_authenticated_execute | function_privilege | yes | authenticated has EXECUTE | authenticated can execute |
| principal_claim_invite_authenticated_execute | function_privilege | yes | authenticated has EXECUTE | authenticated can execute |
| workspace_onboarding_authenticated_execute | function_privilege | yes | authenticated has EXECUTE | authenticated can execute |
| principal_claim_completion_unauth_contract | rpc_contract | yes | success=false; code=not_authenticated | not_authenticated |
| principal_claim_invite_unauth_contract | rpc_contract | yes | success=false; code=not_authenticated | not_authenticated |
| workspace_onboarding_unauth_contract | rpc_contract | yes | success=false; code=permission_denied | permission_denied |
| principal_claim_pending_membership_queryable | table_contract | yes | organisation_users supports pending principal-claim membership lookup | required columns present |

## PostgREST RPC Visibility

| Check | Ready | Expected | Observed | Details |
| --- | --- | --- | --- | --- |
| rest_bridge_complete_workspace_onboarding | yes | HTTP 200; success=false; code=permission_denied | HTTP 200; code=permission_denied | durationMs=779 |
| rest_bridge_create_principal_claim_invite | yes | HTTP 200; success=false; code=not_authenticated | HTTP 200; code=not_authenticated | durationMs=230 |
| rest_bridge_complete_principal_claim_onboarding | yes | HTTP 200; success=false; code=not_authenticated | HTTP 200; code=not_authenticated | durationMs=220 |

## Command Evidence

| Command | Status | Parsed rows | Notes |
| --- | --- | --- | --- |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | 17 | Initialising login role... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase2-onboarding-behavior-checks.sql --output-format json | ok | 9 | Initialising login role... |

## Phase 3 Handoff

Onboarding-critical functions, policies, constraints, and PostgREST RPC visibility are ready. The remaining onboarding-critical work is ledger-only: prepare a reviewed `migration repair --status applied` batch for the Phase 1 candidates.

