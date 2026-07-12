# Supabase Migration Phase 1 Reconciliation Report

Generated: 2026-07-12T20:28:39.580Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 1 is read-only. This report is built from the local migration directory, `supabase migration list --linked`, and catalog-only SQL checks. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Executive Summary

| Metric | Value |
| --- | --- |
| Local migration files | 336 |
| Duplicate local timestamps | 0 |
| Remote ledger rows fetched | 353 |
| Remote matched rows | 241 |
| Remote-only rows | 17 |
| Local-only rows in CLI comparison | 95 |
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
| matched | 241 |
| remote-only | 17 |
| local-only | 95 |
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
- 202606150001
- 202606160001
- 202606160002
- 202606170001
- 202606170004
- 202606190002
- 202606190003
- 202606190004
- 202606200001
- 202606200002
- 202606200003
- 202606200004
- 202606210001
- 202606210002
- 202606210003
- 202606210004
- 202606220002
- 202606220003
- 202606230001
- 202606240001
- 202606240002
- 202606260001
- 202606260002
- 202606260003
- 202606260004
- 202606280003
- 202606290006
- 202606290010
- 202606290014
- 202606290015
- 202606290016
- 202606290017
- 202606290018
- 202606290019
- 202606300001
- 202606300002
- 202606300003
- 202606300004
- 202606300005
- 202606300006
- 202606300007
- 202606300008
- 202607010001
- 202607010002
- 202607010003
- 202607010004
- 202607020001
- 202607050001
- 202607050002
- 202607050003
- 202607050004
- 202607050005
- 202607050006
- 202607050007
- 202607050008
- 202607050009
- 202607050010
- 202607060001
- 202607060002
- 202607060003
- 202607060004
- 202607070001
- 202607080001
- 202607080002
- 202607080003
- 202607080004
- 202607080005
- 202607080006
- 202607080007
- 202607080008
- 202607080009
- 202607090001
- 202607090002
- 202607090003
- 202607090004
- 202607090005
- 202607090006
- 202607090007

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
| npx supabase migration list --linked --output-format json | ok | 353 | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | 17 | Initialising login role... |

## Live Check SQL Fingerprint

- File: `sql/supabase-phase1-live-object-checks.sql`
- Bytes: 5673

