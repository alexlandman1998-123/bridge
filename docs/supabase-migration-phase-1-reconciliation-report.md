# Supabase Migration Phase 1 Reconciliation Report

Generated: 2026-08-14T12:12:26.421Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 1 is read-only. This report is built from the local migration directory, `supabase migration list --linked`, and catalog-only SQL checks. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Executive Summary

| Metric | Value |
| --- | --- |
| Local migration files | 681 |
| Duplicate local timestamps | 0 |
| Remote ledger rows fetched | 698 |
| Remote matched rows | 653 |
| Remote-only rows | 17 |
| Local-only rows in CLI comparison | 28 |
| Split local/remote versions | 17 |
| Live onboarding object checks ready | 15/17 |

## Onboarding Critical Matrix

| Version | Migration | Local file | Remote ledger | Live objects | Next action |
| --- | --- | --- | --- | --- | --- |
| 202605240010 | atomic workspace onboarding | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606040001 | role-contract onboarding wrapper | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606170002 | principal claim invite RPC | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606170003 | principal claim completion RPC | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606190001 | email-claim onboarding repair | 1 file | recorded applied | missing: workspace_repair_email_claim_function | Phase 2 candidate: inspect or restore missing live object(s). |
| 202607020002 | principal-claim invite RLS hardening | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202607120002 | branch-scope onboarding fix | 1 file | recorded applied | missing: workspace_onboarding_branch_scope_fix | Phase 2 candidate: inspect or restore missing live object(s). |

## Phase 2 Queue

These items need live-object investigation before any ledger repair:

| Version | Migration | Missing checks |
| --- | --- | --- |
| 202606190001 | email-claim onboarding repair | workspace_repair_email_claim_function |
| 202607120002 | branch-scope onboarding fix | workspace_onboarding_branch_scope_fix |

## Phase 3 Ledger Repair Candidates

No onboarding-critical ledger repair candidate was identified from the current checks.

## Duplicate Local Migration Timestamps

No duplicate local migration timestamps detected.

## Remote Ledger Comparison

| Bucket | Count |
| --- | --- |
| matched | 653 |
| remote-only | 17 |
| local-only | 28 |
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
- 202607310007
- 202607310008
- 202608130007
- 202608130012
- 202608140001
- 202608140002
- 202608140003
- 202608140004
- 202608140005
- 202608140006
- 202608140007

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
| workspace_onboarding_branch_scope_fix | function_body | no | yes | bridge_complete_workspace_onboarding handles null branch_scope |
| workspace_repair_email_claim_function | function_body | no | yes | bridge_repair_workspace_onboarding includes email-claim repair body |
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
| npx supabase migration list --linked --output-format json | ok | 698 | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | 17 | Initialising login role... |

## Live Check SQL Fingerprint

- File: `sql/supabase-phase1-live-object-checks.sql`
- Bytes: 5673

