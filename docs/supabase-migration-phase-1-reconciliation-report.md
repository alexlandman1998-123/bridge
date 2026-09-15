# Supabase Migration Phase 1 Reconciliation Report

Generated: 2026-09-14T16:25:01.829Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 1 is read-only. This report is built from the local migration directory, `supabase migration list --linked`, and catalog-only SQL checks. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Executive Summary

| Metric | Value |
| --- | --- |
| Local migration files | 1159 |
| Duplicate local timestamps | 0 |
| Remote ledger rows fetched | 1163 |
| Remote matched rows | 1135 |
| Remote-only rows | 4 |
| Local-only rows in CLI comparison | 24 |
| Split local/remote versions | 0 |
| Live onboarding object checks ready | 17/17 |

## Onboarding Critical Matrix

| Version | Migration | Local file | Remote ledger | Live objects | Next action |
| --- | --- | --- | --- | --- | --- |
| 202605240010 | atomic workspace onboarding | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606040001 | role-contract onboarding wrapper | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606170002 | principal claim invite RPC | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606170003 | principal claim completion RPC | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606190001 | email-claim onboarding repair | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202607020002 | principal-claim invite RLS hardening | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202607120002 | branch-scope onboarding fix | 1 file | recorded applied | ready | No Phase 2 object patch needed. |

## Phase 2 Queue

No onboarding-critical live-object patch is currently indicated by the Phase 1 checks.

## Phase 3 Ledger Repair Candidates

No onboarding-critical ledger repair candidate was identified from the current checks.

## Duplicate Local Migration Timestamps

No duplicate local migration timestamps detected.

## Remote Ledger Comparison

| Bucket | Count |
| --- | --- |
| matched | 1135 |
| remote-only | 4 |
| local-only | 24 |
| divergent | 0 |
| split versions | 0 |

### Split Versions

- none

### Remote-Only Rows

- 20260914073732
- 20260914073827
- 20260914080521
- 20260914080747

### Local-Only Rows

- 20260913120000
- 20260913123000
- 20260913130000
- 20260913163747
- 20260913164108
- 20260913164657
- 20260913164842
- 20260913165354
- 20260913174500
- 20260913182014
- 20260913182312
- 20260913184108
- 20260913185826
- 20260913190000
- 20260913191403
- 20260913193410
- 20260913195118
- 20260913200000
- 20260913210000
- 20260914073546
- 20260914073806
- 20260914080412
- 20260914080640
- 20260914083450

## Live Onboarding Object Checks

| Check | Type | Ready | Live exists | Expected |
| --- | --- | --- | --- | --- |
| invites_principal_claim_type_constraint | constraint | yes | yes | invites_invite_type_check |
| workspace_preference_principal_claim_source_constraint | constraint | yes | yes | user_workspace_preferences_source_check |
| principal_claim_completion_rpc | function | yes | yes | bridge_complete_principal_claim_onboarding(payload jsonb) |
| principal_claim_invite_rpc | function | yes | yes | bridge_create_principal_claim_invite(payload jsonb) |
| principal_claim_sync_trigger_function | function | yes | yes | bridge_sync_principal_claim_membership() |
| workspace_onboarding_legacy_rpc | function | yes | yes | bridge_complete_workspace_onboarding_legacy_20260524(payload jsonb) |
| workspace_onboarding_rpc | function | yes | yes | bridge_complete_workspace_onboarding(payload jsonb) |
| workspace_onboarding_branch_scope_fix | function_body | yes | yes | bridge_complete_workspace_onboarding handles null branch_scope |
| workspace_repair_email_claim_function | function_body | yes | yes | bridge_repair_workspace_onboarding includes email-claim repair body |
| invites_insert_member_fallback_policy | policy | yes | yes | invites_insert_active_workspace_member_fallback |
| invites_insert_workspace_admin_policy | policy | yes | yes | invites_insert_workspace_admin |
| organisation_users_principal_claim_select_policy | policy | yes | yes | organisation_users_agency_select |
| organisations_principal_claim_select_policy | policy | yes | yes | organisations_agency_select |
| invites_table | table | yes | yes | invites exists |
| onboarding_states_table | table | yes | yes | onboarding_states exists |
| workspace_onboarding_completions_table | table | yes | yes | workspace_onboarding_completions exists |
| principal_claim_sync_trigger | trigger | yes | yes | trg_bridge_sync_principal_claim_membership |

## Command Evidence

| Command | Status | Parsed rows | Notes |
| --- | --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | 1163 | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | 17 | Initialising login role... |

## Live Check SQL Fingerprint

- File: `sql/supabase-phase1-live-object-checks.sql`
- Bytes: 5673

