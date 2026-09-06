# Supabase Migration Phase 1 Reconciliation Report

Generated: 2026-09-06T15:39:50.144Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 1 is read-only. This report is built from the local migration directory, `supabase migration list --linked`, and catalog-only SQL checks. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Executive Summary

| Metric | Value |
| --- | --- |
| Local migration files | 928 |
| Duplicate local timestamps | 0 |
| Remote ledger rows fetched | 992 |
| Remote matched rows | 832 |
| Remote-only rows | 64 |
| Local-only rows in CLI comparison | 96 |
| Split local/remote versions | 1 |
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
| matched | 832 |
| remote-only | 64 |
| local-only | 96 |
| divergent | 0 |
| split versions | 1 |

### Split Versions

- 202609030001

### Remote-Only Rows

- 20260817065106
- 20260820110704
- 20260827102952
- 20260827104611
- 20260827131153
- 20260827133621
- 20260827133842
- 20260827133951
- 20260827185146
- 20260828203637
- 20260829203552
- 20260829203648
- 20260829203735
- 20260829204144
- 20260829204623
- 20260829204840
- 20260829210157
- 20260830084850
- 20260830085317
- 20260830085705
- 20260830090204
- 20260830091124
- 20260830091652
- 20260830092741
- 20260830093509
- 20260830094123
- 20260830095017
- 20260830095430
- 20260830100753
- 20260830100807
- 20260830100936
- 20260830101115
- 20260830101259
- 20260830101318
- 20260830101846
- 20260830102633
- 20260830102724
- 20260830102811
- 20260830102846
- 20260830102937
- 20260830103810
- 20260830103913
- 20260830104159
- 20260830104242
- 20260830105816
- 20260830105908
- 20260830110749
- 20260830111228
- 20260830111659
- 20260830113004
- 20260830113531
- 20260830114448
- 20260831074851
- 20260831125342
- 20260831205101
- 20260902064058
- 20260902074632
- 20260902085246
- 202609030001
- 20260905173226
- 20260906112843
- 20260906112854
- 20260906113258
- 20260906113353

### Local-Only Rows

- 20260817174624
- 20260818203652
- 202608200001
- 202608200002
- 20260820160621
- 20260820174624
- 20260820192038
- 20260820192857
- 20260820193436
- 202608230001
- 202608230002
- 202608240001
- 20260824084233
- 20260824091732
- 20260824092531
- 202608250001
- 20260827081713
- 20260827083108
- 20260827091439
- 20260828203724
- 202608290001
- 202608290002
- 20260829103738
- 20260829105514
- 20260829111644
- 20260829112135
- 20260829112530
- 20260829195657
- 20260829204153
- 20260830125035
- 20260830160810
- 20260831071807
- 20260831072652
- 20260831120000
- 20260831131538
- 20260831140736
- 20260831150740
- 20260831153322
- 20260831190341
- 20260901075131
- 20260901110612
- 20260901140943
- 20260901143358
- 20260901145225
- 20260901165511
- 20260901170254
- 20260901170909
- 20260901174924
- 20260902074000
- 20260902085300
- 20260902095249
- 20260902105303
- 202609030001
- 20260903094624
- 20260903094957
- 20260903122031
- 20260903130012
- 20260905090353
- 20260905091122
- 20260905095152
- 20260905100612
- 20260905100908
- 20260905101301
- 20260905101931
- 20260905102430
- 20260905102813
- 20260905102934
- 20260905120250
- 20260905125639
- 20260905141005
- 20260905141007
- 20260905141008
- 20260905141009
- 20260905141010
- 20260905141011
- 20260905141012
- 20260905141013
- 20260905141014
- 20260905141015
- 20260905141016
- 20260905141017
- 20260905141018
- 20260905141019
- 20260905141020
- 20260905141021
- 20260905150420
- 20260906063435
- 20260906065759
- 20260906070515
- 20260906070938
- 20260906071644
- 20260906123000
- 20260906130000
- 20260906133000
- 20260906134500
- 20260906140000

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
| npx supabase migration list --linked --output-format json | ok | 992 | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | 17 | Initialising login role... |

## Live Check SQL Fingerprint

- File: `sql/supabase-phase1-live-object-checks.sql`
- Bytes: 5673

