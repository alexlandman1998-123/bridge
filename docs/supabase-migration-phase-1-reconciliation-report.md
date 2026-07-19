# Supabase Migration Phase 1 Reconciliation Report

Generated: 2026-07-18T21:46:19.472Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 1 is read-only. This report is built from the local migration directory, `supabase migration list --linked`, and catalog-only SQL checks. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Executive Summary

| Metric | Value |
| --- | --- |
| Local migration files | 487 |
| Duplicate local timestamps | 0 |
| Remote ledger rows fetched | 504 |
| Remote matched rows | 407 |
| Remote-only rows | 17 |
| Local-only rows in CLI comparison | 80 |
| Split local/remote versions | 17 |
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
| matched | 407 |
| remote-only | 17 |
| local-only | 80 |
| divergent | 0 |
| split versions | 17 |

### Split Versions

- 202606010001
- 202606030007
- 202606030008
- 202606030009
- 202606030010
- 202606030011
- 202606040001
- 202606040002
- 202606040004
- 202606040005
- 202606050001
- 202606080002
- 202606090010
- 202606110004
- 202606110005
- 202606110006
- 202606110007

### Remote-Only Rows

- 202606010001
- 202606030007
- 202606030008
- 202606030009
- 202606030010
- 202606030011
- 202606040001
- 202606040002
- 202606040004
- 202606040005
- 202606050001
- 202606080002
- 202606090010
- 202606110004
- 202606110005
- 202606110006
- 202606110007

### Local-Only Rows

- 202606010001
- 202606030007
- 202606030008
- 202606030009
- 202606030010
- 202606030011
- 202606040001
- 202606040002
- 202606040004
- 202606040005
- 202606050001
- 202606080002
- 202606090010
- 202606110004
- 202606110005
- 202606110006
- 202606110007
- 202607170016
- 202607170017
- 202607170018
- 202607170019
- 202607170020
- 202607170021
- 202607170022
- 202607170023
- 202607170024
- 202607170025
- 202607170026
- 202607170027
- 202607170028
- 202607170029
- 202607170030
- 202607170031
- 202607180001
- 202607180002
- 202607180003
- 202607180004
- 202607180005
- 202607180006
- 202607180007
- 202607180008
- 202607180009
- 202607180010
- 202607180011
- 202607180012
- 202607180013
- 202607180014
- 202607180015
- 202607180016
- 202607180017
- 202607180018
- 202607180019
- 202607180020
- 202607180021
- 202607180022
- 202607180023
- 202607180026
- 202607180027
- 202607180028
- 202607180029
- 202607180030
- 202607180031
- 202607180033
- 202607180034
- 202607180035
- 202607180036
- 202607180037
- 202607180038
- 202607180039
- 202607180040
- 202607180041
- 202607180042
- 202607180043
- 202607180046
- 202607180047
- 202607180048
- 202607180049
- 202607180050
- 202607180051
- 202607180052

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
| npx supabase migration list --linked --output-format json | ok | 504 | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | 17 | Initialising login role... |

## Live Check SQL Fingerprint

- File: `sql/supabase-phase1-live-object-checks.sql`
- Bytes: 5673

